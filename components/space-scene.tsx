"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

function RotatingBody({ position, color, radius }: { position: [number, number, number]; color: string; radius: number }) {
  const mesh = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (mesh.current) mesh.current.rotation.y += 0.006;
  });
  return (
    <mesh ref={mesh} position={position}>
      <sphereGeometry args={[radius, 48, 48]} />
      <meshStandardMaterial color={color} roughness={0.55} metalness={0.1} />
    </mesh>
  );
}

function PulsarRays() {
  const rays = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const points = [
          new THREE.Vector3(Math.cos(angle) * 5.6, Math.sin(angle * 0.7) * 2.2, Math.sin(angle) * 5.6),
          new THREE.Vector3(0.65, 0.25, 0.35),
        ];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
          color: i % 2 ? "#38BDF8" : "#22C55E",
          transparent: true,
          opacity: 0.55,
        });
        return new THREE.Line(geometry, material);
      }),
    [],
  );
  return (
    <>
      {rays.map((ray, index) => (
        <primitive key={index} object={ray} />
      ))}
    </>
  );
}

function SceneObjects() {
  const spacecraft = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (spacecraft.current) {
      spacecraft.current.position.x = Math.cos(clock.elapsedTime * 0.35) * 1.8;
      spacecraft.current.position.z = Math.sin(clock.elapsedTime * 0.35) * 1.2;
      spacecraft.current.rotation.y += 0.02;
    }
  });
  return (
    <>
      <ambientLight intensity={0.35} />
      <pointLight position={[4, 5, 5]} intensity={2.2} color="#38BDF8" />
      <RotatingBody position={[0, 0, 0]} color="#1d4ed8" radius={0.72} />
      <RotatingBody position={[2.7, 0.2, -0.4]} color="#94a3b8" radius={0.22} />
      <mesh ref={spacecraft} position={[1.6, 0.4, 0.4]}>
        <coneGeometry args={[0.16, 0.5, 4]} />
        <meshStandardMaterial color="#F8FAFC" emissive="#00BFFF" emissiveIntensity={0.25} />
      </mesh>
      <mesh position={[1.72, 0.5, 0.48]}>
        <sphereGeometry args={[0.07, 24, 24]} />
        <meshStandardMaterial color="#22C55E" emissive="#22C55E" emissiveIntensity={0.7} />
      </mesh>
      <mesh position={[1.35, 0.25, 0.15]}>
        <sphereGeometry args={[0.07, 24, 24]} />
        <meshStandardMaterial color="#EF4444" emissive="#EF4444" emissiveIntensity={0.55} />
      </mesh>
      <PulsarRays />
    </>
  );
}

export function SpaceScene({ full = false }: { full?: boolean }) {
  return (
    <div className={full ? "h-[calc(100vh-120px)] min-h-[620px] w-full" : "h-[420px] w-full"}>
      <Canvas camera={{ position: [0, 3, 6.5], fov: 52 }}>
        <color attach="background" args={["#050816"]} />
        <SceneObjects />
      </Canvas>
    </div>
  );
}
