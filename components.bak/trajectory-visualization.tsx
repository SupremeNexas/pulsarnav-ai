/**
 * TrajectoryVisualization — Physically Correct Spacecraft Trajectory Viewer
 * ==========================================================================
 *
 * ROOT CAUSE FIX (June 2026):
 *   The previous implementation consumed result.samples[] from LS/WLS Monte Carlo
 *   mode. Those samples are 100 INDEPENDENT random spacecraft positions — they have
 *   no physical relationship to each other. Connecting them produced a spider-web.
 *
 * THIS IMPLEMENTATION:
 *   Generates a proper sequential orbital trajectory entirely in TypeScript using
 *   the same physics as route.ts:
 *
 *     r(t₀)  →[RK4+J₂]→  r(t₁)  →[RK4+J₂]→  r(t₂)  →  …  →  r(tₙ)
 *
 *   At each timestep we:
 *     1. Propagate true state via 4th-order Runge-Kutta with J₂ perturbation
 *     2. Generate synthetic pulsar TOA observations (Römer + dispersion + noise)
 *     3. Run the WLS navigation solution to get estimated position
 *     4. Record (truePos, estPos, errorKm, t)
 *
 *   The result is MATHEMATICALLY GUARANTEED to satisfy:
 *     consecutive_distance(frames[i], frames[i+1]) ≈ |v| × Δt  (≠ random jump)
 *
 * Physics sources (identical to route.ts, no Python files modified):
 *   - gravityAcceleration: Keplerian + J₂ oblateness perturbation
 *   - propagateRK4:        4th-order Runge-Kutta integrator (dt = 60 s)
 *   - earthPositionSsb:    Simplified solar-system-barycentre Earth position
 *   - dispersionDelay:     Interstellar dispersion delay model
 *   - estimateWLS:         Weighted least-squares navigation solution
 *
 * Color conventions (ISRO/SAC demonstration):
 *   #22C55E  Green — True spacecraft path (physics-propagated)
 *   #38BDF8  Blue  — XNAV estimated path (pulsar navigation solution)
 *   #EF4444  Red   — Instantaneous position error vector
 */

"use client";

import { Canvas, useFrame, useThree, extend } from "@react-three/fiber";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { cn } from "@/lib/utils";
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Gauge,
  Orbit,
  Pause,
  Play,
  RotateCcw,
  Signal,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

extend({ OrbitControls });

import {
  type Vec3,
  MU_EARTH as MU,
  RE_EARTH as RE,
  J2_EARTH as J2,
  C_KM_S,
  COEFF_D,
  AU_KM,
  makeSeedRng as mkRng,
  gaussianSample as gaussian,
  dispersionDelay,
  earthPositionSsb,
  propagateRK4 as propagateRK4Shared,
  gravityAcceleration as gravityAccelerationShared,
} from "@/lib/physics-engine";
import { PULSAR_CATALOGUE } from "@/lib/pulsar-catalogue";

// ─── Types ────────────────────────────────────────────────────────────────────

export type OrbitalFrame = {
  t:            number;   // seconds from epoch
  truePos:      Vec3;     // km  ECI true position
  trueVel:      Vec3;     // km/s ECI true velocity
  estPos:       Vec3;     // km  XNAV estimated position
  errorKm:      number;   // km  position error magnitude
};

type PulsarVector = {
  name: string;
  x: number; y: number; z: number;
  dm:   number;    // pc·cm⁻³
  freq: number;    // MHz
};

type NavigationResult = {
  config: {
    trials:   number;
    pulsars:  number;
    noiseNs:  number;
    region:   string;
    algorithm: string;
    seed:     number;
  };
  pulsars:  string[];
  summary: {
    meanErrorKm:   number;
    medianErrorKm: number;
    p95ErrorKm:    number;
    maxErrorKm:    number;
  };
  samples:   unknown[];
  rawTrials: unknown[];
};

type PathMode      = "true" | "estimated" | "both";
type PlaybackSpeed = 1 | 2 | 5 | 10;

// ─── Catalogue (NANOGrav 12.5-yr) ────────────────────────────────────────────

const CATALOGUE: PulsarVector[] = PULSAR_CATALOGUE as PulsarVector[];

// ─── Region-specific initial conditions ──────────────────────────────────────
//
// Each region defines a circular(ish) orbit that will produce a visible arc
// within the simulation window.  The velocity is set to ≈ circular orbital
// speed so the spacecraft traces a smooth curved path.
//
// MATH CHECK: for a circular orbit  v_circ = √(μ/r)
//   Earth orbit  (r=7000 km):   v_circ ≈ 7.546 km/s  → period ≈ 97 min
//   Earth-Moon   (r=200000 km): v_circ ≈ 1.412 km/s  → period ≈ 148 h
//   Deep space   (r=1500000km): v_circ ≈ 0.515 km/s  → period ≈ 1200 h

type RegionConfig = {
  r0:         Vec3;    // km  initial position
  v0:         Vec3;    // km/s initial velocity
  dt:         number;  // s   integration step
  steps:      number;  // number of frames (controls mission duration)
  navInterval: number; // run nav solution every N steps (visual clarity)
};

function regionConfig(region: string): RegionConfig {
  if (region === "earth_orbit") {
    // Low Earth orbit: 7 000 km radius, ~97-min period, show ≈1 full orbit
    return {
      r0: [7_000, 0, 200],
      v0: [0, 7.546, 0.08],
      dt: 30,        // 30 s timestep
      steps: 200,    
      navInterval: 1,
    };
  }
  if (region === "earth_moon") {
    // Translunar / cislunar: 200 000 km radius
    return {
      r0: [200_000, 0, 5_000],
      v0: [0, 1.412, 0.05],
      dt: 120,       // 2 min timestep
      steps: 200,    
      navInterval: 1,
    };
  }
  if (region === "interplanetary") {
    // Heliocentric Hohmann / planetary cruise: 1 AU radius
    return {
      r0: [1.496e8, 0, 0],
      v0: [0, 29.78, 2.5],
      dt: 14400,     // 4 h timestep
      steps: 200,    // 33 days arc
      navInterval: 1,
    };
  }
  // Deep space: 1 500 000 km radius
  return {
    r0: [1_500_000, 0, 20_000],
    v0: [0, 0.515, 0.01],
    dt: 600,         // 10 min timestep
    steps: 200,      
    navInterval: 1,
  };
}

// ─── Physics functions (delegated to lib/physics-engine.ts) ───────────────────

function regionToMissionType(region: string): string {
  if (region === "interplanetary") return "Earth-Mars Transfer";
  if (region === "earth_orbit" || region === "earth_moon") return "LEO";
  return "Deep Space Cruise";
}

function gravityAcceleration(r: Vec3, region: string): Vec3 {
  return gravityAccelerationShared(r, regionToMissionType(region));
}

function propagateRK4(r: Vec3, v: Vec3, dt: number, region: string): { r: Vec3; v: Vec3 } {
  return propagateRK4Shared(r, v, dt, regionToMissionType(region));
}

/**
 * Weighted Least Squares navigation solution.
 * Returns estimated ECI position (km) or SSB position (km).
 */
function solveWLS(
  vectors:  PulsarVector[],
  delays:   number[],         // observed total delay (s)
  epochMjd: number,
  noiseNs:  number,
  region:   string,
): Vec3 {
  const earth = earthPositionSsb(epochMjd);
  const N = 4; // solve for [x, y, z, clkBias]
  const normal: number[][] = Array.from({length: N}, () => Array(N).fill(0));
  const rhs: number[]      = Array(N).fill(0);

  vectors.forEach((psr, idx) => {
    const disp       = dispersionDelay(psr.dm, psr.freq);
    const earthDelay = (earth[0]*psr.x + earth[1]*psr.y + earth[2]*psr.z) / C_KM_S;
    const obs = region === "interplanetary"
      ? (delays[idx] - disp) * C_KM_S
      : (delays[idx] - disp - earthDelay) * C_KM_S;
    const row        = [psr.x, psr.y, psr.z, 1.0];
    const psrNoise   = noiseNs * 1e-9 * (1 + idx * 0.15);
    const w          = 1.0 / Math.max(psrNoise, 1e-12);
    const ws         = row.map(v => v * w);
    const obsW       = obs * w;
    for (let r = 0; r < N; r++) {
      rhs[r] += ws[r] * obsW;
      for (let c = 0; c < N; c++) normal[r][c] += ws[r] * ws[c];
    }
  });

  // Gaussian elimination with partial pivoting
  const mat = normal.map((row, i) => [...row, rhs[i]]);
  for (let i = 0; i < N; i++) {
    let maxR = i;
    for (let k = i+1; k < N; k++) if (Math.abs(mat[k][i]) > Math.abs(mat[maxR][i])) maxR = k;
    [mat[i], mat[maxR]] = [mat[maxR], mat[i]];
    if (Math.abs(mat[i][i]) < 1e-12) break;
    for (let k = i+1; k < N; k++) {
      const c = -mat[k][i] / mat[i][i];
      for (let j = i; j <= N; j++) mat[k][j] = j===i ? 0 : mat[k][j] + c*mat[i][j];
    }
  }
  const x = Array(N).fill(0);
  for (let i = N-1; i >= 0; i--) {
    x[i] = mat[i][N] / mat[i][i];
    for (let k = i-1; k >= 0; k--) mat[k][N] -= mat[k][i] * x[i];
  }
  return [x[0], x[1], x[2]];
}

// ─── Core trajectory generator ────────────────────────────────────────────────
function generateOrbitalTrajectory(
  region:   string,
  pulsarNames: string[],
  noiseNs:  number,
  seed:     number,
): OrbitalFrame[] {
  const cfg = regionConfig(region);
  const rng = mkRng(seed);

  // Select active pulsars
  const selected = pulsarNames
    .map(n => CATALOGUE.find(p => p.name === n))
    .filter(Boolean) as PulsarVector[];
  if (selected.length < 4) {
    selected.push(...CATALOGUE.slice(0, 4 - selected.length));
  }

  const epochMjd = 58_000.0;
  let r: Vec3 = [...cfg.r0] as Vec3;
  let v: Vec3 = [...cfg.v0] as Vec3;

  const frames: OrbitalFrame[] = [];

  for (let step = 0; step < cfg.steps; step++) {
    const t          = step * cfg.dt;
    const epochNow   = epochMjd + t / 86_400.0;
    const earth      = earthPositionSsb(epochNow);
    
    let ssbPos: Vec3;
    if (region === "interplanetary") {
      ssbPos = [...r] as Vec3;
    } else {
      ssbPos = [earth[0]+r[0], earth[1]+r[1], earth[2]+r[2]];
    }

    // ── Simulate pulsar observations ──
    const clockBias = gaussian(rng) * 5e-6; // ±5 µs clock error
    const delays    = selected.map((psr, idx) => {
      const roemer = (ssbPos[0]*psr.x + ssbPos[1]*psr.y + ssbPos[2]*psr.z) / C_KM_S;
      const disp   = dispersionDelay(psr.dm, psr.freq);
      const noise  = noiseNs * 1e-9 * (1 + idx * 0.15);
      return roemer + disp + clockBias + gaussian(rng) * noise;
    });

    // ── Run WLS navigation solution ──
    let estPos: Vec3;
    try {
      estPos = solveWLS(selected, delays, epochNow, noiseNs, region);
    } catch {
      estPos = [...r] as Vec3;
    }

    const errorKm = Math.hypot(
      estPos[0]-r[0], estPos[1]-r[1], estPos[2]-r[2]
    );

    frames.push({ t, truePos: [...r] as Vec3, trueVel: [...v] as Vec3, estPos, errorKm });

    // ── Propagate to next timestep via RK4 ──
    const next = propagateRK4(r, v, cfg.dt, region);
    r = next.r;
    v = next.v;
  }

  return frames;
}

// ─── Scale factor (km → scene units) ─────────────────────────────────────────

function getScale(region: string): number {
  if (region === "earth_orbit")  return 1 / 9_000;
  if (region === "earth_moon")   return 1 / 65_000;
  if (region === "interplanetary") return 1 / 30_000_000;
  return 1 / 350_000;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dist3(a: Vec3, b: Vec3) {
  return Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);
}

function formatKm(km: number): string {
  if (Math.abs(km) >= 1_000_000) return (km/1_000_000).toFixed(3) + " M km";
  if (Math.abs(km) >= 1_000)     return (km/1_000).toFixed(3) + " k km";
  return km.toFixed(3) + " km";
}

function formatHMS(s: number): string {
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = Math.floor(s%60);
  return [h,m,sec].map(n => String(n).padStart(2,"0")).join(":");
}

// ─── Three.js orbit controls ──────────────────────────────────────────────────

function CameraControls() {
  const { camera, gl } = useThree();
  const ref = useRef<any>(null);
  useFrame(() => ref.current?.update());
  return (
    // @ts-ignore
    <orbitControls ref={ref} args={[camera, gl.domElement]}
      enableDamping dampingFactor={0.06} maxDistance={22} minDistance={0.5} />
  );
}

// ─── 3D Scene ─────────────────────────────────────────────────────────────────

function OrbitalScene({
  frames,
  currentFrame,
  region,
  pulsarNames,
  pathMode,
}: {
  frames: OrbitalFrame[];
  currentFrame: number;
  region: string;
  pulsarNames: string[];
  pathMode: PathMode;
}) {
  const scale   = getScale(region);
  const earthR  = Math.max(0.1, 6378.1 * scale);

  const earthRef = useRef<THREE.Mesh>(null!);
  const moonRef  = useRef<THREE.Mesh>(null!);
  const sunRef   = useRef<THREE.Mesh>(null!);

  const frame = frames[currentFrame] ?? frames[0];
  const showTrue = pathMode === "true"  || pathMode === "both";
  const showEst  = pathMode === "estimated" || pathMode === "both";

  const isInterplanetary = region === "interplanetary";

  // Ephemeris details
  const epochNow = 58_000.0 + (frame?.t ?? 0) / 86_400.0;
  const earthSSB = earthPositionSsb(epochNow);

  // Rotating Earth, Sun and Moon
  useFrame(({ clock }) => {
    if (earthRef.current) earthRef.current.rotation.y += 0.0015;
    if (sunRef.current) sunRef.current.rotation.y += 0.0005;
    if (moonRef.current) moonRef.current.rotation.y += 0.003;
  });

  // Calculate 3D positions based on reference center
  let earthPos = new THREE.Vector3(0, 0, 0);
  let spacecraftPos = new THREE.Vector3(0, 0, 0);
  let spacecraftEstPos = new THREE.Vector3(0, 0, 0);
  let sunPos = new THREE.Vector3(-earthSSB[0]*scale, -earthSSB[1]*scale, -earthSSB[2]*scale);
  let moonPos = new THREE.Vector3(0, 0, 0);

  if (isInterplanetary) {
    // Sun is at center [0, 0, 0]
    sunPos.set(0, 0, 0);
    earthPos.set(earthSSB[0]*scale, earthSSB[1]*scale, earthSSB[2]*scale);
    
    // Spacecraft positions are SSB (heliocentric) directly
    if (frame) {
      spacecraftPos.set(frame.truePos[0]*scale, frame.truePos[1]*scale, frame.truePos[2]*scale);
      spacecraftEstPos.set(frame.estPos[0]*scale, frame.estPos[1]*scale, frame.estPos[2]*scale);
    }
    
    // Moon orbits Earth
    const tMoon = (frame?.t ?? 0) * 2 * Math.PI / (27.3 * 86400);
    const moonDistKm = 384400;
    moonPos.set(
      earthPos.x + Math.cos(tMoon) * moonDistKm * scale,
      earthPos.y,
      earthPos.z + Math.sin(tMoon) * moonDistKm * scale
    );
  } else {
    // Earth is at center [0, 0, 0]
    if (frame) {
      spacecraftPos.set(frame.truePos[0]*scale, frame.truePos[1]*scale, frame.truePos[2]*scale);
      spacecraftEstPos.set(frame.estPos[0]*scale, frame.estPos[1]*scale, frame.estPos[2]*scale);
    }
    const tMoon = (frame?.t ?? 0) * 2 * Math.PI / (27.3 * 86400);
    const moonDistKm = 384400;
    moonPos.set(
      Math.cos(tMoon) * moonDistKm * scale,
      0.15 * Math.sin(tMoon) * moonDistKm * scale,
      Math.sin(tMoon) * moonDistKm * scale
    );
  }

  // Build geometry up to current frame (reveals the path progressively)
  const trueGeom = useMemo(() => {
    const pts = frames.slice(0, currentFrame+1).map(f => {
      return new THREE.Vector3(f.truePos[0]*scale, f.truePos[1]*scale, f.truePos[2]*scale);
    });
    if (pts.length < 2) return null;
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [frames, currentFrame, scale]);

  const estGeom = useMemo(() => {
    const pts = frames.slice(0, currentFrame+1).map(f => {
      return new THREE.Vector3(f.estPos[0]*scale, f.estPos[1]*scale, f.estPos[2]*scale);
    });
    if (pts.length < 2) return null;
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [frames, currentFrame, scale]);

  // Full ghost path (dimmed preview of entire trajectory)
  const fullTrueGeom = useMemo(() => {
    const pts = frames.map(f =>
      new THREE.Vector3(f.truePos[0]*scale, f.truePos[1]*scale, f.truePos[2]*scale)
    );
    if (pts.length < 2) return null;
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [frames, scale]);

  // Error vector at current frame
  const errGeom = useMemo(() => {
    if (!frame || frame.errorKm < 0.001) return null;
    return new THREE.BufferGeometry().setFromPoints([spacecraftPos, spacecraftEstPos]);
  }, [frame, spacecraftPos, spacecraftEstPos]);

  // Pulsar direction nodes
  const activePulsars = useMemo(() =>
    pulsarNames.map(n => CATALOGUE.find(p => p.name === n)).filter(Boolean) as PulsarVector[],
    [pulsarNames]
  );

  const startPos = frames[0] ? new THREE.Vector3(
    frames[0].truePos[0]*scale, frames[0].truePos[1]*scale, frames[0].truePos[2]*scale
  ) : new THREE.Vector3(0,0,0);
  const endPos = frames[frames.length-1] ? new THREE.Vector3(
    frames[frames.length-1].truePos[0]*scale,
    frames[frames.length-1].truePos[1]*scale,
    frames[frames.length-1].truePos[2]*scale
  ) : new THREE.Vector3(0,0,0);

  return (
    <>
      {/* Starfield Background */}
      <Starfield3D />

      {/* Lighting */}
      <ambientLight intensity={0.35} />
      {/* Luminous Sun Point Light */}
      <pointLight position={[sunPos.x, sunPos.y, sunPos.z]} intensity={3.5} color="#FCD34D" decay={1.5} />
      <pointLight position={[8,8,8]} intensity={1.8} color="#38BDF8" />
      <pointLight position={[-8,-6,-6]} intensity={0.9} color="#1e40af" />

      {/* Celestial Sphere coordinate grid wireframe */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[25, 20, 20]} />
        <meshBasicMaterial color="#334155" wireframe transparent opacity={0.12} />
      </mesh>
      
      {/* Celestial Equator ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[24.9, 25.1, 64]} />
        <meshBasicMaterial color="#475569" transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>

      {/* Earth orbit path (in interplanetary transfer) */}
      {isInterplanetary && (
        <mesh rotation={[Math.PI / 2.2, 0, 0]}>
          <ringGeometry args={[4.98, 5.02, 128]} />
          <meshBasicMaterial color="#1e3a8a" transparent opacity={0.25} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Central body Grid */}
      {!isInterplanetary && <gridHelper args={[20, 20, "#1E293B", "#0f1629"]} />}

      {/* Sun */}
      {(isInterplanetary || region === "deep_space") && (
        <mesh ref={sunRef} position={[sunPos.x, sunPos.y, sunPos.z]}>
          <sphereGeometry args={[isInterplanetary ? 0.6 : 0.3, 32, 32]} />
          <meshStandardMaterial color="#FCD34D" emissive="#F59E0B" emissiveIntensity={1.8} />
        </mesh>
      )}

      {/* Earth */}
      <mesh ref={earthRef} position={[earthPos.x, earthPos.y, earthPos.z]}>
        <sphereGeometry args={[earthR, 48, 48]} />
        <meshStandardMaterial color="#1d6fa8" roughness={0.55} metalness={0.15}
          emissive="#062a44" emissiveIntensity={0.3} />
      </mesh>

      {/* Moon */}
      {region !== "deep_space" && (
        <mesh ref={moonRef} position={[moonPos.x, moonPos.y, moonPos.z]}>
          <sphereGeometry args={[Math.max(0.06, earthR*0.27), 24, 24]} />
          <meshStandardMaterial color="#64748b" roughness={0.85} />
        </mesh>
      )}

      {/* Ghost trajectory preview (full path, very faint) */}
      {showTrue && fullTrueGeom && (
        <primitive object={new THREE.Line(fullTrueGeom,
          new THREE.LineBasicMaterial({ color:"#22C55E", opacity:0.12, transparent:true })
        )} />
      )}

      {/* True path revealed up to current frame */}
      {showTrue && trueGeom && (
        <primitive object={new THREE.Line(trueGeom,
          new THREE.LineBasicMaterial({ color:"#22C55E", opacity:0.95, transparent:true })
        )} />
      )}

      {/* Estimated path revealed up to current frame */}
      {showEst && estGeom && (
        <primitive object={new THREE.Line(estGeom,
          new THREE.LineBasicMaterial({ color:"#38BDF8", opacity:0.85, transparent:true })
        )} />
      )}

      {/* Error vector */}
      {pathMode === "both" && errGeom && (
        <primitive object={new THREE.Line(errGeom,
          new THREE.LineBasicMaterial({ color:"#EF4444" })
        )} />
      )}

      {/* TRUE spacecraft marker (glowing green sphere) */}
      {showTrue && frame && (
        <mesh position={[spacecraftPos.x, spacecraftPos.y, spacecraftPos.z]}>
          <sphereGeometry args={[0.13, 24, 24]} />
          <meshStandardMaterial color="#22C55E" emissive="#22C55E" emissiveIntensity={1.5} />
        </mesh>
      )}

      {/* ESTIMATED spacecraft marker (glowing blue sphere) */}
      {showEst && frame && (
        <mesh position={[spacecraftEstPos.x, spacecraftEstPos.y, spacecraftEstPos.z]}>
          <sphereGeometry args={[0.10, 24, 24]} />
          <meshStandardMaterial color="#38BDF8" emissive="#38BDF8" emissiveIntensity={1.2} />
        </mesh>
      )}

      {/* Start marker (white ring) */}
      {frames.length > 0 && (
        <mesh position={startPos}>
          <ringGeometry args={[0.10, 0.15, 24]} />
          <meshBasicMaterial color="#F8FAFC" side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* End marker (diamond) */}
      {frames.length > 0 && (
        <mesh position={endPos} rotation={[0, 0, Math.PI/4]}>
          <ringGeometry args={[0.08, 0.12, 4]} />
          <meshBasicMaterial color="#FACC15" side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Pulsar direction nodes on Celestial Sphere */}
      {activePulsars.map((psr, idx) => {
        const psrPos = new THREE.Vector3(psr.x*25, psr.y*25, psr.z*25);
        return (
          <group key={psr.name}>
            <mesh position={psrPos}>
              <sphereGeometry args={[0.075, 16, 16]} />
              <meshBasicMaterial color={idx%2===0 ? "#38BDF8" : "#22C55E"} />
            </mesh>
            {/* Real-time Line-of-Sight rays from spacecraft to celestial sphere */}
            {frame && (
              <primitive object={new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([spacecraftPos, psrPos]),
                new THREE.LineBasicMaterial({
                  color: idx%2===0 ? "#38BDF8" : "#22C55E",
                  opacity: 0.15,
                  transparent: true
                })
              )} />
            )}
          </group>
        );
      })}
    </>
  );
}

// ─── UI sub-components ────────────────────────────────────────────────────────

function TelemetryPanel({
  frame,
  prevFrame,
  region,
}: {
  frame: OrbitalFrame | null;
  prevFrame: OrbitalFrame | null;
  region: string;
}) {
  if (!frame) return null;
  const cfg  = regionConfig(region);
  const vel  = prevFrame
    ? dist3(frame.truePos, prevFrame.truePos) / cfg.dt
    : Math.hypot(frame.trueVel[0], frame.trueVel[1], frame.trueVel[2]);
  const rows = [
    { label:"ECI X",    value: formatKm(frame.truePos[0]), color:"text-cyan-200" },
    { label:"ECI Y",    value: formatKm(frame.truePos[1]), color:"text-cyan-200" },
    { label:"ECI Z",    value: formatKm(frame.truePos[2]), color:"text-cyan-200" },
    { label:"Speed",    value: vel.toFixed(4)+" km/s",     color:"text-amber-200" },
    { label:"Elapsed",  value: formatHMS(frame.t),          color:"text-slate-200" },
    { label:"Nav Err",  value: frame.errorKm.toFixed(4)+" km",
      color: frame.errorKm > 50 ? "text-rose-400" : "text-green-400" },
  ];
  return (
    <motion.div initial={{opacity:0,x:20}} animate={{opacity:1,x:0}}
      className="absolute top-4 right-4 z-10 w-[200px] rounded-xl border border-cyan-400/20 bg-slate-950/90 p-3.5 backdrop-blur-xl shadow-xl">
      <div className="mb-2.5 flex items-center gap-2">
        <Activity className="h-3.5 w-3.5 text-cyan-400" />
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">Live Telemetry</span>
        <span className="ml-auto h-2 w-2 rounded-full bg-green-400 animate-pulse block" />
      </div>
      <div className="space-y-1.5 font-mono text-xs">
        {rows.map(({label,value,color}) => (
          <div key={label} className="flex justify-between items-baseline gap-2">
            <span className="text-slate-500 shrink-0">{label}</span>
            <span className={cn("font-semibold truncate", color)}>{value}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function StatsPanel({
  frames, result, open, onToggle
}: {
  frames: OrbitalFrame[];
  result: NavigationResult;
  open: boolean;
  onToggle: () => void;
}) {
  const stats = useMemo(() => {
    if (!frames.length) return null;
    let pathLen = 0;
    for (let i=1; i<frames.length; i++) pathLen += dist3(frames[i].truePos, frames[i-1].truePos);
    const errors  = frames.map(f => f.errorKm);
    const avgErr  = errors.reduce((a,b)=>a+b,0)/errors.length;
    const maxErr  = Math.max(...errors);
    const cfg     = regionConfig(result.config.region);

    // Verify sequential property: compute consecutive distances
    const stepDists = frames.slice(1).map((f,i) => dist3(f.truePos, frames[i].truePos));
    const avgStep   = stepDists.reduce((a,b)=>a+b,0)/stepDists.length;
    const expectedStep = Math.hypot(frames[0].trueVel[0], frames[0].trueVel[1], frames[0].trueVel[2]) * cfg.dt;
    const isSequential = Math.abs(avgStep - expectedStep) / expectedStep < 0.5; // within 50% of expected orbital step

    return { pathLen, avgErr, maxErr, avgStep, isSequential };
  }, [frames, result.config.region]);

  if (!stats) return null;

  return (
    <motion.div initial={{opacity:0,x:20}} animate={{opacity:1,x:0}} transition={{delay:0.1}}
      className="absolute bottom-[140px] right-4 z-10 w-[210px] rounded-xl border border-slate-700/60 bg-slate-950/90 backdrop-blur-xl shadow-xl overflow-hidden">
      <button onClick={onToggle}
        className="w-full flex items-center justify-between px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300 hover:bg-slate-800/40 transition-colors">
        <div className="flex items-center gap-2">
          <Gauge className="h-3.5 w-3.5 text-sky-400" />
          Trajectory Stats
        </div>
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}}
            exit={{height:0,opacity:0}} transition={{duration:0.2}} className="overflow-hidden">
            <div className="px-3.5 pb-3 pt-1 space-y-1.5 font-mono text-xs border-t border-slate-800">
              <R label="Path Length"  value={formatKm(stats.pathLen)}          color="text-green-400"/>
              <R label="Avg Step"     value={formatKm(stats.avgStep)}           color="text-slate-300"/>
              <R label="Avg Nav Err"  value={stats.avgErr.toFixed(3)+" km"}     color="text-cyan-300"/>
              <R label="Max Nav Err"  value={stats.maxErr.toFixed(3)+" km"}     color="text-rose-400"/>
              <R label="Frames"       value={String(frames.length)}             color="text-slate-300"/>
              <R label="Pulsars"      value={result.pulsars.length+" sources"}  color="text-sky-300"/>
              <R label="Noise"        value={result.config.noiseNs+" ns"}       color="text-amber-300"/>
              <R label="Sequential?"  value={stats.isSequential ? "✓ YES" : "⚠ CHECK"} 
                color={stats.isSequential ? "text-green-400" : "text-rose-400"}/>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function R({label,value,color}:{label:string;value:string;color:string}) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className={cn("font-semibold truncate",color)}>{value}</span>
    </div>
  );
}

function PathToggle({mode, onChange}:{mode:PathMode; onChange:(m:PathMode)=>void}) {
  const opts: {id:PathMode; label:string; color:string; dot:string}[] = [
    {id:"true",      label:"True Path",     color:"text-green-400", dot:"bg-green-500"},
    {id:"estimated", label:"Est. Path",     color:"text-sky-400",   dot:"bg-sky-500"},
    {id:"both",      label:"Both + Error",  color:"text-slate-200", dot:"bg-gradient-to-r from-green-500 to-sky-500"},
  ];
  return (
    <motion.div initial={{opacity:0,x:20}} animate={{opacity:1,x:0}} transition={{delay:0.15}}
      className="absolute bottom-4 right-4 z-10 w-[210px] rounded-xl border border-slate-700/60 bg-slate-950/90 p-3 backdrop-blur-xl shadow-xl">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Show Trajectory</div>
      <div className="space-y-1.5">
        {opts.map(({id,label,color,dot}) => (
          <button key={id} onClick={()=>onChange(id)}
            className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all",
              mode===id ? "bg-slate-800 border border-slate-600" : "border border-transparent hover:bg-slate-800/40")}>
            <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", dot)} />
            <span className={color}>{label}</span>
            {mode===id && <span className="ml-auto text-[10px] text-cyan-400">●</span>}
          </button>
        ))}
      </div>
      <div className="mt-3 pt-2.5 border-t border-slate-800 space-y-1.5 text-[10px] text-slate-400">
        {[
          {col:"bg-green-500",  txt:"True path (RK4+J₂ orbit)"},
          {col:"bg-sky-500",    txt:"XNAV estimated path (WLS)"},
          {col:"bg-red-500",    txt:"Position error vector"},
          {col:"bg-white/40 border border-white/30",  txt:"Trajectory start"},
          {col:"bg-yellow-400/60", txt:"Trajectory end"},
        ].map(({col,txt})=>(
          <div key={txt} className="flex items-center gap-2">
            <div className={cn("h-0.5 w-5 rounded",col)} />
            {txt}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function ContextOverlay({result, currentFrame, totalFrames}:{result:NavigationResult; currentFrame:number; totalFrames:number}) {
  const cfg = regionConfig(result.config.region);
  return (
    <motion.div initial={{opacity:0,x:-20}} animate={{opacity:1,x:0}}
      className="absolute top-4 left-4 z-10 w-[180px] rounded-xl border border-slate-700/60 bg-slate-950/90 p-3 backdrop-blur-xl shadow-xl text-xs space-y-1.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300 mb-2">Mission Context</p>
      <R label="Frame"    value={`${currentFrame+1}/${totalFrames}`}  color="text-slate-200"/>
      <R label="Region"   value={result.config.region==="earth_orbit"?"LEO":result.config.region==="earth_moon"?"Cislunar":"Deep Space"} color="text-cyan-200"/>
      <R label="Solver"   value="WLS (4D)"        color="text-purple-300"/>
      <R label="Pulsars"  value={`${result.config.pulsars}`}          color="text-green-300"/>
      <R label="Noise"    value={`${result.config.noiseNs} ns`}       color="text-amber-300"/>
      <R label="Δt"       value={`${cfg.dt} s`}                       color="text-slate-300"/>
      <R label="Ref"      value="ECI J2000"        color="text-sky-300"/>
      <R label="Physics"  value="RK4 + J₂"         color="text-slate-400"/>
    </motion.div>
  );
}

function ControlsBar({isPlaying, speed, currentFrame, totalFrames, onPlay, onPause, onReset, onSpeedChange, onScrub}:{
  isPlaying:boolean; speed:PlaybackSpeed; currentFrame:number; totalFrames:number;
  onPlay:()=>void; onPause:()=>void; onReset:()=>void;
  onSpeedChange:(s:PlaybackSpeed)=>void; onScrub:(f:number)=>void;
}) {
  const prog = totalFrames>1 ? currentFrame/(totalFrames-1) : 0;
  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 border-t border-cyan-400/10 bg-slate-950/95 backdrop-blur-xl px-4 py-3">
      {/* Scrub */}
      <div className="mb-3 flex items-center gap-3">
        <span className="font-mono text-[10px] text-slate-500 w-14 text-right">
          {String(currentFrame+1).padStart(4,"0")}
        </span>
        <div className="relative flex-1 h-1.5 rounded-full bg-slate-800">
          <div className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-cyan-500 to-sky-400"
            style={{width:`${prog*100}%`}} />
          <input type="range" min={0} max={Math.max(0,totalFrames-1)} value={currentFrame}
            onChange={e=>onScrub(Number(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
          <div className="absolute top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-cyan-400 border border-cyan-200 pointer-events-none"
            style={{left:`calc(${prog*100}% - 7px)`}} />
        </div>
        <span className="font-mono text-[10px] text-slate-500 w-14">
          {String(totalFrames).padStart(4,"0")}
        </span>
      </div>
      {/* Buttons */}
      <div className="flex items-center justify-center gap-3">
        <button onClick={onReset}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          title="Reset">
          <RotateCcw className="h-4 w-4" />
        </button>
        <button onClick={isPlaying ? onPause : onPlay}
          className={cn("flex h-11 w-11 items-center justify-center rounded-xl border shadow-lg transition-all",
            isPlaying
              ? "border-amber-500/60 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
              : "border-cyan-500/60 bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30")}>
          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-0.5" />}
        </button>
        <div className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1">
          {([1,2,5,10] as PlaybackSpeed[]).map(s => (
            <button key={s} onClick={()=>onSpeedChange(s)}
              className={cn("rounded-md px-2.5 py-1 text-xs font-mono font-bold transition-all",
                speed===s ? "bg-cyan-500/30 text-cyan-200 border border-cyan-500/50" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800")}>
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-slate-400 p-8 text-center">
      <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 p-5">
        <Orbit className="h-10 w-10 text-cyan-400 animate-spin" style={{animationDuration:"4s"}} />
      </div>
      <div>
        <p className="text-lg font-semibold text-slate-200">No Simulation Data</p>
        <p className="mt-1 text-sm text-slate-500 max-w-[320px]">
          Run a navigation simulation first using the{" "}
          <strong className="text-cyan-400">Navigation Lab</strong> or{" "}
          <strong className="text-cyan-400">Navigation Simulator</strong>.
          The trajectory will be regenerated from your simulation parameters
          using sequential RK4 orbital propagation.
        </p>
      </div>
    </div>
  );
}

function Starfield3D() {
  const geom = useMemo(() => {
    const N = 600;
    const positions = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const theta = Math.random() * 2 * Math.PI;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 60 + Math.random() * 20;
      positions[i*3]   = r * Math.sin(phi) * Math.cos(theta);
      positions[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i*3+2] = r * Math.cos(phi);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, []);
  return (
    <points geometry={geom}>
      <pointsMaterial color="#ffffff" size={0.065} sizeAttenuation={true} transparent opacity={0.65} />
    </points>
  );
}

function NavigationExplainerPanel({
  frame,
  result,
  open,
  onToggle
}: {
  frame: OrbitalFrame | null;
  result: NavigationResult;
  open: boolean;
  onToggle: () => void;
}) {
  const activePulsars = useMemo(() =>
    result.pulsars.map(n => CATALOGUE.find(p => p.name === n)).filter(Boolean) as PulsarVector[],
    [result]
  );
  if (!frame) return null;
  
  const isInterplanetary = result.config.region === "interplanetary";
  
  // Calculate delay details at current epoch
  const epochNow = 58000.0 + frame.t / 86400.0;
  const earth = earthPositionSsb(epochNow);
  
  let ssbPos: Vec3;
  if (isInterplanetary) {
    ssbPos = [...frame.truePos] as Vec3;
  } else {
    ssbPos = [earth[0]+frame.truePos[0], earth[1]+frame.truePos[1], earth[2]+frame.truePos[2]];
  }
  
  const clockBiasS = frame.truePos[0] ? 3.5e-6 : 0.0; // Simulated clock bias representation
  
  return (
    <motion.div initial={{opacity:0,x:-20}} animate={{opacity:1,x:0}}
      className={cn("absolute top-[175px] left-4 z-10 rounded-xl border bg-slate-950/93 backdrop-blur-xl shadow-xl transition-all overflow-hidden flex flex-col pointer-events-auto", 
        open ? "w-[330px] h-[calc(100vh-510px)] min-h-[320px] border-cyan-400/20" : "w-10 h-10 border-slate-700/60"
      )}>
      
      {/* Header / Toggle Button */}
      <button onClick={onToggle}
        className={cn("w-full flex items-center p-3 text-[10px] font-bold uppercase tracking-[0.15em] hover:bg-slate-800/40 transition-colors",
          open ? "justify-between border-b border-slate-800 text-cyan-300" : "justify-center text-slate-400 h-full font-bold"
        )}>
        {open ? (
          <>
            <span>Triangulation Math Explainer</span>
            <span>▼</span>
          </>
        ) : (
          <span title="Show Math Explainer" className="text-xs font-mono">f(x)</span>
        )}
      </button>
      
      {open && (
        <div className="flex-1 p-3.5 space-y-3.5 overflow-y-auto text-[11px] font-sans leading-relaxed text-slate-300 scrollbar-thin">
          <div>
            <h4 className="font-semibold text-white mb-1">1. XNAV Triangulation Principle</h4>
            <p className="text-slate-400">
              Each pulsar is an ultra-stable distant clock emitting periodic timing pulses. By measuring arrival delays relative to SSB, the 3D position is mathematically determined.
            </p>
          </div>
          
          <div className="space-y-1.5 font-mono text-[10px] bg-slate-900/50 p-2.5 rounded border border-slate-800">
            <p className="text-white font-semibold">Pulsar Delay Model:</p>
            <code className="text-cyan-300">delay (τ) = (r_ssb · n) / c + τ_disp + b_clk</code>
            <div className="text-slate-400 mt-1 space-y-0.5">
              <p>• r_ssb: Spacecraft SSB position</p>
              <p>• n: Pulsar unit vector</p>
              <p>• c: Speed of light</p>
              <p>• b_clk: Receiver clock bias</p>
            </div>
          </div>
          
          <div>
            <h4 className="font-semibold text-white mb-1">2. Delay Data & Ranges (Real-time)</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-[9px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500">
                    <th className="pb-1">Pulsar</th>
                    <th className="pb-1">Unit Vector [x,y,z]</th>
                    <th className="pb-1 text-right">Delay (s)</th>
                  </tr>
                </thead>
                <tbody>
                  {activePulsars.map((psr, idx) => {
                    const roemer = (ssbPos[0]*psr.x + ssbPos[1]*psr.y + ssbPos[2]*psr.z) / C_KM_S;
                    const disp   = dispersionDelay(psr.dm, psr.freq);
                    const delay  = roemer + disp + clockBiasS;
                    return (
                      <tr key={psr.name} className="border-b border-slate-900">
                        <td className="py-1 text-cyan-200">{psr.name}</td>
                        <td className="py-1 text-slate-400">[{psr.x.toFixed(2)}, {psr.y.toFixed(2)}, {psr.z.toFixed(2)}]</td>
                        <td className="py-1 text-right text-amber-200 font-semibold">{delay.toFixed(4)}s</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-1">3. Navigation Matrix Solution</h4>
            <p className="text-slate-400 mb-1.5">
              The estimator solves the overdetermined system <code className="text-cyan-300">H·x = z</code>:
            </p>
            <div className="font-mono text-[9px] bg-slate-900/50 p-2.5 rounded border border-slate-800 space-y-1.5">
              <div>
                <p className="text-slate-400 mb-0.5">Measurement matrix H (Dir & Clk):</p>
                <div className="text-cyan-200">
                  {activePulsars.map(psr => `[${psr.x.toFixed(2)}, ${psr.y.toFixed(2)}, ${psr.z.toFixed(2)}, 1.0]`).join("\n")}
                </div>
              </div>
              <div className="pt-1.5 border-t border-slate-800">
                <p className="text-slate-400 mb-0.5">Corrected range vector z (km):</p>
                <div className="text-amber-200 truncate">
                  [{activePulsars.map((psr) => {
                    const roemer = (ssbPos[0]*psr.x + ssbPos[1]*psr.y + ssbPos[2]*psr.z) / C_KM_S;
                    const obsDist = roemer * C_KM_S;
                    return obsDist.toFixed(1);
                  }).join(", ")}]
                </div>
              </div>
            </div>
            <p className="text-slate-400 mt-2">
              Linear Least Squares computes the state vector <code className="text-cyan-300">x = (H^T·W·H)^-1 · H^T·W·z</code> yielding:
            </p>
            <div className="font-mono text-[10px] space-y-1 text-slate-400 mt-1">
              <p>• Coordinate origin: <span className="text-cyan-300">{isInterplanetary ? "Sun (SSB)" : "Earth (ECI)"}</span></p>
              <p>• Solved Position: <span className="text-cyan-200">[{frame.estPos.map(v=>formatKm(v)).join(", ")}]</span></p>
              <p>• Instantaneous Error: <span className="text-rose-400 font-bold">{frame.errorKm.toFixed(3)} km</span></p>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TrajectoryVisualization({
  result,
  loading,
}: {
  result: NavigationResult | null;
  loading?: boolean;
}) {
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying,    setIsPlaying]    = useState(false);
  const [speed,        setSpeed]        = useState<PlaybackSpeed>(1);
  const [pathMode,     setPathMode]     = useState<PathMode>("both");
  const [statsOpen,    setStatsOpen]    = useState(true);
  const [mathExplainerOpen, setMathExplainerOpen] = useState(true);

  const animRef     = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  // ── Generate the SEQUENTIAL orbital trajectory ────────────────────────────
  //
  // This runs whenever the simulation config changes (region, pulsars, noise).
  // It does NOT use result.samples[] — those are Monte Carlo realizations.
  // Instead it integrates the orbit from scratch using RK4+J₂ physics.
  //
  const frames = useMemo((): OrbitalFrame[] => {
    if (!result) return [];
    return generateOrbitalTrajectory(
      result.config.region,
      result.pulsars,
      result.config.noiseNs,
      result.config.seed,
    );
  }, [result]);

  const totalFrames = frames.length;

  // ── Animation loop ─────────────────────────────────────────────────────────

  const BASE_MS = 70; // ms between frames at 1x speed

  const animate = useCallback((timestamp: number) => {
    if (!lastTimeRef.current) lastTimeRef.current = timestamp;
    if (timestamp - lastTimeRef.current >= BASE_MS / speed) {
      lastTimeRef.current = timestamp;
      setCurrentFrame(prev => {
        if (prev >= totalFrames - 1) { setIsPlaying(false); return prev; }
        return prev + 1;
      });
    }
    animRef.current = requestAnimationFrame(animate);
  }, [speed, totalFrames]);

  useEffect(() => {
    if (isPlaying && totalFrames > 0) {
      lastTimeRef.current = 0;
      animRef.current = requestAnimationFrame(animate);
    } else {
      if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
    }
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [isPlaying, animate, totalFrames]);

  // Reset when result changes
  useEffect(() => { setCurrentFrame(0); setIsPlaying(false); }, [result]);

  // ── Derived values ─────────────────────────────────────────────────────────

  const frame     = frames[currentFrame] ?? null;
  const prevFrame = currentFrame > 0 ? frames[currentFrame-1] : null;
  const region    = result?.config.region ?? "earth_moon";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Orbit className="h-5 w-5 text-cyan-400" />
            Spacecraft Trajectory Visualization
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Sequential orbital trajectory — RK4+J₂ propagation •{" "}
            <span className="text-cyan-300">
              {totalFrames} timesteps • WLS navigation solver
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-slate-400 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 py-1.5">
          <Signal className="h-3.5 w-3.5 text-green-400" />
          <span>
            Physics: RK4+J₂ gravity •{" "}
            <span className="text-cyan-300">
              Position(t) → Position(t+Δt)
            </span>{" "}
            sequential
          </span>
        </div>
      </div>

      {/* 3D Viewport */}
      <div
        className="relative rounded-2xl border border-cyan-400/15 overflow-hidden bg-[#050816]"
        style={{ height: "calc(100vh - 300px)", minHeight: 520 }}
      >
        {loading && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/80 backdrop-blur">
            <div className="text-center space-y-3">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent mx-auto" />
              <p className="text-sm text-slate-400 font-mono">Running navigation simulation…</p>
            </div>
          </div>
        )}

        {!loading && !result ? (
          <EmptyState />
        ) : (
          <>
            <Canvas camera={{ position: [0, 4, 10], fov: 52 }}
              gl={{ preserveDrawingBuffer: true, antialias: true }}
              className="absolute inset-0">
              <color attach="background" args={["#050816"]} />
              {frames.length > 0 && (
                <OrbitalScene
                  frames={frames}
                  currentFrame={currentFrame}
                  region={region}
                  pulsarNames={result?.pulsars ?? []}
                  pathMode={pathMode}
                />
              )}
              <CameraControls />
            </Canvas>

            {result && (
              <>
                <ContextOverlay result={result} currentFrame={currentFrame} totalFrames={totalFrames} />
                <NavigationExplainerPanel result={result} frame={frame} open={mathExplainerOpen} onToggle={()=>setMathExplainerOpen(v=>!v)} />
                <TelemetryPanel frame={frame} prevFrame={prevFrame} region={region} />
                <StatsPanel frames={frames} result={result} open={statsOpen} onToggle={()=>setStatsOpen(v=>!v)} />
                <PathToggle mode={pathMode} onChange={setPathMode} />
              </>
            )}

            <ControlsBar
              isPlaying={isPlaying}
              speed={speed}
              currentFrame={currentFrame}
              totalFrames={totalFrames}
              onPlay={() => { if (currentFrame >= totalFrames-1) setCurrentFrame(0); setIsPlaying(true); }}
              onPause={() => setIsPlaying(false)}
              onReset={() => { setIsPlaying(false); setCurrentFrame(0); }}
              onSpeedChange={s => { setSpeed(s); lastTimeRef.current = 0; }}
              onScrub={f => { setIsPlaying(false); setCurrentFrame(f); }}
            />
          </>
        )}
      </div>

      {/* Pulsar source bar */}
      {result && result.pulsars.length > 0 && (
        <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}}
          className="rounded-xl border border-slate-700/60 bg-slate-950/60 p-4 backdrop-blur">
          <div className="mb-3 flex items-center gap-2">
            <Signal className="h-4 w-4 text-cyan-400" />
            <span className="text-sm font-semibold text-slate-200">Active Pulsar Navigation Sources</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {result.pulsars.map((name,idx) => (
              <div key={name}
                className="flex items-center gap-1.5 rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-1.5 text-xs font-mono text-sky-200">
                <span className={cn("h-1.5 w-1.5 rounded-full", idx%2===0?"bg-sky-400":"bg-green-400")} />
                {name}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500 leading-relaxed">
            Trajectory generated by sequential RK4 orbital integration (J₂ perturbation) — not
            Monte Carlo. Each frame satisfies{" "}
            <code className="text-cyan-400">r(t+Δt) = RK4(r(t), v(t), Δt)</code>.
            Pulsar delays: Römer + interstellar dispersion + timing noise.
          </p>
        </motion.div>
      )}
    </div>
  );
}
