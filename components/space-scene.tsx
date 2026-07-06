"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls as OrbitControlsImpl } from "three/examples/jsm/controls/OrbitControls.js";
import { PULSAR_CATALOGUE } from "@/lib/pulsar-catalogue";
import { Eye, Info, Radio } from "lucide-react";
import type { TelemetrySample } from "@/lib/services/navigation-service";

type SpaceSceneSample = Pick<TelemetrySample, "truePosition" | "estimated" | "trial">;

function Controls() {
  const { camera, gl } = useThree();
  const controls = useMemo(() => new OrbitControlsImpl(camera, gl.domElement), [camera, gl.domElement]);
  
  useEffect(() => {
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 30;
    controls.minDistance = 2;
    return () => controls.dispose();
  }, [controls]);

  useFrame(() => {
    controls.update();
  });

  return <primitive object={controls} />;
}

// Procedural starfield
function Starfield() {
  const geom = useMemo(() => {
    const N = 800;
    const positions = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 40; // Shell radius
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, []);

  const mat = useMemo(() =>
    new THREE.PointsMaterial({
      color: 0x7089ba, // Periwinkle stars
      size: 0.06,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.4,
    }), []);

  return <points geometry={geom} material={mat} />;
}

// Simple Grid helper representing ECI coordinate axes
function EciAxes() {
  const mat = useMemo(() => new THREE.LineBasicMaterial({ color: 0x1c1c1c }), []);
  const points = useMemo(() => {
    const p: THREE.Vector3[] = [];
    const size = 10;
    // X, Y, Z axes lines
    p.push(new THREE.Vector3(-size, 0, 0), new THREE.Vector3(size, 0, 0));
    p.push(new THREE.Vector3(0, -size, 0), new THREE.Vector3(0, size, 0));
    p.push(new THREE.Vector3(0, 0, -size), new THREE.Vector3(0, 0, size));
    return p;
  }, []);

  const geom = useMemo(() => new THREE.BufferGeometry().setFromPoints(points), [points]);
  return <lineSegments geometry={geom} material={mat} />;
}

// 3D Scene Components
function SceneContent({
  samples,
  currentFrame,
  showRays,
  showTrajectory,
}: {
  samples: SpaceSceneSample[];
  currentFrame: number;
  showRays: boolean;
  showTrajectory: boolean;
}) {
  const earthRef = useRef<THREE.Mesh>(null!);
  const moonRef = useRef<THREE.Mesh>(null!);

  useFrame(({ clock }) => {
    if (earthRef.current) earthRef.current.rotation.y = clock.getElapsedTime() * 0.05;
    if (moonRef.current) {
      const t = clock.getElapsedTime() * 0.02;
      moonRef.current.position.set(Math.cos(t) * 12, 0, Math.sin(t) * 12);
    }
  });

  const scale = 1 / 10000; // Schematic scale

  const sample = samples[currentFrame] ?? samples[samples.length - 1] ?? null;

  // Spacecraft 3D coordinates
  const truePos = useMemo(
    () => sample ? [sample.truePosition[0] * scale, sample.truePosition[1] * scale, sample.truePosition[2] * scale] as [number, number, number] : [4, 2, 0] as [number, number, number],
    [sample, scale],
  );
  const estPos = useMemo(
    () => sample ? [sample.estimated[0] * scale, sample.estimated[1] * scale, sample.estimated[2] * scale] as [number, number, number] : [4.1, 2.1, 0.05] as [number, number, number],
    [sample, scale],
  );

  // Trajectory path lines
  const pathPoints = useMemo(() => {
    const truePoints: THREE.Vector3[] = [];
    const estPoints: THREE.Vector3[] = [];
    samples.slice(0, currentFrame + 1).forEach((s) => {
      truePoints.push(new THREE.Vector3(s.truePosition[0] * scale, s.truePosition[1] * scale, s.truePosition[2] * scale));
      estPoints.push(new THREE.Vector3(s.estimated[0] * scale, s.estimated[1] * scale, s.estimated[2] * scale));
    });
    return {
      trueGeom: new THREE.BufferGeometry().setFromPoints(truePoints),
      estGeom: new THREE.BufferGeometry().setFromPoints(estPoints),
    };
  }, [samples, currentFrame, scale]);

  const errorVectorGeometry = useMemo(
    () => new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...truePos),
      new THREE.Vector3(...estPos),
    ]),
    [truePos, estPos],
  );

  return (
    <>
      <Starfield />
      <EciAxes />

      {/* Earth (rotating wireframe) */}
      <mesh ref={earthRef}>
        <sphereGeometry args={[1.5, 24, 24]} />
        <meshBasicMaterial color="#1c1c1c" wireframe />
      </mesh>
      {/* Earth solid core (faint) */}
      <mesh>
        <sphereGeometry args={[1.48, 24, 24]} />
        <meshBasicMaterial color="#0b0e13" transparent opacity={0.6} />
      </mesh>

      {/* Moon (orbiting wireframe) */}
      <mesh ref={moonRef}>
        <sphereGeometry args={[0.4, 12, 12]} />
        <meshBasicMaterial color="#4d4d4d" wireframe />
      </mesh>

      {/* Spacecraft (True Position - Green indicator) */}
      <mesh position={truePos}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshBasicMaterial color="#22c55e" />
      </mesh>

      {/* Spacecraft (Estimated Position - Periwinkle indicator) */}
      <mesh position={estPos}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshBasicMaterial color="#7089ba" />
      </mesh>

      {/* Error Vector Line (Red) */}
      <lineSegments geometry={errorVectorGeometry}>
        <lineBasicMaterial color="#ef4444" linewidth={2} />
      </lineSegments>

      {/* Trajectories */}
      {showTrajectory && samples.length > 1 && (
        <>
          <lineSegments geometry={pathPoints.trueGeom}>
            <lineBasicMaterial color="#22c55e" opacity={0.6} transparent />
          </lineSegments>
          <lineSegments geometry={pathPoints.estGeom}>
            <lineBasicMaterial color="#7089ba" opacity={0.6} transparent />
          </lineSegments>
        </>
      )}

      {/* Pulsar Catalogue Nodes & Lines of Sight */}
      {PULSAR_CATALOGUE.map((p) => {
        const radius = 25;
        // Direction vectors to sky sphere
        const px = p.x * radius;
        const py = p.y * radius;
        const pz = p.z * radius;

        return (
          <group key={p.name}>
            {/* Glowing Pulsar indicator */}
            <mesh position={[px, py, pz]}>
              <sphereGeometry args={[0.15, 8, 8]} />
              <meshBasicMaterial color="#7089ba" />
            </mesh>

            {/* Line of Sight Ray (Pulsar to Spacecraft) */}
            {showRays && (
              <lineSegments geometry={new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(...truePos),
                new THREE.Vector3(px, py, pz),
              ])}>
                <lineBasicMaterial color="#7089ba" opacity={0.15} transparent />
              </lineSegments>
            )}
          </group>
        );
      })}
    </>
  );
}

export function SpaceScene({
  missionType,
  samples,
  currentFrame,
}: {
  missionType: string;
  samples: SpaceSceneSample[];
  currentFrame: number;
}) {
  const [showRays, setShowRays] = useState(true);
  const [showTrajectory, setShowTrajectory] = useState(true);

  return (
    <div className="relative w-full h-full bg-void rounded-2xl overflow-hidden border border-dashed-graphite blueprint-grid" data-mission-type={missionType}>
      <Canvas camera={{ position: [0, 10, 20], fov: 45 }}>
        <color attach="background" args={["#000000"]} />
        <ambientLight intensity={1.5} />
        <SceneContent
          samples={samples}
          currentFrame={currentFrame}
          showRays={showRays}
          showTrajectory={showTrajectory}
        />
        <Controls />
      </Canvas>

      {/* Interactive Controls Overlay */}
      <div className="absolute bottom-4 right-4 flex items-center gap-3 bg-carbon/95 border border-dashed-graphite px-4 py-2 rounded-full z-10">
        <button
          onClick={() => setShowRays(!showRays)}
          className={`flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider transition-colors duration-200 ${
            showRays ? "text-periwinkle" : "text-steel"
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          Rays
        </button>
        <span className="w-px h-3 bg-graphite" />
        <button
          onClick={() => setShowTrajectory(!showTrajectory)}
          className={`flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider transition-colors duration-200 ${
            showTrajectory ? "text-periwinkle" : "text-steel"
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          Paths
        </button>
      </div>

      <div className="absolute top-4 left-4 flex flex-col gap-1 z-10 bg-carbon/80 border border-dashed-graphite p-3 rounded-lg pointer-events-none">
        <span className="text-[10px] font-mono text-steel uppercase tracking-widest">Reference Frame</span>
        <span className="text-xs font-mono text-paper font-semibold">ECI J2000 (Geocentric)</span>
        <span className="text-[9px] font-mono text-periwinkle mt-2 flex items-center gap-1">
          <Info className="w-3 h-3" /> Drag to rotate, scroll to zoom
        </span>
      </div>
    </div>
  );
}
