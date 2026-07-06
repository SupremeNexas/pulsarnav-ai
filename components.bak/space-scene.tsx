"use client";

/**
 * SpaceScene — Premium 3D Space Visualization
 * ============================================
 * A research-grade, visually rich 3D scene for the PulsarNav AI dashboard.
 *
 * Visual elements:
 *   - Procedural starfield (1200 stars with size/brightness variation)
 *   - Earth with atmospheric glow ring
 *   - Moon orbiting realistically
 *   - Sun as distant luminous object with corona haze
 *   - Inner planets: Mercury, Venus, Mars (representative positions)
 *   - Outer planets: Jupiter, Saturn (schematic distances)
 *   - Pulsars: glowing animated spheres at sky-direction positions
 *   - Navigation rays: pulsars → spacecraft (line-of-sight)
 *   - True spacecraft position (green emissive)
 *   - XNAV estimated position (amber emissive)
 *   - Error vector (red line)
 *   - EKF trajectory paths (green/amber lines)
 *   - LS/WLS covariance cloud
 *
 * ALL navigation mathematics, simulation logic, and physics are untouched.
 * This file is purely the visualization layer.
 *
 * Color conventions (ISRO/SAC standard):
 *   #22C55E  Lime green  — True spacecraft position / trajectory
 *   #F59E0B  Amber       — XNAV estimated position / trajectory
 *   #EF4444  Red         — Error vector
 *   #38BDF8  Sky blue    — Pulsar nodes (primary)
 *   #A78BFA  Violet      — Pulsar nodes (alternate)
 *   #FCD34D  Yellow      — Sun
 *   #94A3B8  Slate       — Moon
 */

import { Canvas, useFrame, useThree, extend } from "@react-three/fiber";
import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { cn } from "@/lib/utils";
import {
  Eye,
  EyeOff,
  Globe,
  HelpCircle,
  Layers,
  Radio,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PULSAR_CATALOGUE } from "@/lib/pulsar-catalogue";

extend({ OrbitControls });

// ─── Pulsar catalogue (sourced from lib/pulsar-catalogue.ts — single source of truth) ──
// Stability rating added for visualization purposes.
const STABILITY_RATINGS: Record<string, string> = {
  "J0613-0200": "A+", "J1713+0747": "A+",
  "J1909-3744": "A",  "J1744-1134": "A",
  "J1012+5307": "B",  "J0030+0451": "B",
  "J2317+1439": "B",  "J1640+2224": "C",
};
const PULSAR_VECTORS: Record<
  string,
  { x: number; y: number; z: number; freq: number; dm: number; stability: string }
> = Object.fromEntries(
  PULSAR_CATALOGUE.map(p => [p.name, { ...p, stability: STABILITY_RATINGS[p.name] ?? "C" }])
);

// ─── Planet data (schematic positions for navigation demo context) ────────────
const PLANETS = [
  { name: "Sun",     color: "#FCD34D", emissive: "#F59E0B", radius: 0.55, dist: 0,    angle: 0,    ring: false, description: "Solar System barycenter reference. 8.32 light-min from Earth." },
  { name: "Mercury", color: "#9CA3AF", emissive: "#6B7280", radius: 0.06, dist: 2.8,  angle: 0.8,  ring: false, description: "0.39 AU. Innermost planet, minimal gravitational effect on XNAV." },
  { name: "Venus",   color: "#FDE68A", emissive: "#D97706", radius: 0.10, dist: 3.8,  angle: 2.1,  ring: false, description: "0.72 AU. Brightest planet, reference for optical nav systems." },
  { name: "Mars",    color: "#EF4444", emissive: "#DC2626", radius: 0.08, dist: 5.8,  angle: 4.5,  ring: false, description: "1.52 AU. Key XNAV mission target. Thin atmosphere." },
  { name: "Jupiter", color: "#D97706", emissive: "#92400E", radius: 0.20, dist: 8.5,  angle: 1.2,  ring: false, description: "5.20 AU. Largest planet. Strong gravitational perturbation source." },
  { name: "Saturn",  color: "#F3E8A0", emissive: "#A16207", radius: 0.16, dist: 10.8, angle: 3.4,  ring: true,  description: "9.58 AU. Saturn with ring system visible at this scale." },
];

// ─── Scale helper ─────────────────────────────────────────────────────────────
function getScaleFactor(region: string) {
  if (region === "earth_orbit") return 1 / 8_000;
  if (region === "earth_moon")  return 1 / 65_000;
  if (region === "interplanetary") return 1 / 30_000_000;
  return 1 / 280_000;
}

// ─── Orbit controls ───────────────────────────────────────────────────────────
function Controls() {
  const { camera, gl } = useThree();
  const ref = useRef<any>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.enableDamping  = true;
      ref.current.dampingFactor  = 0.06;
      ref.current.maxDistance    = 18;
      ref.current.minDistance    = 1.5;
    }
  }, []);
  useFrame(() => ref.current?.update());
  // @ts-ignore
  return <orbitControls ref={ref} args={[camera, gl.domElement]} />;
}

// ─── 3D Starfield Shell (600 stars) ───────────────────────────────────────────
function Starfield() {
  const geom = useMemo(() => {
    const N = 600;
    const positions = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const theta = Math.random() * 2 * Math.PI;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 35; // fixed shell radius
      positions[i*3]   = r * Math.sin(phi) * Math.cos(theta);
      positions[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i*3+2] = r * Math.cos(phi);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, []);

  const mat = useMemo(() =>
    new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.08,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
    }), []);

  return <points geometry={geom} material={mat} />;
}

// ─── Atmospheric glow ring around Earth ───────────────────────────────────────
function AtmosphereGlow({ position = [0, 0, 0], radius }: { position?: [number, number, number]; radius: number }) {
  const mat = useMemo(() =>
    new THREE.MeshBasicMaterial({
      color: "#38BDF8",
      transparent: true,
      opacity: 0.07,
      side: THREE.BackSide,
    }), []);
  return (
    <mesh position={position}>
      <sphereGeometry args={[radius * 1.18, 32, 32]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

// ─── Pulsing glow sprite around a sphere ─────────────────────────────────────
function PulsarGlow({ position, color, size }: { position: [number,number,number]; color: string; size: number }) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (ref.current) {
      const s = 1 + 0.18 * Math.sin(clock.getElapsedTime() * 3.5 + position[0]);
      ref.current.scale.setScalar(s);
      (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.13 + 0.07 * Math.sin(clock.getElapsedTime() * 2);
    }
  });
  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[size * 2.2, 16, 16]} />
      <meshBasicMaterial color={color} transparent opacity={0.15} side={THREE.FrontSide} />
    </mesh>
  );
}

// ─── Saturn rings ─────────────────────────────────────────────────────────────
function SaturnRings({ position, radius }: { position: [number,number,number]; radius: number }) {
  const mat = useMemo(() =>
    new THREE.MeshBasicMaterial({ color: "#D4B896", transparent: true, opacity: 0.35, side: THREE.DoubleSide }), []);
  return (
    <mesh position={position} rotation={[Math.PI / 2.8, 0, 0.3]}>
      <ringGeometry args={[radius * 1.5, radius * 2.4, 48]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

// ─── Coordinate conversions & SSB Earth Ephemeris ─────────────────────────────
function earthPositionSsb(epochMjd: number): [number, number, number] {
  const T = (epochMjd - 51544.5) / 36525.0;
  const a_au = 1.00000011 - 0.00000005 * T;
  const e = 0.01671022 - 0.00003804 * T;
  const varpi_rad = (102.94719 + 0.32327 * T) * Math.PI / 180;
  const M_rad = (357.52911 + 35999.05029 * T - 0.0001559 * T * T) * Math.PI / 180;
  
  let E = M_rad;
  for (let i = 0; i < 5; i++) {
    E = E - (E - e * Math.sin(E) - M_rad) / (1 - e * Math.cos(E));
  }
  
  const cos_v = (Math.cos(E) - e) / (1 - e * Math.cos(E));
  const sin_v = (Math.sqrt(1 - e * e) * Math.sin(E)) / (1 - e * Math.cos(E));
  const v = Math.atan2(sin_v, cos_v);
  
  const r_au = a_au * (1 - e * Math.cos(E));
  const lambda_rad = varpi_rad + v;
  
  const x_ecl = r_au * Math.cos(lambda_rad);
  const y_ecl = r_au * Math.sin(lambda_rad);
  
  const eps = 23.43929111 * Math.PI / 180;
  const x_eq = x_ecl;
  const y_eq = y_ecl * Math.cos(eps);
  const z_eq = y_ecl * Math.sin(eps);
  
  const AU_TO_KM = 149597870.7;
  return [x_eq * AU_TO_KM, y_eq * AU_TO_KM, z_eq * AU_TO_KM];
}

function getRaDec(x: number, y: number, z: number): { ra: string, dec: string } {
  const decRad = Math.asin(z);
  const decDeg = decRad * 180 / Math.PI;
  
  let raDeg = Math.atan2(y, x) * 180 / Math.PI;
  if (raDeg < 0) raDeg += 360;
  
  const raHoursTotal = raDeg / 15;
  const raH = Math.floor(raHoursTotal);
  const raM = Math.floor((raHoursTotal - raH) * 60);
  const raS = ((raHoursTotal - raH - raM / 60) * 3600).toFixed(1);
  
  const decSign = decDeg >= 0 ? "+" : "";
  const decDegAbs = Math.abs(decDeg);
  const decD = Math.floor(decDegAbs);
  const decM = Math.floor((decDegAbs - decD) * 60);
  const decS = ((decDegAbs - decD - decM / 60) * 3600).toFixed(1);
  
  return {
    ra: `${raH}h ${raM}m ${raS}s`,
    dec: `${decSign}${decD}° ${decM}′ ${decS}″`,
  };
}

// ─── Label projector (60fps direct DOM) ──────────────────────────────────────
function LabelProjector({
  region, lastSample, activePulsars, showLabels, refs,
}: {
  region: string;
  lastSample: any;
  activePulsars: string[];
  showLabels: boolean;
  refs: {
    earth:      React.RefObject<HTMLDivElement | null>;
    spacecraft: React.RefObject<HTMLDivElement | null>;
    estimated:  React.RefObject<HTMLDivElement | null>;
    pulsars:    React.MutableRefObject<Record<string, HTMLDivElement | null>>;
    planets:    React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  };
}) {
  const { camera, gl } = useThree();
  const scale = getScaleFactor(region);

  useFrame(() => {
    const w = gl.domElement.clientWidth;
    const h = gl.domElement.clientHeight;

    const project = (pos3d: THREE.Vector3, el: HTMLDivElement | null) => {
      if (!el) return;
      if (!showLabels) { el.style.display = "none"; return; }
      const v = pos3d.clone().project(camera);
      if (v.z > 1) { el.style.display = "none"; return; }
      el.style.display = "block";
      el.style.left = `${(v.x * 0.5 + 0.5) * w}px`;
      el.style.top  = `${(-v.y * 0.5 + 0.5) * h}px`;
    };

    const dt = region === "earth_orbit" ? 30 : region === "earth_moon" ? 120 : region === "deep_space" ? 600 : 14400;
    const tElapsed = (lastSample?.trial ?? 0) * dt;
    const epochMjdNow = 58000.0 + tElapsed / 86400.0;
    const earthSSB = earthPositionSsb(epochMjdNow);
    const isInterplanetary = region === "interplanetary";

    let earthPos = new THREE.Vector3(0, 0, 0);
    let spacecraftPos = new THREE.Vector3(0, 0, 0);
    let spacecraftEstPos = new THREE.Vector3(0, 0, 0);
    let sunPos = new THREE.Vector3(-earthSSB[0]*scale, -earthSSB[1]*scale, -earthSSB[2]*scale);

    if (isInterplanetary) {
      sunPos.set(0, 0, 0);
      earthPos.set(earthSSB[0]*scale, earthSSB[1]*scale, earthSSB[2]*scale);
    }

    project(earthPos, refs.earth.current);

    if (lastSample) {
      spacecraftPos.set(
        lastSample.truePosition[0]*scale, lastSample.truePosition[1]*scale, lastSample.truePosition[2]*scale
      );
      spacecraftEstPos.set(
        lastSample.estimated[0]*scale, lastSample.estimated[1]*scale, lastSample.estimated[2]*scale
      );
      project(spacecraftPos, refs.spacecraft.current);
      project(spacecraftEstPos, refs.estimated.current);
    }

    activePulsars.forEach(p => {
      const dir = PULSAR_VECTORS[p] ?? { x:1, y:0, z:0 };
      project(new THREE.Vector3(dir.x*25, dir.y*25, dir.z*25), refs.pulsars.current[p]);
    });

    PLANETS.forEach(pl => {
      if (pl.name === "Sun") {
        project(sunPos, refs.planets.current[pl.name]);
      } else {
        const pos = isInterplanetary
          ? new THREE.Vector3(Math.cos(pl.angle) * pl.dist * 1.2, 0.3, Math.sin(pl.angle) * pl.dist * 1.2)
          : new THREE.Vector3(earthPos.x + Math.cos(pl.angle) * pl.dist, earthPos.y + 0.3, earthPos.z + Math.sin(pl.angle) * pl.dist);
        project(pos, refs.planets.current[pl.name]);
      }
    });
  });

  return null;
}

// ─── Main 3D scene objects ────────────────────────────────────────────────────
function SceneObjects({
  result,
  showPlanets,
  showPulsars,
  showTrajectory,
  showRays,
  setHovered,
}: {
  result: any;
  showPlanets:    boolean;
  showPulsars:    boolean;
  showTrajectory: boolean;
  showRays:       boolean;
  setHovered: (info: any) => void;
}) {
  const region    = result?.config?.region   ?? "earth_moon";
  const algorithm = result?.config?.algorithm ?? "WLS";
  const scale     = getScaleFactor(region);
  const activePulsars: string[] = result?.pulsars ?? Object.keys(PULSAR_VECTORS).slice(0, 6);
  const lastSample = result?.samples?.[result.samples.length - 1] ?? null;

  // Refs for animated bodies
  const earthRef = useRef<THREE.Mesh>(null!);
  const moonRef  = useRef<THREE.Mesh>(null!);

  const dt = algorithm === "EKF"
    ? (region === "earth_orbit" ? 10 : region === "earth_moon" ? 120 : region === "deep_space" ? 600 : 14400)
    : (region === "earth_orbit" ? 30 : region === "earth_moon" ? 120 : region === "deep_space" ? 600 : 14400);
  const tElapsed = (lastSample?.trial ?? 0) * dt;
  const epochMjdNow = 58000.0 + tElapsed / 86400.0;
  const earthSSB = earthPositionSsb(epochMjdNow);
  const isInterplanetary = region === "interplanetary";

  useFrame(({ clock }) => {
    if (earthRef.current) earthRef.current.rotation.y += 0.0025;
  });

  // Calculate 3D positions based on reference center
  let earthPos = new THREE.Vector3(0, 0, 0);
  let spacecraftPos = new THREE.Vector3(0, 0, 0);
  let spacecraftEstPos = new THREE.Vector3(0, 0, 0);
  let sunPos = new THREE.Vector3(-earthSSB[0]*scale, -earthSSB[1]*scale, -earthSSB[2]*scale);
  let moonPos = new THREE.Vector3(0, 0, 0);

  if (isInterplanetary) {
    sunPos.set(0, 0, 0);
    earthPos.set(earthSSB[0]*scale, earthSSB[1]*scale, earthSSB[2]*scale);
    
    const moonDist = 0.5;
    const moonT = Date.now() * 0.0002;
    moonPos.set(
      earthPos.x + Math.cos(moonT)*moonDist,
      earthPos.y + Math.sin(moonT)*0.05,
      earthPos.z + Math.sin(moonT)*moonDist
    );
  } else {
    earthPos.set(0, 0, 0);
    
    const moonDist = region === "earth_orbit" ? 5.5 : region === "earth_moon" ? 7.5 : 8.2;
    const moonT = Date.now() * 0.0001;
    moonPos.set(Math.cos(moonT)*moonDist, Math.sin(moonT)*0.15, Math.sin(moonT)*moonDist);
  }

  if (lastSample) {
    spacecraftPos.set(lastSample.truePosition[0]*scale, lastSample.truePosition[1]*scale, lastSample.truePosition[2]*scale);
    spacecraftEstPos.set(lastSample.estimated[0]*scale, lastSample.estimated[1]*scale, lastSample.estimated[2]*scale);
  }

  const earthRadius = useMemo(() => Math.max(0.12, 6378.1 * scale), [scale]);

  // orbit paths
  const trajectoryLines = useMemo(() => {
    if (!result || !result.samples) return { trueLine: null, estLine: null };
    const tp: THREE.Vector3[] = [], ep: THREE.Vector3[] = [];
    result.samples.forEach((s: any) => {
      tp.push(new THREE.Vector3(s.truePosition[0]*scale, s.truePosition[1]*scale, s.truePosition[2]*scale));
      ep.push(new THREE.Vector3(s.estimated[0]*scale,    s.estimated[1]*scale,    s.estimated[2]*scale));
    });
    return {
      trueLine: new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(tp),
        new THREE.LineBasicMaterial({ color:"#22C55E", opacity:0.7, transparent:true })
      ),
      estLine: new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(ep),
        new THREE.LineBasicMaterial({ color:"#F59E0B", opacity:0.65, transparent:true })
      ),
    };
  }, [result, scale]);

  // LS/WLS covariance cloud
  const covCloud = useMemo(() => {
    if (!result || algorithm === "EKF" || !result.samples) return null;
    const pts: number[] = [];
    result.samples.slice(0, 80).forEach((s: any) => {
      pts.push(s.estimated[0]*scale, s.estimated[1]*scale, s.estimated[2]*scale);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [result, algorithm, scale]);

  // Error vector
  const errLine = useMemo(() => {
    if (!lastSample) return null;
    return new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        spacecraftPos,
        spacecraftEstPos,
      ]),
      new THREE.LineBasicMaterial({ color:"#EF4444" })
    );
  }, [lastSample, scale, spacecraftPos, spacecraftEstPos]);

  // Pulsar rays
  const pulsarRays = useMemo(() => {
    const target = lastSample ? spacecraftPos : new THREE.Vector3(1.6, 0.4, 0.4);
    return activePulsars.map((p, i) => {
      const dir = PULSAR_VECTORS[p] ?? { x:1, y:0, z:0 };
      return {
        p, dir,
        ray: new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(dir.x*25, dir.y*25, dir.z*25), target,
          ]),
          new THREE.LineBasicMaterial({
            color: i % 2 ? "#A78BFA" : "#38BDF8",
            opacity: 0.22, transparent: true,
          })
        ),
        color: i % 2 ? "#A78BFA" : "#38BDF8",
        isTopTier: PULSAR_VECTORS[p]?.stability === "A+" || PULSAR_VECTORS[p]?.stability === "A",
      };
    });
  }, [activePulsars, lastSample, scale, spacecraftPos]);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.3} />
      <pointLight position={[sunPos.x, sunPos.y, sunPos.z]} intensity={4.5} color="#FCD34D" decay={2} />
      <pointLight position={[6, 8, 6]}    intensity={1.8} color="#38BDF8"  decay={2} />
      <pointLight position={[-6,-6,-6]}   intensity={0.8} color="#1d4ed8"  decay={2} />

      {/* Starfield */}
      <Starfield />

      {/* Celestial Sphere coordinate grid wireframe */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[25, 24, 24]} />
        <meshBasicMaterial color="#334155" wireframe transparent opacity={0.12} />
      </mesh>
      
      {/* Celestial Equator ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[24.9, 25.1, 64]} />
        <meshBasicMaterial color="#475569" transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>

      {/* Earth */}
      <mesh ref={earthRef} position={[earthPos.x, earthPos.y, earthPos.z]}
        onPointerOver={e => { e.stopPropagation(); setHovered({ name:"Earth (WGS-84 Reference)", pos:[earthPos.x,earthPos.y,earthPos.z], desc: isInterplanetary ? "Earth orbiting the Sun." : "ECI coordinate frame origin. All positions are Earth-centered inertial." }); }}
        onPointerOut={() => setHovered(null)}>
        <sphereGeometry args={[earthRadius, 48, 48]} />
        <meshStandardMaterial color="#1a5fa8" roughness={0.5} metalness={0.1} emissive="#0a2a50" emissiveIntensity={0.35} />
      </mesh>
      <AtmosphereGlow position={[earthPos.x, earthPos.y, earthPos.z]} radius={earthRadius} />

      {/* Moon */}
      {region !== "deep_space" && (
        <mesh ref={moonRef} position={[moonPos.x, moonPos.y, moonPos.z]}
          onPointerOver={e => { e.stopPropagation(); setHovered({ name:"Moon", pos:[moonPos.x,moonPos.y,moonPos.z], desc:"Natural satellite. Critical cislunar navigation waypoint." }); }}
          onPointerOut={() => setHovered(null)}>
          <sphereGeometry args={[Math.max(0.09, earthRadius * 0.27), 28, 28]} />
          <meshStandardMaterial color="#6B7280" roughness={0.88} metalness={0.05} />
        </mesh>
      )}

      {/* Planets */}
      {showPlanets && PLANETS.map(pl => {
        const pos: [number,number,number] = pl.name === "Sun"
          ? [sunPos.x, sunPos.y, sunPos.z]
          : isInterplanetary
            ? [Math.cos(pl.angle) * pl.dist * 1.2, 0.3, Math.sin(pl.angle) * pl.dist * 1.2]
            : [
                earthPos.x + Math.cos(pl.angle) * pl.dist,
                earthPos.y + 0.3,
                earthPos.z + Math.sin(pl.angle) * pl.dist
              ];
        return (
          <group key={pl.name}>
            <mesh position={pos}
              onPointerOver={e => { e.stopPropagation(); setHovered({ name: pl.name, pos, desc: pl.description }); }}
              onPointerOut={() => setHovered(null)}>
              <sphereGeometry args={[pl.radius, 28, 28]} />
              <meshStandardMaterial color={pl.color} emissive={pl.emissive} emissiveIntensity={pl.name==="Sun" ? 1.8 : 0.4} roughness={0.7} />
            </mesh>
            {/* Sun corona */}
            {pl.name === "Sun" && (
              <>
                <mesh position={pos}>
                  <sphereGeometry args={[pl.radius * 1.6, 24, 24]} />
                  <meshBasicMaterial color="#F59E0B" transparent opacity={0.06} side={THREE.BackSide} />
                </mesh>
                <mesh position={pos}>
                  <sphereGeometry args={[pl.radius * 2.5, 24, 24]} />
                  <meshBasicMaterial color="#FCD34D" transparent opacity={0.03} side={THREE.BackSide} />
                </mesh>
              </>
            )}
            {/* Saturn rings */}
            {pl.ring && <SaturnRings position={pos} radius={pl.radius} />}
          </group>
        );
      })}

      {/* Pulsar nodes */}
      {showPulsars && pulsarRays.map(({ p, dir, color, isTopTier }) => {
        const pos: [number,number,number] = [dir.x*25, dir.y*25, dir.z*25];
        const pv = PULSAR_VECTORS[p];
        const { ra, dec } = getRaDec(dir.x, dir.y, dir.z);
        return (
          <group key={p}>
            {/* Glow halo */}
            <PulsarGlow position={pos} color={color} size={isTopTier ? 0.12 : 0.09} />
            {/* Core sphere */}
            <mesh position={pos}
              onPointerOver={e => { e.stopPropagation(); setHovered({
                name: `MSP ${p}`,
                pos: [dir.x * 2e5, dir.y * 2e5, dir.z * 2e5],
                desc: `RA: ${ra} | DEC: ${dec} | Freq: ${pv.freq} Hz | DM: ${pv.dm} pc·cm⁻³. Distant reference beacon located on the celestial sphere.`,
              }); }}
              onPointerOut={() => setHovered(null)}>
              <sphereGeometry args={[isTopTier ? 0.10 : 0.075, 20, 20]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={isTopTier ? 2.2 : 1.4} roughness={0.1} />
            </mesh>
          </group>
        );
      })}

      {/* Pulsar navigation rays */}
      {showRays && showPulsars && pulsarRays.map(({ p, ray }) => (
        <primitive key={`ray-${p}`} object={ray} />
      ))}

      {/* True spacecraft */}
      {lastSample ? (
        <mesh
          position={[spacecraftPos.x, spacecraftPos.y, spacecraftPos.z]}
          onPointerOver={e => { e.stopPropagation(); setHovered({ name:"Spacecraft — True Position", pos: lastSample.truePosition, desc:"Physics-propagated true coordinate vector (RK4+J₂ integrator output)." }); }}
          onPointerOut={() => setHovered(null)}>
          <sphereGeometry args={[0.11, 28, 28]} />
          <meshStandardMaterial color="#22C55E" emissive="#22C55E" emissiveIntensity={1.8} roughness={0.1} />
        </mesh>
      ) : (
        /* Idle animated spacecraft */
        <IdleSpacecraft />
      )}

      {/* Estimated spacecraft */}
      {lastSample && (
        <mesh
          position={[spacecraftEstPos.x, spacecraftEstPos.y, spacecraftEstPos.z]}
          onPointerOver={e => { e.stopPropagation(); setHovered({ name:"XNAV Estimated Position", pos: lastSample.estimated, desc:`Navigation solution via ${algorithm}. Position error: ${lastSample.errorKm?.toFixed(4)} km.` }); }}
          onPointerOut={() => setHovered(null)}>
          <sphereGeometry args={[0.09, 28, 28]} />
          <meshStandardMaterial color="#F59E0B" emissive="#F59E0B" emissiveIntensity={1.5} roughness={0.1} />
        </mesh>
      )}

      {/* Error vector */}
      {errLine && <primitive object={errLine} />}

      {/* Orbit trajectories */}
      {showTrajectory && trajectoryLines.trueLine && (
        <primitive object={trajectoryLines.trueLine} />
      )}
      {showTrajectory && trajectoryLines.estLine && (
        <primitive object={trajectoryLines.estLine} />
      )}

      {/* LS/WLS covariance cloud */}
      {showTrajectory && algorithm !== "EKF" && covCloud && (
        <points geometry={covCloud}>
          <pointsMaterial color="#F59E0B" size={0.055} opacity={0.45} transparent />
        </points>
      )}
    </>
  );
}

// ─── Idle animated spacecraft (when no simulation has run) ────────────────────
function IdleSpacecraft() {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * 0.32;
    ref.current.position.set(Math.cos(t)*2.2, Math.sin(t*0.5)*0.5, Math.sin(t)*1.5);
    ref.current.rotation.y += 0.012;
  });
  return (
    <mesh ref={ref}>
      <coneGeometry args={[0.13, 0.42, 4]} />
      <meshStandardMaterial color="#E2E8F0" emissive="#38BDF8" emissiveIntensity={0.45} roughness={0.4} />
    </mesh>
  );
}

// ─── Toggle button ────────────────────────────────────────────────────────────
function ToggleBtn({
  active, icon: Icon, label, onClick,
}: { active: boolean; icon: React.FC<{ className?: string }>; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all",
        active
          ? "border-cyan-500/60 bg-cyan-500/20 text-cyan-200"
          : "border-slate-700/60 bg-slate-900/60 text-slate-400 hover:border-slate-600 hover:text-slate-200"
      )}>
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────
function Legend({ algorithm }: { algorithm: string }) {
  const items = [
    { dot: "bg-[#22C55E]",  line: false, label: "True Position (RK4+J₂)" },
    { dot: "bg-[#F59E0B]",  line: false, label: "XNAV Estimated (Nav solution)" },
    { dot: "",              line: true,  lineColor: "bg-[#EF4444]", label: "Error Vector" },
    { dot: "bg-[#38BDF8]",  line: false, label: "Pulsar (primary tier)" },
    { dot: "bg-[#A78BFA]",  line: false, label: "Pulsar (secondary tier)" },
    { dot: "bg-[#1a5fa8]",  line: false, label: "Earth (ECI origin)" },
    { dot: "bg-[#FCD34D]",  line: false, label: "Sun (illumination ref.)" },
    ...(algorithm === "EKF" ? [
      { dot: "", line: true, lineColor: "bg-[#22C55E]", label: "True Trajectory" },
      { dot: "", line: true, lineColor: "bg-[#F59E0B]", label: "EKF Estimated Path" },
    ] : [
      { dot: "", line: false, label: "Est. Cloud (WLS/LS samples)", dot2: "rounded-full border border-amber-500/40 bg-amber-500/15 w-2.5 h-2.5" },
    ]),
  ];

  return (
    <div className="space-y-1.5 text-[10px]">
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-2 text-slate-300">
          {item.line ? (
            <div className={cn("h-0.5 w-4 rounded shrink-0", item.lineColor)} />
          ) : item.dot2 ? (
            <div className={item.dot2} />
          ) : (
            <div className={cn("h-2.5 w-2.5 rounded-full shrink-0", item.dot)} />
          )}
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Help panel ───────────────────────────────────────────────────────────────
function HelpPanel({ onClose }: { onClose: () => void }) {
  return (
    <motion.div initial={{ x: -320, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
      exit={{ x: -320, opacity: 0 }} transition={{ type:"spring", damping:26, stiffness:240 }}
      className="absolute inset-y-0 left-0 z-30 w-80 border-r border-slate-700/60 bg-slate-950/97 p-5 backdrop-blur-xl shadow-2xl flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-cyan-200 uppercase tracking-widest">What am I seeing?</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 text-xs text-slate-300 leading-relaxed flex-1">
        <section>
          <h3 className="font-semibold text-white mb-1.5">🛰 Pulsar Navigation (XNAV)</h3>
          <p>Autonomous spacecraft navigation using periodic X-ray pulses from millisecond pulsars. Each pulsar acts as a natural atomic clock, enabling position determination without ground contact.</p>
        </section>
        <section>
          <h3 className="font-semibold text-white mb-1.5">🌍 Reference Frame</h3>
          <p>Earth-Centered Inertial (ECI, J2000 epoch). All coordinates in kilometres. Barycentric Römer delays applied using planetary ephemeris model.</p>
        </section>
        <section>
          <h3 className="font-semibold text-white mb-1.5">🟢 / 🟡 True vs Estimated</h3>
          <p><span className="text-green-400 font-medium">Green sphere</span> = physics-propagated true position (RK4+J₂ integrator). <span className="text-amber-400 font-medium">Amber sphere</span> = XNAV navigation solution. <span className="text-red-400 font-medium">Red line</span> = 3D position error vector.</p>
        </section>
        <section>
          <h3 className="font-semibold text-white mb-1.5">✦ Pulsars</h3>
          <p>Glowing spheres placed at sky-direction unit vectors (scaled × 6 for visibility). Brighter/larger = higher navigation quality (A+ tier). Connecting lines = line-of-sight timing rays used in the navigation solution.</p>
        </section>
        <section>
          <h3 className="font-semibold text-white mb-1.5">🌌 Planets</h3>
          <p>Schematic positions for navigation context. Distances are NOT to scale with the spacecraft region — they provide gravitational reference and solar system orientation only.</p>
        </section>
        <section>
          <h3 className="font-semibold text-white mb-1.5">⚙️ Algorithms</h3>
          <p><span className="text-cyan-300">LS</span>: Gauss-Jordan least squares, equal weighting.<br/>
          <span className="text-cyan-300">WLS</span>: Weighted by pulsar timing stability.<br/>
          <span className="text-cyan-300">EKF</span>: 8-state Kalman filter with orbital propagation — produces a continuous trajectory.</p>
        </section>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-800 text-[10px] text-slate-500">
        PulsarNav AI · SAC/ISRO Reference Edition · ECI J2000
      </div>
    </motion.div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function SpaceScene({
  full = false,
  result = null,
  loading = false,
}: {
  full?: boolean;
  result?: any;
  loading?: boolean;
}) {
  const [hovered,         setHovered]         = useState<any>(null);
  const [showHelp,        setShowHelp]        = useState(false);
  const [showPlanets,     setShowPlanets]     = useState(true);
  const [showPulsars,     setShowPulsars]     = useState(true);
  const [showTrajectory,  setShowTrajectory]  = useState(true);
  const [showRays,        setShowRays]        = useState(true);
  const [showLabels,      setShowLabels]      = useState(true);
  const [showLegend,      setShowLegend]      = useState(true);

  const region        = result?.config?.region   ?? "earth_moon";
  const algorithm     = result?.config?.algorithm ?? "WLS";
  const noise         = result?.config?.noiseNs   ?? 100;
  const pulsarsCount  = result?.pulsars?.length   ?? 6;
  const activePulsars: string[] = result?.pulsars ?? Object.keys(PULSAR_VECTORS).slice(0, 6);
  const lastSample    = result?.samples?.[result.samples.length - 1] ?? null;
  const posError      = lastSample?.errorKm;

  // Label DOM refs (direct DOM for 60fps)
  const earthLabelRef     = useRef<HTMLDivElement>(null);
  const spacecraftLabelRef = useRef<HTMLDivElement>(null);
  const estimatedLabelRef  = useRef<HTMLDivElement>(null);
  const pulsarLabelRefs    = useRef<Record<string, HTMLDivElement | null>>({});
  const planetLabelRefs    = useRef<Record<string, HTMLDivElement | null>>({});

  return (
    <div className={cn(
      "relative w-full overflow-hidden rounded-xl bg-[#050816]",
      full ? "h-[calc(100vh-220px)]" : "h-[450px]"
    )}>
      {/* 3D Canvas */}
      <Canvas camera={{ position: [0, 5, 10], fov: 50 }}
        gl={{ preserveDrawingBuffer: true, antialias: true }}>
        <color attach="background" args={["#050816"]} />
        <SceneObjects
          result={result}
          showPlanets={showPlanets}
          showPulsars={showPulsars}
          showTrajectory={showTrajectory}
          showRays={showRays}
          setHovered={setHovered}
        />
        <Controls />
        <LabelProjector
          region={region}
          lastSample={lastSample}
          activePulsars={activePulsars}
          showLabels={showLabels}
          refs={{
            earth:      earthLabelRef,
            spacecraft: spacecraftLabelRef,
            estimated:  estimatedLabelRef,
            pulsars:    pulsarLabelRefs,
            planets:    planetLabelRefs,
          }}
        />
      </Canvas>

      {/* ── Floating HTML Labels ── */}
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden text-xs">
        <div ref={earthLabelRef} style={{ display:"none" }}
          className="absolute -translate-x-1/2 -translate-y-8 rounded-md border border-sky-400/30 bg-slate-950/80 px-2 py-0.5 text-sky-200 text-[10px] font-mono backdrop-blur">
          ⊕ Earth
        </div>
        <div ref={spacecraftLabelRef} style={{ display:"none" }}
          className="absolute -translate-x-1/2 -translate-y-8 rounded-md border border-green-500/40 bg-slate-950/80 px-2 py-0.5 text-green-200 text-[10px] font-mono backdrop-blur">
          ● True Pos
        </div>
        <div ref={estimatedLabelRef} style={{ display:"none" }}
          className="absolute -translate-x-1/2 -translate-y-8 rounded-md border border-amber-500/40 bg-slate-950/80 px-2 py-0.5 text-amber-200 text-[10px] font-mono backdrop-blur">
          ◈ XNAV Est.
        </div>
        {activePulsars.map(p => {
          const pv = PULSAR_VECTORS[p];
          if (!pv) return null;
          const { ra, dec } = getRaDec(pv.x, pv.y, pv.z);
          return (
            <div key={p} ref={el => { pulsarLabelRefs.current[p] = el; }} style={{ display:"none" }}
              className="absolute -translate-x-1/2 -translate-y-12 rounded border border-violet-400/25 bg-slate-950/90 px-2 py-1 text-[9px] text-violet-200 font-mono backdrop-blur pointer-events-none whitespace-nowrap">
              <div className="font-bold border-b border-violet-500/20 pb-0.5 mb-0.5">✦ MSP {p}</div>
              <div>RA: {ra}</div>
              <div>DEC: {dec}</div>
              <div>Freq: {pv.freq} Hz</div>
            </div>
          );
        })}
        {PLANETS.map(pl => (
          <div key={pl.name} ref={el => { planetLabelRefs.current[pl.name] = el; }} style={{ display:"none" }}
            className="absolute -translate-x-1/2 -translate-y-7 rounded border border-slate-600/40 bg-slate-950/75 px-1.5 py-0.5 text-[9px] text-slate-300 font-mono backdrop-blur">
            {pl.name}
          </div>
        ))}
      </div>

      {/* ── Top-left: View toggles + Help ── */}
      <div className="absolute top-3 left-3 z-20 flex flex-wrap gap-1.5 pointer-events-auto">
        <button onClick={() => setShowHelp(v => !v)}
          className="flex items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-2.5 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-400/20 backdrop-blur transition-colors">
          <HelpCircle className="h-3.5 w-3.5" /> What am I seeing?
        </button>
      </div>

      {/* ── Top-right: Scientific context ── */}
      <div className="absolute top-3 right-3 z-10 rounded-xl border border-slate-700/60 bg-slate-950/85 p-3 backdrop-blur-xl text-xs space-y-1.5 text-slate-300 max-w-[190px] pointer-events-auto">
        <p className="font-bold text-[10px] uppercase tracking-widest text-cyan-300 mb-2">Scientific Context</p>
        <div className="space-y-1 font-mono text-[10px]">
          {[
            ["Ref Frame", "ECI (J2000)"],
            ["Units",     "km"],
            ["Pulsars",   `${pulsarsCount} sources`],
            ["Noise",     `${noise} ns`],
            ["Solver",    algorithm === "LS" ? "Least Squares" : algorithm === "WLS" ? "Weighted LS" : "EKF (8-state)"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2">
              <span className="text-slate-500">{k}</span>
              <span className="text-cyan-200 font-semibold">{v}</span>
            </div>
          ))}
          {posError !== undefined && (
            <div className="flex justify-between gap-2 pt-1 border-t border-slate-800">
              <span className="text-slate-500">Pos Error</span>
              <span className={cn("font-bold", posError > 10 ? "text-rose-400" : "text-green-400")}>
                {posError.toFixed(4)} km
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom-left: Layer toggles ── */}
      <div className="absolute bottom-3 left-3 z-10 flex flex-wrap gap-1.5 pointer-events-auto">
        <ToggleBtn active={showPlanets}    icon={Globe}   label="Planets"    onClick={() => setShowPlanets(v=>!v)} />
        <ToggleBtn active={showPulsars}    icon={Radio}   label="Pulsars"    onClick={() => setShowPulsars(v=>!v)} />
        <ToggleBtn active={showRays}       icon={Layers}  label="Nav Rays"   onClick={() => setShowRays(v=>!v)} />
        <ToggleBtn active={showTrajectory} icon={Layers}  label="Trajectory" onClick={() => setShowTrajectory(v=>!v)} />
        <ToggleBtn active={showLabels}     icon={showLabels ? Eye : EyeOff} label="Labels" onClick={() => setShowLabels(v=>!v)} />
      </div>

      {/* ── Bottom-right: Legend (collapsible) ── */}
      <div className="absolute bottom-3 right-3 z-10 pointer-events-auto">
        <div className="rounded-xl border border-slate-700/60 bg-slate-950/88 backdrop-blur-xl overflow-hidden">
          <button onClick={() => setShowLegend(v => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-300 hover:bg-slate-800/40 transition-colors">
            Legend
            <span className="text-slate-500 ml-3">{showLegend ? "▲" : "▼"}</span>
          </button>
          <AnimatePresence>
            {showLegend && (
              <motion.div initial={{ height:0, opacity:0 }} animate={{ height:"auto", opacity:1 }}
                exit={{ height:0, opacity:0 }} transition={{ duration:0.2 }}
                className="overflow-hidden px-3 pb-3 border-t border-slate-800">
                <div className="pt-2">
                  <Legend algorithm={algorithm} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Hover tooltip ── */}
      <AnimatePresence>
        {hovered && (
          <motion.div initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:6 }}
            className="absolute bottom-16 left-4 z-20 max-w-[290px] rounded-xl border border-cyan-300/25 bg-slate-950/94 p-3.5 shadow-2xl pointer-events-none backdrop-blur-xl">
            <p className="text-sm font-semibold text-cyan-100">{hovered.name}</p>
            <p className="mt-1 text-xs text-slate-300 leading-relaxed">{hovered.desc}</p>
            {hovered.pos && (
              <p className="mt-2 text-[10px] font-mono text-cyan-300">
                X: {Number(hovered.pos[0]).toFixed(1)} km<br/>
                Y: {Number(hovered.pos[1]).toFixed(1)} km<br/>
                Z: {Number(hovered.pos[2]).toFixed(1)} km
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Loading overlay ── */}
      {loading && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/70 backdrop-blur">
          <div className="text-center space-y-3">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent mx-auto" />
            <p className="text-sm text-slate-300 font-mono">Running simulation…</p>
          </div>
        </div>
      )}

      {/* ── Help panel ── */}
      <AnimatePresence>
        {showHelp && <HelpPanel onClose={() => setShowHelp(false)} />}
      </AnimatePresence>
    </div>
  );
}
