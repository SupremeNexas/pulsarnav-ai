"use client";

import { Canvas, useFrame, useThree, extend } from "@react-three/fiber";
import { useMemo, useRef, useState, useEffect } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { cn } from "@/lib/utils";

// Register OrbitControls for React Three Fiber
extend({ OrbitControls });

// Pulsar database vectors (identical to route.ts)
const PULSAR_VECTORS: Record<string, { x: number; y: number; z: number; freq: number }> = {
  "J0613-0200": { x: -0.0598484068, y: 0.9975891828, z: -0.0351282031, freq: 326.6 },
  "J1713+0747": { x: -0.1982651999, y: -0.9707222, z: 0.1356072304, freq: 218.8 },
  "J1909-3744": { x: 0.2371160541, y: -0.7544395193, z: -0.6120432898, freq: 339.3 },
  "J1744-1134": { x: -0.0662459249, y: -0.9773963748, z: -0.2007680354, freq: 245.4 },
  "J1012+5307": { x: -0.5354242301, y: 0.2711741406, z: 0.7998659134, freq: 190.3 },
  "J0030+0451": { x: 0.9876174198, y: 0.1320268437, z: 0.0847392747, freq: 205.5 },
  "J2317+1439": { x: 0.9505931103, y: -0.1798143518, z: 0.2530603437, freq: 290.3 },
  "J1640+2224": { x: -0.3151496178, y: -0.8691582648, z: 0.3811097337, freq: 316.1 },
};

function getScaleFactor(region: string) {
  if (region === "earth_orbit") return 1 / 8000;
  if (region === "earth_moon") return 1 / 65000;
  return 1 / 280000;
}

// 3D Controls Component
function Controls() {
  const { camera, gl } = useThree();
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.enableDamping = true;
      controlsRef.current.dampingFactor = 0.05;
      controlsRef.current.maxDistance = 15;
      controlsRef.current.minDistance = 2;
    }
  }, [camera, gl.domElement]);

  useFrame(() => {
    if (controlsRef.current) {
      controlsRef.current.update();
    }
  });

  // @ts-ignore
  return <orbitControls ref={controlsRef} args={[camera, gl.domElement]} />;
}

// Label Projector Component that runs at 60fps with direct DOM updates
function LabelProjector({
  region,
  lastSample,
  activePulsars,
  refs,
}: {
  region: string;
  lastSample: any;
  activePulsars: string[];
  refs: {
    earth: React.RefObject<HTMLDivElement | null>;
    spacecraft: React.RefObject<HTMLDivElement | null>;
    estimated: React.RefObject<HTMLDivElement | null>;
    pulsars: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  };
}) {
  const { camera, gl } = useThree();
  const scale = getScaleFactor(region);

  useFrame(() => {
    const width = gl.domElement.clientWidth;
    const height = gl.domElement.clientHeight;

    const project = (pos3d: THREE.Vector3, element: HTMLDivElement | null) => {
      if (!element) return;
      const v = pos3d.clone().project(camera);
      if (v.z > 1) {
        element.style.display = "none";
        return;
      }
      const x = (v.x * 0.5 + 0.5) * width;
      const y = (-v.y * 0.5 + 0.5) * height;
      element.style.display = "block";
      element.style.left = `${x}px`;
      element.style.top = `${y}px`;
    };

    // Project Earth
    project(new THREE.Vector3(0, 0, 0), refs.earth.current);

    // Project Spacecraft
    if (lastSample) {
      project(
        new THREE.Vector3(
          lastSample.truePosition[0] * scale,
          lastSample.truePosition[1] * scale,
          lastSample.truePosition[2] * scale
        ),
        refs.spacecraft.current
      );

      project(
        new THREE.Vector3(
          lastSample.estimated[0] * scale,
          lastSample.estimated[1] * scale,
          lastSample.estimated[2] * scale
        ),
        refs.estimated.current
      );
    }

    // Project Pulsars
    activePulsars.forEach((p) => {
      const dir = PULSAR_VECTORS[p] || { x: 1, y: 0, z: 0 };
      const pos = new THREE.Vector3(dir.x * 5, dir.y * 5, dir.z * 5);
      project(pos, refs.pulsars.current[p]);
    });
  });

  return null;
}

// Main Scene Renderer inside Canvas
function SceneObjects({
  result,
  setHovered,
}: {
  result: any;
  setHovered: (info: any) => void;
}) {
  const region = result?.config.region ?? "earth_moon";
  const algorithm = result?.config.algorithm ?? "WLS";
  const scale = getScaleFactor(region);
  const activePulsars = result?.pulsars ?? Object.keys(PULSAR_VECTORS).slice(0, 6);

  // Dynamic mesh references for simple rotating animations
  const earthMesh = useRef<THREE.Mesh>(null);
  const moonMesh = useRef<THREE.Mesh>(null);
  const spacecraftMesh = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (earthMesh.current) earthMesh.current.rotation.y += 0.003;
    if (moonMesh.current) {
      moonMesh.current.rotation.y += 0.005;
      // Orbit moon slowly
      const t = clock.getElapsedTime() * 0.05;
      const moonDist = region === "earth_orbit" ? 6 : region === "earth_moon" ? 7.68 : 8;
      moonMesh.current.position.x = Math.cos(t) * moonDist;
      moonMesh.current.position.z = Math.sin(t) * moonDist;
    }
    // Animate spacecraft if no simulation result is present (fallback idle mode)
    if (!result && spacecraftMesh.current) {
      const t = clock.getElapsedTime() * 0.3;
      spacecraftMesh.current.position.x = Math.cos(t) * 2.2;
      spacecraftMesh.current.position.y = Math.sin(t * 0.5) * 0.5;
      spacecraftMesh.current.position.z = Math.sin(t) * 1.5;
      spacecraftMesh.current.rotation.y += 0.01;
    }
  });

  // Calculate dynamic Earth size based on physical scale in viewport
  const earthRadius = useMemo(() => {
    const physicalRadius = 6378.1;
    return Math.max(0.1, physicalRadius * scale);
  }, [scale]);

  const lastSample = result?.samples ? result.samples[result.samples.length - 1] : null;

  // Orbit trajectories path lines (EKF mode)
  const trajectoryLines = useMemo(() => {
    if (!result || algorithm !== "EKF" || !result.samples) return { trueLine: null, estLine: null };
    const truePoints: THREE.Vector3[] = [];
    const estPoints: THREE.Vector3[] = [];

    result.samples.forEach((s: any) => {
      truePoints.push(new THREE.Vector3(s.truePosition[0] * scale, s.truePosition[1] * scale, s.truePosition[2] * scale));
      estPoints.push(new THREE.Vector3(s.estimated[0] * scale, s.estimated[1] * scale, s.estimated[2] * scale));
    });

    const trueGeom = new THREE.BufferGeometry().setFromPoints(truePoints);
    const estGeom = new THREE.BufferGeometry().setFromPoints(estPoints);

    const trueMat = new THREE.LineBasicMaterial({ color: "#22C55E", linewidth: 1.5, opacity: 0.65, transparent: true });
    const estMat = new THREE.LineBasicMaterial({ color: "#EF4444", linewidth: 1.5, opacity: 0.65, transparent: true });

    return {
      trueLine: new THREE.Line(trueGeom, trueMat),
      estLine: new THREE.Line(estGeom, estMat),
    };
  }, [result, algorithm, scale]);

  // Covariance cloud estimates (LS/WLS modes)
  const covarianceCloud = useMemo(() => {
    if (!result || algorithm === "EKF" || !result.samples) return null;
    const points: number[] = [];
    result.samples.slice(0, 80).forEach((s: any) => {
      points.push(s.estimated[0] * scale, s.estimated[1] * scale, s.estimated[2] * scale);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return geometry;
  }, [result, algorithm, scale]);

  // Pulsar lines of sight (pointing to spacecraft position)
  const pulsarRays = useMemo(() => {
    const target = lastSample
      ? new THREE.Vector3(lastSample.truePosition[0] * scale, lastSample.truePosition[1] * scale, lastSample.truePosition[2] * scale)
      : new THREE.Vector3(1.6, 0.4, 0.4);

    return activePulsars.map((p: string, i: number) => {
      const dir = PULSAR_VECTORS[p] || { x: 1, y: 0, z: 0 };
      const points = [
        new THREE.Vector3(dir.x * 5, dir.y * 5, dir.z * 5),
        target,
      ];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color: i % 2 ? "#38BDF8" : "#22C55E",
        opacity: 0.3,
        transparent: true
      });
      const line = new THREE.Line(geometry, material);
      return { line, p };
    });
  }, [activePulsars, lastSample, scale]);

  // Error Vector Line (LS/WLS and EKF modes)
  const errorVectorLine = useMemo(() => {
    if (!lastSample) return null;
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(lastSample.truePosition[0] * scale, lastSample.truePosition[1] * scale, lastSample.truePosition[2] * scale),
      new THREE.Vector3(lastSample.estimated[0] * scale, lastSample.estimated[1] * scale, lastSample.estimated[2] * scale),
    ]);
    const material = new THREE.LineBasicMaterial({ color: "#EF4444", linewidth: 2 });
    return new THREE.Line(geometry, material);
  }, [lastSample, scale]);

  return (
    <>
      <ambientLight intensity={0.4} />
      <pointLight position={[6, 6, 6]} intensity={2.5} color="#38BDF8" />
      <pointLight position={[-6, -6, -6]} intensity={1.0} color="#1d4ed8" />

      {/* Grid on XY plane */}
      <gridHelper args={[16, 16, "#1E293B", "#0F172A"]} rotation={[Math.PI / 2, 0, 0]} />
      {/* Coordinate axes */}
      <axesHelper args={[4]} />

      {/* Earth */}
      <mesh
        ref={earthMesh}
        position={[0, 0, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered({
            name: "Earth (WGS-84 Center)",
            pos: [0, 0, 0],
            desc: "The coordinate reference frame origin. Displayed with dynamic physical scale factor.",
          });
        }}
        onPointerOut={() => setHovered(null)}
      >
        <sphereGeometry args={[earthRadius, 32, 32]} />
        <meshStandardMaterial color="#0284c7" roughness={0.6} metalness={0.2} emissive="#024e75" emissiveIntensity={0.2} />
      </mesh>

      {/* Moon */}
      {region !== "deep_space" && (
        <mesh
          ref={moonMesh}
          position={[4.5, 0.3, -2]}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered({
              name: "Moon",
              pos: [384400, 0, 0],
              desc: "Physical body orbiting at ~384,400 km. Forms key cislunar gravitational vector.",
            });
          }}
          onPointerOut={() => setHovered(null)}
        >
          <sphereGeometry args={[Math.max(0.08, earthRadius * 0.27), 24, 24]} />
          <meshStandardMaterial color="#64748b" roughness={0.8} />
        </mesh>
      )}

      {/* Spacecraft True Position */}
      {lastSample ? (
        <mesh
          ref={spacecraftMesh}
          position={[
            lastSample.truePosition[0] * scale,
            lastSample.truePosition[1] * scale,
            lastSample.truePosition[2] * scale,
          ]}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered({
              name: "Spacecraft (True Position)",
              pos: lastSample.truePosition,
              desc: "The physical true coordinate vector simulated by the orbit propagator.",
            });
          }}
          onPointerOut={() => setHovered(null)}
        >
          <sphereGeometry args={[0.09, 24, 24]} />
          <meshStandardMaterial color="#22C55E" emissive="#22C55E" emissiveIntensity={0.8} />
        </mesh>
      ) : (
        /* Fallback animated spacecraft */
        <mesh ref={spacecraftMesh} position={[1.6, 0.4, 0.4]}>
          <coneGeometry args={[0.12, 0.4, 4]} />
          <meshStandardMaterial color="#F8FAFC" emissive="#00BFFF" emissiveIntensity={0.3} />
        </mesh>
      )}

      {/* Spacecraft Estimated Position */}
      {lastSample && (
        <mesh
          position={[
            lastSample.estimated[0] * scale,
            lastSample.estimated[1] * scale,
            lastSample.estimated[2] * scale,
          ]}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered({
              name: "Navigation Solution (Estimated)",
              pos: lastSample.estimated,
              desc: `Calculated spacecraft coordinate resolved via ${algorithm} estimator.`,
            });
          }}
          onPointerOut={() => setHovered(null)}
        >
          <sphereGeometry args={[0.09, 24, 24]} />
          <meshStandardMaterial color="#EF4444" emissive="#EF4444" emissiveIntensity={0.8} />
        </mesh>
      )}

      {/* Error Vector (Connecting true and estimated) */}
      {errorVectorLine && <primitive object={errorVectorLine} />}

      {/* EKF Orbit Trajectory Lines */}
      {algorithm === "EKF" && trajectoryLines.trueLine && <primitive object={trajectoryLines.trueLine} />}
      {algorithm === "EKF" && trajectoryLines.estLine && <primitive object={trajectoryLines.estLine} />}

      {/* LS/WLS Covariance Cloud estimates */}
      {algorithm !== "EKF" && covarianceCloud && (
        <points geometry={covarianceCloud}>
          <pointsMaterial attach="material" color="#EF4444" size={0.06} opacity={0.5} transparent />
        </points>
      )}

      {/* Pulsar Source nodes & rays */}
      {pulsarRays.map(({ line, p }: { line: THREE.Line; p: string }, idx: number) => {
        const dir = PULSAR_VECTORS[p] || { x: 1, y: 0, z: 0 };
        return (
          <group key={p}>
            {/* Pulsar node */}
            <mesh
              position={[dir.x * 5, dir.y * 5, dir.z * 5]}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHovered({
                  name: `Pulsar ${p}`,
                  pos: [dir.x * 100000, dir.y * 100000, dir.z * 100000],
                  desc: `X-ray navigation source emitter. Spin Frequency: ${dir.freq} Hz.`,
                });
              }}
              onPointerOut={() => setHovered(null)}
            >
              <sphereGeometry args={[0.07, 16, 16]} />
              <meshBasicMaterial color={idx % 2 ? "#38BDF8" : "#22C55E"} />
            </mesh>
            {/* Pulsar Ray line (rendered as primitive to avoid TS SVG line clash) */}
            <primitive object={line} />
          </group>
        );
      })}
    </>
  );
}

// Wrapper Component for CSS overlays and Canvas
export function SpaceScene({
  full = false,
  result = null,
  loading = false,
}: {
  full?: boolean;
  result?: any;
  loading?: boolean;
}) {
  const [hovered, setHovered] = useState<any>(null);
  const [showHelp, setShowHelp] = useState(false);

  const region = result?.config.region ?? "earth_moon";
  const algorithm = result?.config.algorithm ?? "WLS";
  const noise = result?.config.noiseNs ?? 100;
  const pulsarsCount = result?.pulsars.length ?? 6;
  const activePulsars = result?.pulsars ?? Object.keys(PULSAR_VECTORS).slice(0, 6);

  const lastSample = result?.samples ? result.samples[result.samples.length - 1] : null;
  const posError = lastSample?.errorKm;

  // Direct label DOM refs to bypass react rerender lag at 60fps
  const earthLabelRef = useRef<HTMLDivElement>(null);
  const spacecraftLabelRef = useRef<HTMLDivElement>(null);
  const estimatedLabelRef = useRef<HTMLDivElement>(null);
  const pulsarLabelRefs = useRef<Record<string, HTMLDivElement | null>>({});

  return (
    <div className={cn("relative w-full h-full min-h-[450px] overflow-hidden rounded-lg", full ? "h-[calc(100vh-220px)]" : "h-[450px]")}>
      {/* 3D Canvas */}
      <Canvas camera={{ position: [0, 5, 8], fov: 50 }} gl={{ preserveDrawingBuffer: true }}>
        <color attach="background" args={["#050816"]} />
        <SceneObjects result={result} setHovered={setHovered} />
        <Controls />
        <LabelProjector
          region={region}
          lastSample={lastSample}
          activePulsars={activePulsars}
          refs={{
            earth: earthLabelRef,
            spacecraft: spacecraftLabelRef,
            estimated: estimatedLabelRef,
            pulsars: pulsarLabelRefs,
          }}
        />
      </Canvas>

      {/* 2D Projected Floating HTML Labels */}
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden text-xs">
        {/* Earth Label */}
        <div
          ref={earthLabelRef}
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded border border-cyan-400/20 bg-slate-950/75 px-1.5 py-0.5 text-cyan-200"
          style={{ display: "none" }}
        >
          Earth
        </div>

        {/* Spacecraft True Position Label */}
        <div
          ref={spacecraftLabelRef}
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded border border-green-500/30 bg-slate-950/75 px-1.5 py-0.5 text-green-200"
          style={{ display: "none" }}
        >
          Spacecraft (True)
        </div>

        {/* Spacecraft Estimated Position Label */}
        <div
          ref={estimatedLabelRef}
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded border border-rose-500/30 bg-slate-950/75 px-1.5 py-0.5 text-rose-200"
          style={{ display: "none" }}
        >
          Est. Position (XNAV)
        </div>

        {/* Pulsar Labels */}
        {activePulsars.map((p: string) => (
          <div
            key={p}
            ref={(el) => {
              pulsarLabelRefs.current[p] = el;
            }}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded border border-sky-400/20 bg-slate-950/70 px-1 py-0.5 text-[10px] text-slate-300"
            style={{ display: "none" }}
          >
            {p}
          </div>
        ))}
      </div>

      {/* Hover Tooltip Overlay */}
      {hovered && (
        <div className="absolute bottom-4 left-4 z-10 max-w-[280px] rounded-lg border border-cyan-300/30 bg-slate-950/90 p-3 shadow-glow pointer-events-none">
          <p className="text-sm font-semibold text-cyan-100">{hovered.name}</p>
          <p className="mt-1 text-xs text-slate-300 leading-normal">{hovered.desc}</p>
          {hovered.pos && (
            <p className="mt-2 text-[10px] font-mono text-cyan-200">
              ECI X: {hovered.pos[0].toFixed(2)} km<br />
              ECI Y: {hovered.pos[1].toFixed(2)} km<br />
              ECI Z: {hovered.pos[2].toFixed(2)} km
            </p>
          )}
        </div>
      )}

      {/* Scientific Context Side Overlay */}
      <div className="absolute top-4 right-4 z-10 rounded-lg border border-slate-700/60 bg-slate-950/75 p-3 backdrop-blur text-xs space-y-2 text-slate-300 max-w-[200px]">
        <p className="font-semibold text-white uppercase tracking-wider text-[10px] text-cyan-100">Scientific Context</p>
        <hr className="border-slate-800" />
        <div>Ref Frame: <strong className="text-cyan-200">ECI (J2000)</strong></div>
        <div>Coordinates: <strong className="text-cyan-200">Earth-centered</strong></div>
        <div>Units: <strong className="text-cyan-200">Kilometers (km)</strong></div>
        <div>Pulsars: <strong className="text-cyan-200">{pulsarsCount} sources</strong></div>
        <div>Noise Level: <strong className="text-cyan-200">{noise} ns</strong></div>
        <div>Solver: <strong className="text-cyan-200">{algorithm === "LS" ? "Linear LS" : algorithm === "WLS" ? "WLS (Weighted)" : "8-State EKF"}</strong></div>
        {posError !== undefined && (
          <div className="pt-1 text-[11px]">
            Pos Error: <strong className={cn(posError > 10 ? "text-rose-400" : "text-green-400")}>{posError.toFixed(4)} km</strong>
          </div>
        )}
      </div>

      {/* Legend Overlay */}
      <div className="absolute bottom-4 right-4 z-10 rounded-lg border border-slate-700/60 bg-slate-950/75 p-2 backdrop-blur text-[10px] space-y-1.5 text-slate-300">
        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-[#0284c7]" /> Earth (Reference)</div>
        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded bg-[#22C55E]" /> Spacecraft (True Position)</div>
        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded bg-[#EF4444]" /> XNAV Estimated Position</div>
        <div className="flex items-center gap-2"><div className="w-2.5 h-0.5 bg-[#EF4444]" /> Error Vector</div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded bg-[#38BDF8]" /> Pulsar Line of Sight
        </div>
        {algorithm === "EKF" ? (
          <>
            <div className="flex items-center gap-2"><div className="w-2.5 h-0.5 bg-[#22C55E]" style={{ borderStyle: "dashed" }} /> True Trajectory Path</div>
            <div className="flex items-center gap-2"><div className="w-2.5 h-0.5 bg-[#EF4444]" style={{ borderStyle: "dashed" }} /> EKF Estimated Path</div>
          </>
        ) : (
          <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full border border-rose-500/40 bg-rose-500/10" /> Estimates Cloud</div>
        )}
      </div>

      {/* Help Panel Toggle */}
      <button
        onClick={() => setShowHelp((prev) => !prev)}
        className="absolute top-4 left-4 z-10 flex h-8 px-3 items-center justify-center rounded border border-cyan-300/30 bg-cyan-400/10 text-cyan-200 text-xs font-semibold hover:bg-cyan-400/20 backdrop-blur pointer-events-auto"
      >
        What am I looking at?
      </button>

      {/* Help Sliding Panel Modal */}
      {showHelp && (
        <div className="absolute inset-y-0 left-0 z-20 w-80 border-r border-slate-700 bg-slate-950/95 p-5 backdrop-blur-xl shadow-2xl flex flex-col justify-between overflow-y-auto">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-cyan-100 uppercase tracking-wide">Help Desk</h2>
              <button onClick={() => setShowHelp(false)} className="text-slate-400 hover:text-white font-bold text-sm">✕</button>
            </div>
            <hr className="my-3 border-slate-800" />
            <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
              <p>
                <strong>Pulsar Navigation (XNAV)</strong> is an autonomous deep space navigation technology. It calculates spacecraft position using periodic X-ray signals emitted from distant, fast-spinning millisecond pulsars.
              </p>
              <p>
                <strong>Earth (Reference Frame Origin):</strong> Standard pulsar direction tables are anchored to the Solar System Barycenter (SSB). For Earth-relative navigation, our framework automatically resolves barycentric Roemer delays by incorporating planetary orbit models.
              </p>
              <p>
                <strong>True vs Estimated Position:</strong> The green sphere displays the spacecraft's true coordinate vector. The red sphere is the solved position from the estimated pulsar timing delays. The red line connecting them represents the 3D position error vector.
              </p>
              <p>
                <strong>Algorithms:</strong>
                <br />• <em>Gauss-Jordan Least Squares (LS)</em>: Solves for 3D position + clock bias, weighting all measurements equally.
                <br />• <em>Weighted Least Squares (WLS)</em>: Incorporates pulsar-specific timing stabilities, weighting more stable sources higher.
                <br />• <em>Extended Kalman Filter (EKF)</em>: Recursively tracks spacecraft coordinates under Keplerian orbital dynamics and oblateness ($J_2$) perturbations, combining timing residuals sequentially over time.
              </p>
            </div>
          </div>
          <div className="pt-4 border-t border-slate-800 text-[10px] text-slate-500">
            PulsarNav AI • Springer XNAV Reference Edition
          </div>
        </div>
      )}
    </div>
  );
}
