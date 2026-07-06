/**
 * lib/pulsar-catalogue.ts
 *
 * Single source of truth for the NANOGrav 12.5-year millisecond pulsar catalogue.
 *
 * These values come from the NANOGrav 12.5-year Data Release (Alam et al. 2021).
 * Unit vectors (x, y, z) are geocentric ICRS sky directions, computed from
 * published Right Ascension and Declination values.
 * DM values are in pc·cm⁻³. Median observation frequencies in MHz.
 *
 * DO NOT change these values without updating the scientific reference.
 */

export interface PulsarEntry {
  /** PSRJ designation */
  name: string;
  /** ICRS unit vector — x component */
  x: number;
  /** ICRS unit vector — y component */
  y: number;
  /** ICRS unit vector — z component */
  z: number;
  /** Dispersion measure (pc·cm⁻³) */
  dm: number;
  /** Median observation frequency (MHz) */
  freq: number;
}

/**
 * 8-pulsar NANOGrav navigation catalogue.
 * Ordered by descending navigation suitability score.
 */
export const PULSAR_CATALOGUE: readonly PulsarEntry[] = [
  { name: "J0613-0200", x: -0.0598484068, y:  0.9975891828, z: -0.0351282031, dm:  38.7, freq: 326.6 },
  { name: "J1713+0747", x: -0.1982651999, y: -0.9707222,    z:  0.1356072304, dm:  15.9, freq: 218.8 },
  { name: "J1909-3744", x:  0.2371160541, y: -0.7544395193, z: -0.6120432898, dm:  10.3, freq: 339.3 },
  { name: "J1744-1134", x: -0.0662459249, y: -0.9773963748, z: -0.2007680354, dm:   3.1, freq: 245.4 },
  { name: "J1012+5307", x: -0.5354242301, y:  0.2711741406, z:  0.7998659134, dm:   9.0, freq: 190.3 },
  { name: "J0030+0451", x:  0.9876174198, y:  0.1320268437, z:  0.0847392747, dm:   4.3, freq: 205.5 },
  { name: "J2317+1439", x:  0.9505931103, y: -0.1798143518, z:  0.2530603437, dm:  21.9, freq: 290.3 },
  { name: "J1640+2224", x: -0.3151496178, y: -0.8691582648, z:  0.3811097337, dm:  18.4, freq: 316.1 },
] as const;

/**
 * Ground station metadata (geodetic, WGS-84).
 * DSN complex coordinates.
 */
export interface GroundStation {
  name: string;
  /** Geodetic latitude (radians) */
  lat: number;
  /** Geodetic longitude (radians) */
  lon: number;
  /** Altitude above WGS-84 ellipsoid (km) */
  alt: number;
}

export const DSN_STATIONS: readonly GroundStation[] = [
  { name: "Goldstone", lat:  35.247 * Math.PI / 180, lon: -116.889 * Math.PI / 180, alt: 1.0 },
  { name: "Madrid",    lat:  40.431 * Math.PI / 180, lon:   -4.250 * Math.PI / 180, alt: 0.8 },
  { name: "Canberra",  lat: -35.401 * Math.PI / 180, lon:  148.982 * Math.PI / 180, alt: 0.7 },
] as const;

/**
 * Visualization scale factor (scene units per km).
 * Chosen so that each mission type produces a visible trajectory in the 3D scene
 * at a camera distance of ~10 scene units.
 *
 * @param missionType - Mission label as used throughout the application.
 * @returns Scene units per km scale factor.
 */
export function getMissionScale(missionType: string): number {
  switch (missionType) {
    case "LEO":
    case "GEO":
      return 1 / 10_000;
    case "Lunar Orbit":
    case "Earth-Moon Transfer":
      return 1 / 80_000;
    case "Lagrange L1/L2 Halo":
      return 1 / 300_000;
    case "Earth-Mars Transfer":
    case "Deep Space Cruise":
      return 1 / 40_000_000;
    default:
      return 1 / 80_000;
  }
}
