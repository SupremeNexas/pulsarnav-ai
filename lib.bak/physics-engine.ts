/**
 * lib/physics-engine.ts
 *
 * Canonical spacecraft physics engine for PulsarNav AI.
 * =====================================================
 *
 * All orbital mechanics, coordinate transforms, noise models, and dispersion
 * physics used throughout the application live here. All other modules import
 * from this file. Do NOT re-implement these functions elsewhere.
 *
 * Physical models implemented:
 *  1. Vector arithmetic (add, sub, mult, dot, norm, dist)
 *  2. Seedable random number generators (LCG + Box-Muller)
 *  3. J₂-perturbed Earth gravity / heliocentric Sun gravity (gravityAcceleration)
 *  4. 4th-order Runge-Kutta orbit propagator (propagateRK4)
 *  5. Earth heliocentric position — simplified analytical ephemeris (earthPositionSsb)
 *  6. Interstellar dispersion delay (dispersionDelay)
 *  7. ECEF → ECI coordinate transform (eciFromGeodetic)
 *  8. Ground station ECI velocity (groundStationVelocityEci)
 *  9. Mission-specific initial conditions (getMissionInitialState)
 *
 * References:
 *  - Emadzadeh & Speyer (2011), Navigation in Space by X-ray Pulsars.
 *  - Montenbruck & Gill (2000), Satellite Orbits, Springer.
 *  - Vallado (2013), Fundamentals of Astrodynamics and Applications.
 */

// ─── Physical constants ────────────────────────────────────────────────────────
/** Earth gravitational parameter (km³/s²) */
export const MU_EARTH  = 398_600.4418;
/** Sun gravitational parameter (km³/s²) */
export const MU_SUN    = 1.32712440018e11;
/** Moon gravitational parameter (km³/s²) */
export const MU_MOON   = 4_902.8;
/** Earth equatorial radius (km) */
export const RE_EARTH  = 6_378.137;
/** Earth J₂ oblateness coefficient (dimensionless) */
export const J2_EARTH  = 1.08263e-3;
/** Speed of light (km/s) */
export const C_KM_S    = 299_792.458;
/** Astronomical unit (km) */
export const AU_KM     = 149_597_870.7;
/** Earth sidereal rotation rate (rad/s) */
export const W_EARTH   = 7.292115e-5;
/** Dispersion coefficient: 4.148808e3 s·MHz²/(pc·cm⁻³) */
export const COEFF_D   = 4.148808e3;

// ─── 3-vector type ────────────────────────────────────────────────────────────
export type Vec3 = [number, number, number];

// ─── Vector arithmetic ────────────────────────────────────────────────────────
export const vecAdd  = (a: Vec3, b: Vec3): Vec3 => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
export const vecSub  = (a: Vec3, b: Vec3): Vec3 => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
export const vecMult = (a: Vec3, s: number): Vec3 => [a[0]*s, a[1]*s, a[2]*s];
export const vecDot  = (a: Vec3, b: Vec3): number => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
export const vecNorm = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const vecDist = (a: Vec3, b: Vec3): number => Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);

// ─── Seeded random number generators ─────────────────────────────────────────

/**
 * Linear Congruential Generator (Numerical Recipes coefficients).
 * Deterministic and reproducible given the same seed.
 */
export function makeSeedRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = ((1_664_525 * s + 1_013_904_223) >>> 0);
    return s / 2 ** 32;
  };
}

/**
 * Box-Muller transform — returns a standard normal sample.
 * @param rng - Uniform [0,1) generator from makeSeedRng.
 */
export function gaussianSample(rng: () => number): number {
  const u1 = Math.max(rng(), 1e-15);
  const u2 = rng();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

// ─── Gravitational acceleration ───────────────────────────────────────────────

/**
 * Returns spacecraft gravitational acceleration vector (km/s²).
 *
 * For geocentric missions (LEO, GEO, Earth-Moon Transfer, Lunar Orbit, Lagrange):
 *   Uses Keplerian gravity + J₂ oblateness perturbation.
 *
 * For heliocentric missions (Earth-Mars Transfer, Deep Space Cruise):
 *   Uses Keplerian Sun gravity only.
 *
 * @param r - Position vector (km).
 * @param missionType - Mission label string.
 */
export function gravityAcceleration(r: Vec3, missionType: string): Vec3 {
  const isHeliocentric = missionType === "Earth-Mars Transfer" || missionType === "Deep Space Cruise";
  const isLunar        = missionType === "Lunar Orbit";

  const mu = isHeliocentric ? MU_SUN : isLunar ? MU_MOON : MU_EARTH;
  const rMag = vecNorm(r);
  const rMag3 = rMag ** 3;

  // Basic Keplerian term
  const aK: Vec3 = [
    -mu * r[0] / rMag3,
    -mu * r[1] / rMag3,
    -mu * r[2] / rMag3,
  ];

  // J₂ perturbation (Earth geocentric only)
  if (!isHeliocentric && !isLunar) {
    const zr      = r[2] / rMag;
    const factor  = 1.5 * J2_EARTH * (MU_EARTH / rMag ** 2) * (RE_EARTH / rMag) ** 2;
    return [
      aK[0] + factor * (5 * zr * zr - 1) * (r[0] / rMag),
      aK[1] + factor * (5 * zr * zr - 1) * (r[1] / rMag),
      aK[2] + factor * (5 * zr * zr - 3) * (r[2] / rMag),
    ];
  }

  return aK;
}

// ─── RK4 Orbit propagator ─────────────────────────────────────────────────────

/**
 * 4th-order Runge-Kutta orbit propagator.
 *
 * Advances position r and velocity v by time step dt (seconds).
 *
 * @param r          - Current ECI position (km).
 * @param v          - Current ECI velocity (km/s).
 * @param dt         - Integration timestep (s).
 * @param missionType - Mission label for gravity model selection.
 * @returns New { r, v } after dt seconds.
 */
export function propagateRK4(
  r: Vec3, v: Vec3, dt: number, missionType: string
): { r: Vec3; v: Vec3 } {
  const a = (p: Vec3) => gravityAcceleration(p, missionType);

  const k1v = v;             const k1a = a(r);
  const r2: Vec3 = [r[0]+0.5*dt*k1v[0], r[1]+0.5*dt*k1v[1], r[2]+0.5*dt*k1v[2]];
  const v2: Vec3 = [v[0]+0.5*dt*k1a[0], v[1]+0.5*dt*k1a[1], v[2]+0.5*dt*k1a[2]];
  const k2v = v2;            const k2a = a(r2);
  const r3: Vec3 = [r[0]+0.5*dt*k2v[0], r[1]+0.5*dt*k2v[1], r[2]+0.5*dt*k2v[2]];
  const v3: Vec3 = [v[0]+0.5*dt*k2a[0], v[1]+0.5*dt*k2a[1], v[2]+0.5*dt*k2a[2]];
  const k3v = v3;            const k3a = a(r3);
  const r4: Vec3 = [r[0]+dt*k3v[0], r[1]+dt*k3v[1], r[2]+dt*k3v[2]];
  const v4: Vec3 = [v[0]+dt*k3a[0], v[1]+dt*k3a[1], v[2]+dt*k3a[2]];
  const k4v = v4;            const k4a = a(r4);

  return {
    r: [
      r[0] + (dt/6)*(k1v[0]+2*k2v[0]+2*k3v[0]+k4v[0]),
      r[1] + (dt/6)*(k1v[1]+2*k2v[1]+2*k3v[1]+k4v[1]),
      r[2] + (dt/6)*(k1v[2]+2*k2v[2]+2*k3v[2]+k4v[2]),
    ],
    v: [
      v[0] + (dt/6)*(k1a[0]+2*k2a[0]+2*k3a[0]+k4a[0]),
      v[1] + (dt/6)*(k1a[1]+2*k2a[1]+2*k3a[1]+k4a[1]),
      v[2] + (dt/6)*(k1a[2]+2*k2a[2]+2*k3a[2]+k4a[2]),
    ],
  };
}

// ─── Solar System Barycenter Earth position ───────────────────────────────────

/**
 * Simplified analytical Earth heliocentric position (km) in the ecliptic plane.
 * Based on Astronomical Almanac low-precision orbital elements.
 *
 * Accurate to ~1 Mm for navigation context (epoch-insensitive errors dominate).
 *
 * @param epochMjd - Modified Julian Date epoch.
 * @returns Earth SSB position (km), ecliptic-aligned.
 */
export function earthPositionSsb(epochMjd: number): Vec3 {
  const T  = (epochMjd - 51544.5) / 36525.0;
  const a  = 1.00000011 - 0.00000005 * T;
  const e  = 0.01671022 - 0.00003804 * T;
  const vp = (102.94719 + 0.32327 * T) * Math.PI / 180;
  const M  = (357.52911 + 35999.05029 * T - 0.0001559 * T * T) * Math.PI / 180;

  let E = M;
  for (let i = 0; i < 5; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));

  const cosV = (Math.cos(E) - e) / (1 - e * Math.cos(E));
  const sinV = (Math.sqrt(1 - e * e) * Math.sin(E)) / (1 - e * Math.cos(E));
  const v    = Math.atan2(sinV, cosV);
  const rAu  = a * (1 - e * Math.cos(E));
  const lam  = vp + v;
  const eps  = 23.43929111 * Math.PI / 180;

  return [
    rAu * Math.cos(lam) * AU_KM,
    rAu * Math.sin(lam) * Math.cos(eps) * AU_KM,
    rAu * Math.sin(lam) * Math.sin(eps) * AU_KM,
  ];
}

// ─── Earth heliocentric position (simplified circular) ───────────────────────

/**
 * Simplified circular Earth position around Sun (km).
 * Used when full SSB analytical solution is not needed.
 *
 * @param t - Time from epoch (seconds).
 * @returns Earth heliocentric position (km).
 */
export function earthPositionSun(t: number): Vec3 {
  const period = 365.25 * 86_400;
  const omega  = 2 * Math.PI / period;
  return [
    AU_KM * Math.cos(omega * t),
    AU_KM * Math.sin(omega * t),
    0,
  ];
}

// ─── Interstellar dispersion delay ───────────────────────────────────────────

/**
 * Interstellar dispersion delay (seconds) for a pulsar signal.
 *
 * τ_disp = D × DM × f⁻²
 * where D = 4.148808×10³ s·MHz²·(pc·cm⁻³)⁻¹
 *
 * @param dm      - Dispersion measure (pc·cm⁻³).
 * @param freqMhz - Observation frequency (MHz). Clamped to ≥ 1 MHz.
 * @returns Dispersion delay (seconds).
 */
export function dispersionDelay(dm: number, freqMhz: number): number {
  return COEFF_D * dm * (Math.max(freqMhz, 1) ** -2) * 1e-6;
}

// ─── ECEF → ECI coordinate transform ─────────────────────────────────────────

/**
 * Converts a ground station geodetic position to ECI Cartesian (km).
 * Uses spherical Earth approximation (adequate for ~km-level nav).
 *
 * @param lat - Geodetic latitude (radians).
 * @param lon - Geodetic longitude (radians, ECEF frame).
 * @param alt - Altitude above ellipsoid (km).
 * @param t   - Time from epoch (seconds) — drives Earth rotation.
 * @returns ECI position (km).
 */
export function eciFromGeodetic(lat: number, lon: number, alt: number, t: number): Vec3 {
  const R     = RE_EARTH + alt;
  const xEcef = R * Math.cos(lat) * Math.cos(lon);
  const yEcef = R * Math.cos(lat) * Math.sin(lon);
  const zEcef = R * Math.sin(lat);
  const theta = W_EARTH * t;
  const cosT  = Math.cos(theta);
  const sinT  = Math.sin(theta);
  return [
    xEcef * cosT - yEcef * sinT,
    xEcef * sinT + yEcef * cosT,
    zEcef,
  ];
}

/**
 * ECI velocity of a ground station (km/s) due to Earth rotation.
 *
 * @param lat - Geodetic latitude (radians).
 * @param lon - Geodetic longitude (radians, ECEF).
 * @param alt - Altitude (km).
 * @param t   - Time from epoch (seconds).
 * @returns ECI velocity (km/s).
 */
export function groundStationVelocityEci(lat: number, lon: number, alt: number, t: number): Vec3 {
  const R     = RE_EARTH + alt;
  const xEcef = R * Math.cos(lat) * Math.cos(lon);
  const yEcef = R * Math.cos(lat) * Math.sin(lon);
  const theta = W_EARTH * t;
  const cosT  = Math.cos(theta);
  const sinT  = Math.sin(theta);
  return [
    -W_EARTH * (xEcef * sinT + yEcef * cosT),
     W_EARTH * (xEcef * cosT - yEcef * sinT),
     0,
  ];
}

// ─── Mission initial conditions ───────────────────────────────────────────────

export interface MissionState {
  /** Initial ECI position (km) */
  r0: Vec3;
  /** Initial ECI velocity (km/s) */
  v0: Vec3;
  /** Integration timestep (s) */
  dt: number;
  /** Total simulation steps */
  totalSteps: number;
}

/**
 * Returns physics-correct initial conditions for each mission archetype.
 *
 * Velocities are set to circular orbital speed where applicable:
 *   v_circ = √(μ / r)
 *
 * @param missionType - Mission label string.
 * @returns Initial state for the selected mission.
 */
export function getMissionInitialState(missionType: string): MissionState {
  switch (missionType) {
    case "GEO":
      return { r0: [42_164.0, 0, 0],       v0: [0, 3.074, 0.02],        dt: 180,    totalSteps: 200 };
    case "Earth-Moon Transfer":
      return { r0: [8_000.0, 0, 200],       v0: [0, 10.85, 0.15],        dt: 600,    totalSteps: 200 };
    case "Lunar Orbit":
      return { r0: [2_500.0, 0, 500],       v0: [0, 1.25, 0.05],         dt: 90,     totalSteps: 200 };
    case "Lagrange L1/L2 Halo":
      return { r0: [1_500_000, 20_000, 50_000], v0: [-0.05, 0.25, 0.08], dt: 3_600,  totalSteps: 200 };
    case "Earth-Mars Transfer":
      return { r0: [1.496e8, 0, 0],          v0: [0, 32.73, 1.5],        dt: 28_800, totalSteps: 200 };
    case "Deep Space Cruise":
      return { r0: [3 * AU_KM, 0, 2e6],      v0: [-1.5, 17.2, 0.5],      dt: 43_200, totalSteps: 200 };
    case "LEO":
    default:
      return { r0: [7_000.0, 0, 200],        v0: [0, 7.546, 0.08],        dt: 30,     totalSteps: 200 };
  }
}
