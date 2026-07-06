"use client";

/**
 * components/navigation-comparison.tsx
 *
 * Professional Aerospace Navigation Comparison Lab
 * ================================================
 *
 * Visually compares:
 *   - Ground Truth (Green)
 *   - Conventional Deep Space Network (DSN) Navigation (Blue)
 *   - Autonomous X-ray Pulsar Navigation (Orange/Amber)
 *   - Hybrid DSN + Pulsar EKF Navigation (Purple)
 *
 * Different types of charts and panels are generated using high-fidelity
 * physics models propagated client-side for smooth real-time scrubbing.
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Canvas, useFrame, useThree, extend } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend as ChartLegend,
  ResponsiveContainer,
} from "recharts";
import {
  Compass,
  Cpu,
  Globe,
  Info,
  Network,
  Play,
  Pause,
  RefreshCcw,
  Scale,
  Shield,
  Signal,
  Zap,
  CheckCircle2,
  AlertTriangle,
  BookOpen,
  Eye,
  EyeOff,
  Layers,
  ChevronRight,
  ChevronLeft,
  Download,
  Flame,
} from "lucide-react";
import { Panel, Button, Badge } from "./ui";
import { generateMissionTrajectory, SimStep, SimResult, Vec3 } from "@/lib/navigation-simulator";
import { cn } from "@/lib/utils";
import { PULSAR_CATALOGUE, DSN_STATIONS, getMissionScale } from "@/lib/pulsar-catalogue";
import { buildNavigationReport, reportFilename } from "@/lib/report-generator";

extend({ OrbitControls });

// Color constants
const COLOR_TRUE   = "#22C55E"; // Green
const COLOR_DSN    = "#38BDF8"; // Blue
const COLOR_PULSAR = "#F59E0B"; // Orange/Amber
const COLOR_HYBRID = "#A78BFA"; // Purple
const COLOR_ERROR  = "#EF4444"; // Red
const RE_EARTH     = 6378.137;  // km — Earth radius for scaling

// Shared catalogue data — imported from lib/pulsar-catalogue.ts
const PULSARS = PULSAR_CATALOGUE;
const STATIONS = DSN_STATIONS;

// ─── Three.js Camera controls ────────────────────────────────────────────────
function CameraControls() {
  const { camera, gl } = useThree();
  const ref = useRef<any>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.enableDamping = true;
      ref.current.dampingFactor = 0.06;
      ref.current.maxDistance = 22;
      ref.current.minDistance = 0.5;
    }
  }, []);
  useFrame(() => ref.current?.update());
  // @ts-ignore
  return <orbitControls ref={ref} args={[camera, gl.domElement]} />;
}

// ─── Procedural Starfield ─────────────────────────────────────────────────────
function Starfield() {
  const geom = useMemo(() => {
    // Deterministic seed so stars are stable across mounts
    let s = 0x9e3779b9 >>> 0;
    const rand = () => { s = (s ^ (s << 13)) >>> 0; s = (s ^ (s >> 7)) >>> 0; s = (s ^ (s << 17)) >>> 0; return s / 0x100000000; };

    const N = 900;
    const positions = new Float32Array(N * 3);
    const sizes = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const theta = rand() * 2 * Math.PI;
      const phi = Math.acos(2 * rand() - 1);
      const r = 18 + rand() * 8;
      positions[i*3]   = r * Math.sin(phi) * Math.cos(theta);
      positions[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i*3+2] = r * Math.cos(phi);
      sizes[i] = 0.03 + rand() * 0.06;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));
    return g;
  }, []);

  const mat = useMemo(() =>
    new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.05,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.70,
    }), []);
  return <points geometry={geom} material={mat} />;
}


// ─── 3D Simulation Objects ────────────────────────────────────────────────────
function SimulationScene({
  steps,
  currentFrame,
  missionType,
  showPlanets,
  showPulsars,
  showRays,
  showDsn,
  showPulsarPath,
  showHybrid,
  setHovered,
}: {
  steps: SimStep[];
  currentFrame: number;
  missionType: string;
  showPlanets: boolean;
  showPulsars: boolean;
  showRays: boolean;
  showDsn: boolean;
  showPulsarPath: boolean;
  showHybrid: boolean;
  setHovered: (h: any) => void;
}) {
  const scale = getMissionScale(missionType);
  const earthRadius = Math.max(0.12, 6378.137 * scale);
  const earthRef = useRef<THREE.Mesh>(null!);
  const moonRef = useRef<THREE.Mesh>(null!);
  
  useFrame(({ clock }) => {
    if (earthRef.current) earthRef.current.rotation.y = (clock.getElapsedTime() * 0.03);
    if (moonRef.current) {
      const t = clock.getElapsedTime() * 0.05;
      const dist = missionType === "Lunar Orbit" ? 0 : 5.8;
      moonRef.current.position.set(Math.cos(t) * dist, 0.1, Math.sin(t) * dist);
    }
  });

  const step = steps[currentFrame] ?? steps[0];
  if (!step) return null;

  // Trajectory Geometry — memoised per frame to prevent per-render allocation
  const geomTrue = useMemo(() => new THREE.BufferGeometry().setFromPoints(
    steps.slice(0, currentFrame + 1).map(s => new THREE.Vector3(s.truePos[0] * scale, s.truePos[1] * scale, s.truePos[2] * scale))
  ), [steps, currentFrame, scale]);

  const geomDsn = useMemo(() => new THREE.BufferGeometry().setFromPoints(
    steps.slice(0, currentFrame + 1).map(s => new THREE.Vector3(s.dsnEstPos[0] * scale, s.dsnEstPos[1] * scale, s.dsnEstPos[2] * scale))
  ), [steps, currentFrame, scale]);

  const geomPulsar = useMemo(() => new THREE.BufferGeometry().setFromPoints(
    steps.slice(0, currentFrame + 1).map(s => new THREE.Vector3(s.pulsarEstPos[0] * scale, s.pulsarEstPos[1] * scale, s.pulsarEstPos[2] * scale))
  ), [steps, currentFrame, scale]);

  const geomHybrid = useMemo(() => new THREE.BufferGeometry().setFromPoints(
    steps.slice(0, currentFrame + 1).map(s => new THREE.Vector3(s.hybridEstPos[0] * scale, s.hybridEstPos[1] * scale, s.hybridEstPos[2] * scale))
  ), [steps, currentFrame, scale]);

  // Active pulsar directions
  const pulsarNodes = useMemo(() => PULSARS.map((p, idx) => {
    const pos: [number, number, number] = [p.x * 7, p.y * 7, p.z * 7];
    return { name: p.name, pos, color: idx % 2 === 0 ? "#38BDF8" : "#A78BFA" };
  }), []);

  // Active ground stations in ECI
  const groundStationsList = useMemo(() => STATIONS.map(st => {
    const theta = 7.292115e-5 * step.timeSec;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const R_eq = RE_EARTH + 1.0;
    const x = R_eq * Math.cos(st.lat) * Math.cos(st.lon);
    const y = R_eq * Math.cos(st.lat) * Math.sin(st.lon);
    const z = R_eq * Math.sin(st.lat);

    const posECI: [number, number, number] = [
      (x * cosT - y * sinT) * scale,
      (x * sinT + y * cosT) * scale,
      z * scale,
    ];
    return { name: st.name, pos: posECI };
  }), [step.timeSec, scale]);

  // Line of sight rays from visible station to spacecraft
  const activeStationNode = groundStationsList.find(s => s.name === step.activeDsnStation);
  const activeRayGeom = useMemo(() => activeStationNode && showRays && step.dsnVisible ? new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(...activeStationNode.pos),
    new THREE.Vector3(step.truePos[0] * scale, step.truePos[1] * scale, step.truePos[2] * scale),
  ]) : null, [activeStationNode, showRays, step.dsnVisible, step.truePos, scale]);

  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[-10, 5, -10]} intensity={3.0} color="#FCD34D" />
      <pointLight position={[10, 10, 10]} intensity={1.5} color="#38BDF8" />

      <Starfield />

      {/* Earth */}
      {missionType !== "Lunar Orbit" && (
        <mesh ref={earthRef}
          onPointerOver={e => { e.stopPropagation(); setHovered({ name: "Earth (ECI Coordinate Center)", desc: "Origin for LEO, GEO, and Transfer trajectories." }); }}
          onPointerOut={() => setHovered(null)}>
          <sphereGeometry args={[earthRadius, 32, 32]} />
          <meshStandardMaterial color="#0c4a6e" roughness={0.6} metalness={0.1} emissive="#032f3e" emissiveIntensity={0.3} />
        </mesh>
      )}

      {/* Moon */}
      {(missionType === "Lunar Orbit" || missionType === "Earth-Moon Transfer") && (
        <mesh ref={moonRef}
          onPointerOver={e => { e.stopPropagation(); setHovered({ name: "Moon", desc: "Secondary gravitation source for cislunar flight paths." }); }}
          onPointerOut={() => setHovered(null)}>
          <sphereGeometry args={[missionType === "Lunar Orbit" ? earthRadius : 0.08, 24, 24]} />
          <meshStandardMaterial color="#475569" roughness={0.9} />
        </mesh>
      )}

      {/* Ground Stations */}
      {missionType !== "Lunar Orbit" && showPlanets && groundStationsList.map(st => (
        <mesh key={st.name} position={st.pos}
          onPointerOver={e => { e.stopPropagation(); setHovered({ name: `DSN Station ${st.name}`, desc: `Earth tracking link antenna. ECI Lat/Lon relative.` }); }}
          onPointerOut={() => setHovered(null)}>
          <boxGeometry args={[0.04, 0.04, 0.04]} />
          <meshBasicMaterial color={step.activeDsnStation === st.name ? "#22C55E" : "#94A3B8"} />
        </mesh>
      ))}

      {/* Trajectories */}
      {/* 1. Ground Truth */}
      <primitive object={new THREE.Line(geomTrue, new THREE.LineBasicMaterial({ color: COLOR_TRUE, linewidth: 2 }))} />

      {/* 2. DSN path */}
      {showDsn && (
        <primitive object={new THREE.Line(geomDsn, new THREE.LineBasicMaterial({ color: COLOR_DSN, opacity: 0.7, transparent: true }))} />
      )}

      {/* 3. Pulsar path */}
      {showPulsarPath && (
        <primitive object={new THREE.Line(geomPulsar, new THREE.LineBasicMaterial({ color: COLOR_PULSAR, opacity: 0.7, transparent: true }))} />
      )}

      {/* 4. Hybrid path */}
      {showHybrid && (
        <primitive object={new THREE.Line(geomHybrid, new THREE.LineBasicMaterial({ color: COLOR_HYBRID, opacity: 0.8, transparent: true }))} />
      )}

      {/* Active Spacecraft Marker */}
      <mesh position={[step.truePos[0] * scale, step.truePos[1] * scale, step.truePos[2] * scale]}>
        <sphereGeometry args={[0.11, 16, 16]} />
        <meshBasicMaterial color={COLOR_TRUE} />
      </mesh>

      {/* DSN Active Marker */}
      {showDsn && (
        <mesh position={[step.dsnEstPos[0] * scale, step.dsnEstPos[1] * scale, step.dsnEstPos[2] * scale]}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshBasicMaterial color={COLOR_DSN} />
        </mesh>
      )}

      {/* Pulsar Active Marker */}
      {showPulsarPath && (
        <mesh position={[step.pulsarEstPos[0] * scale, step.pulsarEstPos[1] * scale, step.pulsarEstPos[2] * scale]}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshBasicMaterial color={COLOR_PULSAR} />
        </mesh>
      )}

      {/* Hybrid Active Marker */}
      {showHybrid && (
        <mesh position={[step.hybridEstPos[0] * scale, step.hybridEstPos[1] * scale, step.hybridEstPos[2] * scale]}>
          <sphereGeometry args={[0.09, 16, 16]} />
          <meshBasicMaterial color={COLOR_HYBRID} />
        </mesh>
      )}

      {/* DSN Ray Line */}
      {activeRayGeom && (
        <primitive object={new THREE.Line(activeRayGeom, new THREE.LineBasicMaterial({ color: "#22C55E", opacity: 0.4, transparent: true }))} />
      )}

      {/* Pulsar Directions */}
      {showPulsars && pulsarNodes.map(p => (
        <mesh key={p.name} position={p.pos}
          onPointerOver={e => { e.stopPropagation(); setHovered({ name: `Pulsar ${p.name}`, desc: `Millisecond pulse navigational target direction vector.` }); }}
          onPointerOut={() => setHovered(null)}>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshBasicMaterial color={p.color} />
        </mesh>
      ))}
    </>
  );
}

// ─── UI main component ────────────────────────────────────────────────────────
export function NavigationComparison() {
  const [mission, setMission] = useState<string>("LEO");
  const [pulsarCount, setPulsarCount] = useState<number>(6);
  const [noiseNs, setNoiseNs] = useState<number>(100);
  const [dsnInterval, setDsnInterval] = useState<number>(12);
  const [detectorArea, setDetectorArea] = useState<number>(1.0);
  const [integrationTime, setIntegrationTime] = useState<number>(3600);
  
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [currentFrame, setCurrentFrame] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<number>(1);
  const [hovered, setHovered] = useState<any>(null);
  const [showHelp, setShowHelp] = useState<boolean>(false);
  
  // Layer visibility state
  const [showPlanets, setShowPlanets] = useState<boolean>(true);
  const [showPulsars, setShowPulsars] = useState<boolean>(true);
  const [showRays, setShowRays] = useState<boolean>(true);
  const [showDsn, setShowDsn] = useState<boolean>(true);
  const [showPulsarPath, setShowPulsarPath] = useState<boolean>(true);
  const [showHybrid, setShowHybrid] = useState<boolean>(true);
  
  const [activeTab, setActiveTab] = useState<"error" | "latency" | "autonomy" | "infrastructure">("error");

  const runSimulation = useCallback(() => {
    setLoading(true);
    // Introduce a short timeout for visual response
    setTimeout(() => {
      const result = generateMissionTrajectory(
        mission,
        pulsarCount,
        noiseNs,
        dsnInterval,
        detectorArea,
        integrationTime
      );
      setSimResult(result);
      setCurrentFrame(0);
      setLoading(false);
    }, 150);
  }, [mission, pulsarCount, noiseNs, dsnInterval, detectorArea, integrationTime]);

  useEffect(() => {
    runSimulation();
  }, [mission, pulsarCount, noiseNs, dsnInterval, detectorArea, integrationTime]);

  // Animation Playback Engine
  const animRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  
  const animate = useCallback((timestamp: number) => {
    if (!lastTimeRef.current) lastTimeRef.current = timestamp;
    const frames = simResult?.steps.length ?? 0;
    const baseInterval = 100; // ms
    
    if (timestamp - lastTimeRef.current >= baseInterval / speed) {
      lastTimeRef.current = timestamp;
      setCurrentFrame(prev => {
        if (prev >= frames - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }
    animRef.current = requestAnimationFrame(animate);
  }, [speed, simResult]);

  useEffect(() => {
    if (isPlaying) {
      lastTimeRef.current = 0;
      animRef.current = requestAnimationFrame(animate);
    } else {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    }
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isPlaying, animate]);

  const step = simResult?.steps[currentFrame] ?? null;

  // Download aerospace analysis report
  const downloadReport = () => {
    if (!simResult) return;
    const content  = buildNavigationReport(simResult);
    const filename = reportFilename(simResult.config.missionType);
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Suitability Matrix
  const suitabilityMatrix = [
    { mission: "LEO", dsn: "High (Base Ranging)", pulsar: "Low (Small collectors)", hybrid: "Very High" },
    { mission: "Lunar", dsn: "High (delta-DOR)", pulsar: "Moderate (Autonomous backup)", hybrid: "Very High" },
    { mission: "Mars", dsn: "Moderate (Latency >20m)", pulsar: "High (No tracking gaps)", hybrid: "Very High" },
    { mission: "Outer System", dsn: "Low (Very large delay)", pulsar: "Very High (Fully autonomous)", hybrid: "High" },
    { mission: "Interstellar", dsn: "Very Low (No link)", pulsar: "Very High (Unlimited range)", hybrid: "Very Low" }
  ];

  // Cost Comparison Matrix
  const costCompare = [
    { metric: "Ground Station Load", dsn: "Very High", pulsar: "None", hybrid: "Low" },
    { metric: "Space Payload Mass/Power", dsn: "Low (Transponder only)", pulsar: "High (Telescopes)", hybrid: "High" },
    { metric: "Operational Link Cost", dsn: "Very High (Booking feeds)", pulsar: "None", hybrid: "Low" },
    { metric: "Maintenance Cost", dsn: "High (Dish upkeep)", pulsar: "Moderate (Onboard system)", hybrid: "High" }
  ];

  // Graph datasets mapping
  const activeRegionName = simResult ? simResult.config.missionType : "";
  
  return (
    <div className="space-y-6">
      {/* Simulation Controls Sidebar Card */}
      <div className="grid gap-4 md:grid-cols-4">
        {/* DSN KPI Summary Card */}
        <div className="glass rounded-lg border border-cyan-300/10 bg-slate-950/40 p-4 relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#38BDF8] font-bold">Conventional Loop</p>
              <h3 className="text-md font-bold mt-1 text-slate-100">DSN Navigation</h3>
            </div>
            <Globe className="h-4.5 w-4.5 text-[#38BDF8]" />
          </div>
          <div className="mt-4 space-y-1 font-mono text-xs text-slate-300">
            <div className="flex justify-between border-b border-slate-800/40 pb-1">
              <span>Mean Error:</span>
              <span className="text-[#38BDF8] font-semibold">{simResult ? `${simResult.dsnSummary.meanError.toFixed(3)} km` : "---"}</span>
            </div>
            <div className="flex justify-between pb-1">
              <span>Vel Error:</span>
              <span className="text-[#38BDF8] font-semibold">{simResult ? `${(simResult.dsnSummary.meanVelError * 1000).toFixed(3)} m/s` : "---"}</span>
            </div>
          </div>
        </div>

        {/* Pulsar KPI Summary Card */}
        <div className="glass rounded-lg border border-cyan-300/10 bg-slate-950/40 p-4 relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#F59E0B] font-bold">Autonomous Source</p>
              <h3 className="text-md font-bold mt-1 text-slate-100">Pulsar Navigation</h3>
            </div>
            <Cpu className="h-4.5 w-4.5 text-[#F59E0B]" />
          </div>
          <div className="mt-4 space-y-1 font-mono text-xs text-slate-300">
            <div className="flex justify-between border-b border-slate-800/40 pb-1">
              <span>Mean Error:</span>
              <span className="text-[#F59E0B] font-semibold">{simResult ? `${simResult.pulsarSummary.meanError.toFixed(3)} km` : "---"}</span>
            </div>
            <div className="flex justify-between pb-1">
              <span>Vel Error:</span>
              <span className="text-[#F59E0B] font-semibold">{simResult ? `${(simResult.pulsarSummary.meanVelError * 1000).toFixed(3)} m/s` : "---"}</span>
            </div>
          </div>
        </div>

        {/* Hybrid KPI Summary Card */}
        <div className="glass rounded-lg border border-cyan-300/10 bg-slate-950/40 p-4 relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#A78BFA] font-bold">Fused Estimate</p>
              <h3 className="text-md font-bold mt-1 text-slate-100">Hybrid Solution</h3>
            </div>
            <Compass className="h-4.5 w-4.5 text-[#A78BFA]" />
          </div>
          <div className="mt-4 space-y-1 font-mono text-xs text-slate-300">
            <div className="flex justify-between border-b border-slate-800/40 pb-1">
              <span>Mean Error:</span>
              <span className="text-[#A78BFA] font-semibold">{simResult ? `${simResult.hybridSummary.meanError.toFixed(3)} km` : "---"}</span>
            </div>
            <div className="flex justify-between pb-1">
              <span>Vel Error:</span>
              <span className="text-[#A78BFA] font-semibold">{simResult ? `${(simResult.hybridSummary.meanVelError * 1000).toFixed(3)} m/s` : "---"}</span>
            </div>
          </div>
        </div>

        {/* Action Panel Card */}
        <div className="glass rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-4 flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-bold text-cyan-200 tracking-wider">REPORTS DESK</h4>
            <p className="text-[11px] text-slate-400 mt-1 leading-normal">Download verified flight metrics comparison study report.</p>
          </div>
          <button onClick={downloadReport}
            className="w-full mt-3 bg-cyan-500/20 border border-cyan-500/40 hover:bg-cyan-500/30 text-cyan-200 rounded py-1.5 text-xs font-bold flex items-center justify-center gap-1.5 transition-all">
            <Download className="h-3.5 w-3.5" /> Export Report (.md)
          </button>
        </div>
      </div>

      {/* Main Analysis Section */}
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        
        {/* Trajectory parameter control panel */}
        <Panel className="space-y-4 shadow-xl">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Compass className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-slate-200">Simulation Control</h2>
          </div>

          {/* Mission Types Selector */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-2">Spacecraft Mission Type</label>
            <select
              value={mission}
              onChange={e => setMission(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 font-medium focus:ring-1 focus:ring-primary focus:outline-none"
            >
              <option value="LEO">LEO Circular Orbit (Earth)</option>
              <option value="GEO">GEO Geostationary (Earth)</option>
              <option value="Earth-Moon Transfer">Earth-Moon Transfer Cruise</option>
              <option value="Lunar Orbit">Lunar Orbit (Moon centered)</option>
              <option value="Lagrange L1/L2 Halo">Lagrange L1/L2 Halo (Three-Body)</option>
              <option value="Earth-Mars Transfer">Earth-Mars Transfer Orbit (Heliocentric)</option>
              <option value="Deep Space Cruise">Deep Space Cruise (Sun centered)</option>
            </select>
          </div>

          {/* DSN Pass Interval */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-2">DSN tracking pass interval</label>
            <select
              value={dsnInterval}
              onChange={e => setDsnInterval(Number(e.target.value))}
              className="w-full rounded border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 font-medium focus:ring-1 focus:ring-primary focus:outline-none"
            >
              <option value={4}>Every 4 Hours</option>
              <option value={8}>Every 8 Hours</option>
              <option value={12}>Every 12 Hours (Standard)</option>
              <option value={24}>Every 24 Hours</option>
              <option value={48}>Every 48 Hours (Sparse DSN)</option>
            </select>
          </div>

          {/* Number of Active Pulsars */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Active Pulsar Sources</label>
              <span className="text-xs font-mono text-cyan-300 font-bold">{pulsarCount}</span>
            </div>
            <input type="range" min={4} max={8} value={pulsarCount} onChange={e => setPulsarCount(Number(e.target.value))}
              className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-primary" />
          </div>

          {/* Timing Noise */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-2">Pulsar Timing Noise</label>
            <select
              value={noiseNs}
              onChange={e => setNoiseNs(Number(e.target.value))}
              className="w-full rounded border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 font-medium focus:ring-1 focus:ring-primary focus:outline-none"
            >
              <option value={10}>10 ns (Highly Stable Research)</option>
              <option value={50}>50 ns (Clean MSP Signals)</option>
              <option value={100}>100 ns (Crab/Standard)</option>
              <option value={500}>500 ns (Coarse XNAV)</option>
            </select>
          </div>

          {/* Detector Area */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-[10px] uppercase tracking-widest text-slate-400 font-semibold">X-ray Collector Area</label>
              <span className="text-xs font-mono text-cyan-300 font-bold">{detectorArea.toFixed(1)} m²</span>
            </div>
            <input type="range" min={0.1} max={5.0} step={0.1} value={detectorArea} onChange={e => setDetectorArea(Number(e.target.value))}
              className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-primary" />
          </div>

          {/* Integration Time */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-2">Integration Period</label>
            <select
              value={integrationTime}
              onChange={e => setIntegrationTime(Number(e.target.value))}
              className="w-full rounded border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 font-medium focus:ring-1 focus:ring-primary focus:outline-none"
            >
              <option value={1000}>1,000 seconds (~16m)</option>
              <option value={3600}>3,600 seconds (1 hour)</option>
              <option value={7200}>7,200 seconds (2 hours)</option>
              <option value={14400}>14,400 seconds (4 hours)</option>
            </select>
          </div>

          <Button onClick={runSimulation} disabled={loading}
            className="w-full bg-primary/20 hover:bg-primary/30 border-primary/40 text-primary flex items-center justify-center gap-2">
            <RefreshCcw className={cn("h-4 w-4", loading ? "animate-spin" : "")} />
            Re-simulate Trajectory
          </Button>

          <Button onClick={() => setShowHelp(v => !v)}
            className="w-full border-slate-700 bg-slate-950/60 text-slate-300 hover:bg-slate-800 flex items-center justify-center gap-2 text-xs">
            What am I looking at?
          </Button>
        </Panel>

        {/* Right Column: Visualizer Canvas + Telemetry overlays */}
        <div className="space-y-4">
          <div className="relative rounded-2xl border border-cyan-300/10 overflow-hidden bg-[#050816] h-[480px]">
            {loading && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/80 backdrop-blur">
                <div className="text-center space-y-2">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
                  <p className="text-xs text-slate-400 font-mono">Running physical orbits estimator...</p>
                </div>
              </div>
            )}

            {simResult && (
              <>
                {/* 3D Canvas */}
                <Canvas camera={{ position: [0, 4, 10], fov: 52 }}
                  gl={{ preserveDrawingBuffer: true, antialias: true }}
                  className="absolute inset-0">
                  <color attach="background" args={["#050816"]} />
                  <SimulationScene
                    steps={simResult.steps}
                    currentFrame={currentFrame}
                    missionType={mission}
                    showPlanets={showPlanets}
                    showPulsars={showPulsars}
                    showRays={showRays}
                    showDsn={showDsn}
                    showPulsarPath={showPulsarPath}
                    showHybrid={showHybrid}
                    setHovered={setHovered}
                  />
                  <CameraControls />
                </Canvas>

                {/* Left Top: Dynamic Scientific Context */}
                <div className="absolute top-4 left-4 z-10 w-[180px] rounded-xl border border-slate-700/60 bg-slate-950/90 p-3.5 backdrop-blur-xl shadow-xl text-xs space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300 mb-2">Live Status</p>
                  <div className="flex justify-between font-mono">
                    <span className="text-slate-500">Frame:</span>
                    <span className="text-slate-200">{currentFrame+1}/{simResult.steps.length}</span>
                  </div>
                  <div className="flex justify-between font-mono">
                    <span className="text-slate-500">Region:</span>
                    <span className="text-slate-200 truncate max-w-[90px]" title={activeRegionName}>{activeRegionName}</span>
                  </div>
                  <div className="flex justify-between font-mono">
                    <span className="text-slate-500">Visible:</span>
                    <span className={cn(step?.dsnVisible ? "text-green-400" : "text-rose-400", "font-bold")}>
                      {step?.dsnVisible ? "YES" : "NO"}
                    </span>
                  </div>
                  <div className="flex justify-between font-mono">
                    <span className="text-slate-500">Station:</span>
                    <span className="text-cyan-300 font-semibold">{step?.activeDsnStation}</span>
                  </div>
                  <div className="flex justify-between font-mono">
                    <span className="text-slate-500">RTLT Delay:</span>
                    <span className="text-slate-200">{step ? `${(step.latencySec).toFixed(2)} s` : "0.0 s"}</span>
                  </div>
                </div>

                {/* Right Top: Dynamic Position error telemetry */}
                <div className="absolute top-4 right-4 z-10 w-[210px] rounded-xl border border-cyan-400/20 bg-slate-950/90 p-3.5 backdrop-blur-xl shadow-xl font-mono text-xs space-y-1.5">
                  <div className="flex justify-between border-b border-slate-800 pb-1">
                    <span className="text-slate-500">DSN Err:</span>
                    <span className="text-[#38BDF8] font-bold">{step ? `${step.dsnErrorKm.toFixed(3)} km` : "---"}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800 pb-1">
                    <span className="text-slate-500">Pulsar Err:</span>
                    <span className="text-[#F59E0B] font-bold">{step ? `${step.pulsarErrorKm.toFixed(3)} km` : "---"}</span>
                  </div>
                  <div className="flex justify-between pb-1">
                    <span className="text-slate-500">Hybrid Err:</span>
                    <span className="text-[#A78BFA] font-bold">{step ? `${step.hybridErrorKm.toFixed(3)} km` : "---"}</span>
                  </div>
                </div>

                {/* Left Bottom: 3D Layers Toggles */}
                <div className="absolute bottom-16 left-4 z-10 flex flex-wrap gap-1.5">
                  <button onClick={() => setShowPlanets(v=>!v)} className={cn("text-[10px] font-bold px-2 py-1 rounded border", showPlanets ? "bg-[#38BDF8]/20 text-[#38BDF8] border-[#38BDF8]/40" : "bg-slate-900 border-slate-800 text-slate-400")}>PLANETS</button>
                  <button onClick={() => setShowPulsars(v=>!v)} className={cn("text-[10px] font-bold px-2 py-1 rounded border", showPulsars ? "bg-[#A78BFA]/20 text-[#A78BFA] border-[#A78BFA]/40" : "bg-slate-900 border-slate-800 text-slate-400")}>PULSARS</button>
                  <button onClick={() => setShowRays(v=>!v)} className={cn("text-[10px] font-bold px-2 py-1 rounded border", showRays ? "bg-cyan-500/20 text-cyan-200 border-cyan-500/40" : "bg-slate-900 border-slate-800 text-slate-400")}>NAV RAYS</button>
                  <button onClick={() => setShowDsn(v=>!v)} className={cn("text-[10px] font-bold px-2 py-1 rounded border", showDsn ? "bg-[#38BDF8]/20 text-[#38BDF8] border-[#38BDF8]/40" : "bg-slate-900 border-slate-800 text-slate-400")}>DSN LINE</button>
                  <button onClick={() => setShowPulsarPath(v=>!v)} className={cn("text-[10px] font-bold px-2 py-1 rounded border", showPulsarPath ? "bg-[#F59E0B]/20 text-[#F59E0B] border-[#F59E0B]/40" : "bg-slate-900 border-slate-800 text-slate-400")}>XNAV LINE</button>
                  <button onClick={() => setShowHybrid(v=>!v)} className={cn("text-[10px] font-bold px-2 py-1 rounded border", showHybrid ? "bg-[#A78BFA]/20 text-[#A78BFA] border-[#A78BFA]/40" : "bg-slate-900 border-slate-800 text-slate-400")}>HYBRID</button>
                </div>

                {/* Right Bottom: Dynamic tooltip / hover details */}
                {hovered && (
                  <div className="absolute bottom-16 right-4 z-10 max-w-[260px] rounded-xl border border-cyan-400/20 bg-slate-950/90 p-3 shadow-glow backdrop-blur-xl text-xs">
                    <p className="font-bold text-cyan-300">{hovered.name}</p>
                    <p className="text-slate-400 mt-1 leading-normal text-[11px]">{hovered.desc}</p>
                  </div>
                )}

                {/* Playback Controls Footer bar */}
                <div className="absolute bottom-0 left-0 right-0 z-20 border-t border-cyan-400/10 bg-slate-950/95 backdrop-blur px-4 py-2 flex items-center justify-between gap-3 text-slate-400">
                  <div className="flex items-center gap-1">
                    <button onClick={() => { setIsPlaying(false); setCurrentFrame(0); }}
                      className="h-8 w-8 rounded hover:bg-slate-800 flex items-center justify-center transition-colors">
                      <RefreshCcw className="h-4 w-4" />
                    </button>
                    <button onClick={() => { setIsPlaying(false); setCurrentFrame(p => Math.max(0, p - 1)); }}
                      className="h-8 w-8 rounded hover:bg-slate-800 flex items-center justify-center transition-colors">
                      <ChevronLeft className="h-4.5 w-4.5" />
                    </button>
                    <button onClick={() => setIsPlaying(v => !v)}
                      className={cn("h-9 w-9 rounded-lg border shadow flex items-center justify-center transition-all",
                        isPlaying ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-cyan-500/40 bg-cyan-500/10 text-cyan-300")}>
                      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-0.5" />}
                    </button>
                    <button onClick={() => { setIsPlaying(false); setCurrentFrame(p => Math.min(simResult.steps.length - 1, p + 1)); }}
                      className="h-8 w-8 rounded hover:bg-slate-800 flex items-center justify-center transition-colors">
                      <ChevronRight className="h-4.5 w-4.5" />
                    </button>
                  </div>
                  <div className="relative flex-1 h-1.5 rounded-full bg-slate-800 mx-4 cursor-pointer">
                    <input type="range" min={0} max={simResult.steps.length - 1} value={currentFrame}
                      onChange={e => { setIsPlaying(false); setCurrentFrame(Number(e.target.value)); }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                    <div className="absolute left-0 top-0 h-full rounded bg-cyan-400"
                      style={{ width: `${(currentFrame / (simResult.steps.length - 1)) * 100}%` }} />
                  </div>
                  <div className="flex gap-1">
                    {([1, 2, 5] as const).map(s => (
                      <button key={s} onClick={() => setSpeed(s)}
                        className={cn("text-xs px-2 py-1 rounded font-bold transition-all",
                          speed === s ? "bg-cyan-500/20 text-cyan-200 border border-cyan-500/40" : "hover:bg-slate-800 text-slate-400")}>
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Recharts Analytics Panel */}
      <div className="grid gap-6">
        <Panel className="p-0 flex flex-col min-h-[480px]">
          <div className="border-b border-slate-800 p-5 flex flex-wrap justify-between items-center gap-3">
            <div>
              <h3 className="text-md font-bold text-slate-100">Sensor Fusion Accuracy Charts</h3>
              <p className="text-xs text-slate-400 mt-0.5">Physical error bounds resolved along coordinate frame propagation.</p>
            </div>
            <div className="flex gap-1.5 bg-slate-950/60 p-1 rounded-lg border border-slate-800">
              {(["error", "latency", "autonomy", "infrastructure"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all",
                    activeTab === tab
                      ? "bg-primary text-slate-950 shadow-glow"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="p-5 flex-1 min-h-[350px] flex items-center justify-center">
            {simResult && (
              <div className="w-full h-full min-h-[320px]">
                {activeTab === "error" && (
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={simResult.steps} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                      <CartesianGrid stroke="rgba(148, 163, 184, 0.08)" />
                      <XAxis dataKey="timeSec" stroke="#94A3B8" tick={{ fill: "#CBD5E1", fontSize: 10 }}
                        label={{ value: "Simulation Time (Seconds)", position: "insideBottom", offset: -5, fill: "#94A3B8", fontSize: 11 }} />
                      <YAxis stroke="#94A3B8" tick={{ fill: "#CBD5E1", fontSize: 10 }}
                        label={{ value: "Position Error (km)", angle: -90, position: "insideLeft", offset: 10, fill: "#94A3B8", fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: "#090d16", border: "1px solid rgba(0, 191, 255, 0.25)", borderRadius: "6px", color: "#F8FAFC", fontFamily: "monospace", fontSize: "11px" }} />
                      <ChartLegend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                      <Line type="monotone" dataKey="dsnErrorKm" name="Conventional DSN" stroke={COLOR_DSN} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="pulsarErrorKm" name="Autonomous XNAV" stroke={COLOR_PULSAR} strokeWidth={1.5} dot={false} />
                      <Line type="monotone" dataKey="hybridErrorKm" name="Hybrid EKF" stroke={COLOR_HYBRID} strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}

                {activeTab === "latency" && (
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={simResult.steps} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                      <CartesianGrid stroke="rgba(148, 163, 184, 0.08)" />
                      <XAxis dataKey="timeSec" stroke="#94A3B8" tick={{ fill: "#CBD5E1", fontSize: 10 }} />
                      <YAxis stroke="#94A3B8" tick={{ fill: "#CBD5E1", fontSize: 10 }}
                        label={{ value: "One-Way Delay (Seconds)", angle: -90, position: "insideLeft", offset: 10, fill: "#94A3B8", fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: "#090d16", border: "1px solid rgba(0, 191, 255, 0.25)", borderRadius: "6px", color: "#F8FAFC", fontFamily: "monospace", fontSize: "11px" }} />
                      <ChartLegend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                      <Line type="monotone" dataKey="latencySec" name="One-Way Comm Latency" stroke="#F59E0B" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}

                {activeTab === "autonomy" && (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={[
                      { name: "Autonomy Score", DSN: 5, Pulsar: 100, Hybrid: 90 },
                      { name: "Earth Independence", DSN: 0, Pulsar: 100, Hybrid: 85 },
                      { name: "Stability Index", DSN: 40, Pulsar: 92, Hybrid: 98 }
                    ]} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                      <CartesianGrid stroke="rgba(148, 163, 184, 0.08)" />
                      <XAxis dataKey="name" stroke="#94A3B8" tick={{ fill: "#CBD5E1", fontSize: 11 }} />
                      <YAxis stroke="#94A3B8" tick={{ fill: "#CBD5E1", fontSize: 10 }} domain={[0, 100]} />
                      <Tooltip contentStyle={{ background: "#090d16", border: "1px solid rgba(0, 191, 255, 0.25)", borderRadius: "6px", color: "#F8FAFC", fontFamily: "monospace", fontSize: "11px" }} />
                      <ChartLegend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="DSN" name="Conventional DSN" fill={COLOR_DSN} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Pulsar" name="XNAV" fill={COLOR_PULSAR} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Hybrid" name="Hybrid EKF" fill={COLOR_HYBRID} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}

                {activeTab === "infrastructure" && (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={[
                      { metric: "Ground Station Load", DSN: 100, Pulsar: 0, Hybrid: 15 },
                      { metric: "Onboard Payload", DSN: 5, Pulsar: 100, Hybrid: 100 },
                      { metric: "Scheduling Conflict Risk", DSN: 95, Pulsar: 0, Hybrid: 10 }
                    ]} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                      <CartesianGrid stroke="rgba(148, 163, 184, 0.08)" />
                      <XAxis dataKey="metric" stroke="#94A3B8" tick={{ fill: "#CBD5E1", fontSize: 11 }} />
                      <YAxis stroke="#94A3B8" tick={{ fill: "#CBD5E1", fontSize: 10 }} domain={[0, 100]} />
                      <Tooltip contentStyle={{ background: "#090d16", border: "1px solid rgba(0, 191, 255, 0.25)", borderRadius: "6px", color: "#F8FAFC", fontFamily: "monospace", fontSize: "11px" }} />
                      <ChartLegend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="DSN" name="Conventional DSN" fill={COLOR_DSN} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Pulsar" name="XNAV" fill={COLOR_PULSAR} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Hybrid" name="Hybrid EKF" fill={COLOR_HYBRID} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}
          </div>
        </Panel>
      </div>

      {/* Benchmarks & Analysis Matrices */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Computation Benchmarks */}
        <Panel className="space-y-4 shadow-lg">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Flame className="h-5 w-5 text-amber-500" />
            <h3 className="text-md font-bold text-slate-100">Computation & Algorithm Benchmarks</h3>
          </div>
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left text-slate-400 border border-slate-800/60 rounded-md">
              <thead className="bg-slate-950/60 font-semibold text-slate-300 font-mono">
                <tr>
                  <th className="p-2.5">NAV METRIC</th>
                  <th className="p-2.5">DSN FILTER</th>
                  <th className="p-2.5">PULSAR XNAV</th>
                  <th className="p-2.5">HYBRID EKF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 font-mono text-[11px]">
                <tr>
                  <td className="p-2.5 text-slate-300">Avg Runtime</td>
                  <td className="p-2.5 text-[#38BDF8]">{simResult?.benchmarks.dsnTimeMs.toFixed(2)} ms</td>
                  <td className="p-2.5 text-[#F59E0B]">{simResult?.benchmarks.pulsarTimeMs.toFixed(2)} ms</td>
                  <td className="p-2.5 text-[#A78BFA]">{simResult?.benchmarks.hybridTimeMs.toFixed(2)} ms</td>
                </tr>
                <tr>
                  <td className="p-2.5 text-slate-300">Peak Memory</td>
                  <td className="p-2.5">{simResult?.benchmarks.dsnMemoryKb.toFixed(1)} KB</td>
                  <td className="p-2.5">{simResult?.benchmarks.pulsarMemoryKb.toFixed(1)} KB</td>
                  <td className="p-2.5">{simResult?.benchmarks.hybridMemoryKb.toFixed(1)} KB</td>
                </tr>
                <tr>
                  <td className="p-2.5 text-slate-300">CPU Occupancy</td>
                  <td className="p-2.5">{simResult?.benchmarks.dsnCpuPct.toFixed(2)}%</td>
                  <td className="p-2.5">{simResult?.benchmarks.pulsarCpuPct.toFixed(2)}%</td>
                  <td className="p-2.5">{simResult?.benchmarks.hybridCpuPct.toFixed(2)}%</td>
                </tr>
                <tr>
                  <td className="p-2.5 text-slate-300">Complexity</td>
                  <td className="p-2.5">O(N_station^3)</td>
                  <td className="p-2.5">O(N_pulsar^3)</td>
                  <td className="p-2.5">O((N_psr+2)^3)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Cost Analysis Matrix */}
        <Panel className="space-y-4 shadow-lg">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Scale className="h-5 w-5 text-purple-400" />
            <h3 className="text-md font-bold text-slate-100">Relative Operational Cost Analysis</h3>
          </div>
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left text-slate-400 border border-slate-800/60 rounded-md">
              <thead className="bg-slate-950/60 font-semibold text-slate-300 font-mono">
                <tr>
                  <th className="p-2.5">COST METRIC</th>
                  <th className="p-2.5">CONVENTIONAL DSN</th>
                  <th className="p-2.5">PULSAR ONLY</th>
                  <th className="p-2.5">HYBRID EKF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 font-mono text-[11px]">
                {costCompare.map(row => (
                  <tr key={row.metric}>
                    <td className="p-2.5 text-slate-300">{row.metric}</td>
                    <td className="p-2.5 text-amber-400">{row.dsn}</td>
                    <td className="p-2.5 text-green-400">{row.pulsar}</td>
                    <td className="p-2.5 text-purple-400">{row.hybrid}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      {/* Suitability Matrix & Educational block */}
      <Panel className="space-y-4 shadow-lg">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <BookOpen className="h-5 w-5 text-cyan-400" />
          <h3 className="text-md font-bold text-slate-100">Mission Suitability Evaluation Matrix</h3>
        </div>
        <div className="overflow-x-auto text-xs">
          <table className="w-full text-left text-slate-400 border border-slate-800/60 rounded-md">
            <thead className="bg-slate-950/60 font-semibold text-slate-300 font-mono">
              <tr>
                <th className="p-2.5">FLIGHT REGION</th>
                <th className="p-2.5">CONVENTIONAL DSN SUITABILITY</th>
                <th className="p-2.5">PULSAR XNAV SUITABILITY</th>
                <th className="p-2.5">HYBRID SUITABILITY</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 font-mono text-[11px]">
              {suitabilityMatrix.map(row => (
                <tr key={row.mission}>
                  <td className="p-2.5 text-slate-300">{row.mission}</td>
                  <td className={cn("p-2.5", row.dsn.includes("High") ? "text-green-400" : row.dsn.includes("Moderate") ? "text-amber-400" : "text-rose-400")}>{row.dsn}</td>
                  <td className={cn("p-2.5", row.pulsar.includes("Very High") || row.pulsar.includes("High") ? "text-green-400" : row.pulsar.includes("Moderate") ? "text-amber-400" : "text-rose-400")}>{row.pulsar}</td>
                  <td className={cn("p-2.5", row.hybrid.includes("Very High") || row.hybrid.includes("High") ? "text-green-400" : "text-rose-400")}>{row.hybrid}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Floating help modal dialog */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur">
          <div className="w-[500px] border border-slate-800 bg-slate-900 p-6 rounded-xl space-y-4 max-h-[85vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-md font-bold uppercase tracking-wider text-cyan-200">Scientific Guidelines & Models</h3>
              <button onClick={() => setShowHelp(false)} className="text-slate-400 hover:text-white font-bold text-sm">✕</button>
            </div>
            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <p><strong>1. Ground Truth Orbit Simulator:</strong> Propagated using RK4 integration incorporating Earth oblate perturbations (J2 harmonics) for geocentric paths, third-body Lunar gravity for transfer lines, and heliocentric planetary forces for Mars transfer paths.</p>
              <p><strong>2. Conventional DSN Model:</strong> Range and Doppler measured relative to Canberra, Madrid, and Goldstone ECI rotating positions. Standard ranges are subject to tracking pass intervals (availability slot constraints).</p>
              <p><strong>3. Pulsar XNAV:</strong> Continuous barycentric timing measurement offsets. Zero-mean timing stabilities model dispersion delays from interstellar plasma.</p>
              <p><strong>4. Hybrid EKF:</strong> 8-state state space vector: position (x,y,z), velocity (vx,vy,vz), clock bias, and clock drift. Fuses DSN range/Doppler and Pulsar ranges to minimize cross-range drift errors during ground linkage gaps.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
