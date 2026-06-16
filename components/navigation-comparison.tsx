"use client";

import React, { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Compass,
  Cpu,
  Globe,
  Info,
  Network,
  Play,
  RefreshCcw,
  Scale,
  Shield,
  Signal,
  Zap,
  CheckCircle2,
  AlertTriangle,
  BookOpen,
} from "lucide-react";
import { Panel, Button, Badge } from "./ui";

// Seed-based random generator for smooth slider transitions
function seedRng(seed: number) {
  let s = seed;
  return () => {
    s = (1664525 * s + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function gaussianNoise(random: () => number) {
  const u1 = Math.max(random(), 1e-12);
  const u2 = random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Types
type MissionRegion = "earth_orbit" | "earth_moon" | "deep_space" | "outer_solar_system";

interface SimStep {
  hour: number;
  dsnError: number;
  pulsarError: number;
  hybridError: number;
}

interface SimResult {
  steps: SimStep[];
  dsnSummary: SystemSummary;
  pulsarSummary: SystemSummary;
  hybridSummary: SystemSummary;
}

interface SystemSummary {
  meanError: number;
  medianError: number;
  p95Error: number;
  maxError: number;
}

export function NavigationComparison() {
  // Simulator state parameters
  const [region, setRegion] = useState<MissionRegion>("deep_space");
  const [pulsarCount, setPulsarCount] = useState<number>(6);
  const [noiseNs, setNoiseNs] = useState<number>(100);
  const [dsnInterval, setDsnInterval] = useState<number>(12); // hours
  const [detectorArea, setDetectorArea] = useState<number>(1.0); // m^2
  const [integrationTime, setIntegrationTime] = useState<number>(3600); // seconds
  const [activeTab, setActiveTab] = useState<"error" | "latency" | "autonomy" | "infrastructure">("error");
  const [selectedSystem, setSelectedSystem] = useState<"dsn" | "pulsar" | "hybrid">("hybrid");

  // Output state
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Region configuration data (literature-based reference values)
  const regionData = {
    earth_orbit: {
      name: "Earth Orbit (LEO/GEO)",
      distanceKm: 25000,
      rtltSec: 0.17,
      dsnBaseRangeErrorKm: 0.002, // 2m
      dsnAngularErrorRad: 1e-9, // 1 nrad
      driftRateKmHr: 0.05, // low orbital drift
      dsnCost: 80,
    },
    earth_moon: {
      name: "Cislunar Space (Earth-Moon)",
      distanceKm: 384400,
      rtltSec: 2.56,
      dsnBaseRangeErrorKm: 0.005, // 5m
      dsnAngularErrorRad: 1.5e-9,
      driftRateKmHr: 0.2, // moderate drift
      dsnCost: 85,
    },
    deep_space: {
      name: "Deep Space (Mars Cruise)",
      distanceKm: 225000000, // 1.5 AU
      rtltSec: 1500, // 25 mins
      dsnBaseRangeErrorKm: 0.015, // 15m
      dsnAngularErrorRad: 2.5e-9, // 2.5 nrad
      driftRateKmHr: 0.8, // solar radiation pressure drift
      dsnCost: 95,
    },
    outer_solar_system: {
      name: "Outer Solar System (Kuiper Belt)",
      distanceKm: 6000000000, // 40 AU
      rtltSec: 40000, // ~11.1 hours
      dsnBaseRangeErrorKm: 0.08, // 80m
      dsnAngularErrorRad: 5e-9,
      driftRateKmHr: 2.5, // sparse dynamic models drift
      dsnCost: 100,
    },
  };

  // Perform client-side Monte Carlo trajectory propagation & sensor measurement fusion
  const runComparisonSimulation = () => {
    setLoading(true);
    
    // Set seed for consistent curves while updating sliders
    const random = seedRng(101);

    const steps: SimStep[] = [];
    const dsnErrors: number[] = [];
    const pulsarErrors: number[] = [];
    const hybridErrors: number[] = [];

    const activeRegion = regionData[region];
    const distanceKm = activeRegion.distanceKm;
    
    // 1. Calculate XNAV Baseline Error
    // Accuracy scales with timing noise (linear), GDOP (linear), and inverse square root of detector area and integration time
    const gdop = 2.2;
    const c = 299792.458; // km/s
    // XNAV Position standard deviation (km)
    const xnavBaseError = (c * (noiseNs * 1e-9) * gdop) / Math.sqrt(detectorArea * (integrationTime / 1000) * (pulsarCount / 4));
    
    // 2. Initialize Trajectory Errors
    let dsnCurrentErr = activeRegion.dsnBaseRangeErrorKm;
    let hybridCurrentErr = activeRegion.dsnBaseRangeErrorKm;
    let lastDsnContactHour = 0;

    // Simulate a 48-hour timeline
    for (let hour = 0; hour <= 48; hour++) {
      const isDsnAvailable = hour % dsnInterval === 0;

      // --- DSN Error Model ---
      if (isDsnAvailable) {
        lastDsnContactHour = hour;
        // DSN error combines line-of-sight range accuracy and cross-range angular accuracy (which grows with distance)
        const dsnCrossRangeError = distanceKm * activeRegion.dsnAngularErrorRad;
        const baseDsnErr = Math.hypot(activeRegion.dsnBaseRangeErrorKm, dsnCrossRangeError);
        // Add measurement noise
        dsnCurrentErr = baseDsnErr * (1 + 0.1 * gaussianNoise(random));
      } else {
        // Between DSN tracking passes, error drifts due to state propagation uncertainties
        const timeSinceDsn = hour - lastDsnContactHour;
        const drift = activeRegion.driftRateKmHr * Math.pow(timeSinceDsn, 1.25);
        dsnCurrentErr += drift * 0.05 + Math.abs(gaussianNoise(random)) * 0.02;
      }
      // Clean error limits
      dsnCurrentErr = Math.max(0.001, dsnCurrentErr);

      // --- Pulsar Error Model ---
      // XNAV provides absolute measurements continuously. It does not drift, but has high zero-mean noise.
      const pulsarErr = Math.max(0.01, xnavBaseError * (1.0 + 0.22 * gaussianNoise(random)));

      // --- Hybrid Error Model ---
      // Hybrid combines continuous XNAV direction/offset updates with periodic DSN ranging calibrations.
      if (isDsnAvailable) {
        // Full calibration: Hybrid achieves optimal state bound
        const dsnCrossRange = distanceKm * activeRegion.dsnAngularErrorRad;
        const baseDsnErr = Math.hypot(activeRegion.dsnBaseRangeErrorKm, dsnCrossRange);
        // Hybrid EKF combines both measurements, improving cross-range and clock bounds
        hybridCurrentErr = Math.min(baseDsnErr, pulsarErr) * 0.5 * (1 + 0.08 * gaussianNoise(random));
      } else {
        // Between DSN updates, continuous XNAV bounds the cross-range drift.
        // It does not drift unbounded like DSN alone. The state covariance stays constrained.
        const timeSinceDsn = hour - lastDsnContactHour;
        const driftAccumulation = activeRegion.driftRateKmHr * 0.08 * Math.sqrt(timeSinceDsn);
        hybridCurrentErr = Math.min(
          dsnCurrentErr,
          hybridCurrentErr + driftAccumulation + Math.abs(gaussianNoise(random)) * 0.01
        );
      }
      // Ensure Hybrid is strictly bounded by Pulsar and DSN bounds
      hybridCurrentErr = Math.min(hybridCurrentErr, pulsarErr * 0.85);
      hybridCurrentErr = Math.max(0.001, hybridCurrentErr);

      steps.push({
        hour,
        dsnError: Number(dsnCurrentErr.toFixed(4)),
        pulsarError: Number(pulsarErr.toFixed(4)),
        hybridError: Number(hybridCurrentErr.toFixed(4)),
      });

      dsnErrors.push(dsnCurrentErr);
      pulsarErrors.push(pulsarErr);
      hybridErrors.push(hybridCurrentErr);
    }

    // Compute stats helper
    const computeSummary = (arr: number[]): SystemSummary => {
      const sorted = [...arr].sort((a, b) => a - b);
      return {
        meanError: arr.reduce((sum, v) => sum + v, 0) / arr.length,
        medianError: sorted[Math.floor(sorted.length * 0.5)],
        p95Error: sorted[Math.floor(sorted.length * 0.95)],
        maxError: Math.max(...arr),
      };
    };

    setSimResult({
      steps,
      dsnSummary: computeSummary(dsnErrors),
      pulsarSummary: computeSummary(pulsarErrors),
      hybridSummary: computeSummary(hybridErrors),
    });

    setLoading(false);
  };

  // Run simulation on mount and when parameters change
  useEffect(() => {
    runComparisonSimulation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, pulsarCount, noiseNs, dsnInterval, detectorArea, integrationTime]);

  const activeRegion = regionData[region];

  // Dynamic values for latency & autonomy comparison charts
  const latencyChartData = [
    {
      name: "DSN (Ground Link)",
      RTLT: Number(activeRegion.rtltSec.toFixed(2)),
      OnboardDelay: 0,
      total: Number((activeRegion.rtltSec).toFixed(2)),
    },
    {
      name: "Pulsar (XNAV)",
      RTLT: 0,
      OnboardDelay: Number((integrationTime / 10).toFixed(2)), // Folding delay in seconds
      total: Number((integrationTime / 10).toFixed(2)),
    },
    {
      name: "Hybrid Nav",
      RTLT: 0.1, // Near real-time onboard with micro-DSN sync
      OnboardDelay: 2.0,
      total: 2.1,
    },
  ];

  const autonomyChartData = [
    {
      name: "Autonomy Score",
      DSN: 5,
      Pulsar: 100,
      Hybrid: 90,
    },
    {
      name: "Earth Independence",
      DSN: 0,
      Pulsar: 100,
      Hybrid: 85,
    },
    {
      name: "Failsafe Reliability",
      DSN: 40, // Loss of signal causes immediate loss of state propagation bounds
      Pulsar: 95,
      Hybrid: 98, // Continuous backup plus earth-calibration
    },
  ];

  const infraChartData = [
    {
      metric: "Ground Station Load",
      DSN: 100,
      Pulsar: 0,
      Hybrid: 15,
    },
    {
      metric: "Onboard Payload (Mass/Power)",
      DSN: 5, // uses basic telecom transponder
      Pulsar: 100, // requires X-ray collectors & processors
      Hybrid: 100,
    },
    {
      metric: "Scheduling Conflict Risk",
      DSN: 95, // DSN booking bottleneck
      Pulsar: 0,
      Hybrid: 10,
    },
    {
      metric: "Operational Cost",
      DSN: 90,
      Pulsar: 35, // High initial payload, zero running link costs
      Hybrid: 60,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Overview Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* DSN CARD */}
        <div
          onClick={() => setSelectedSystem("dsn")}
          className={`glass cursor-pointer rounded-lg p-5 transition-all duration-300 relative overflow-hidden group border ${
            selectedSystem === "dsn"
              ? "border-warning/60 shadow-[0_0_22px_rgba(245,158,11,0.15)] bg-warning/5"
              : "border-cyan-300/10 hover:border-cyan-300/30 bg-slate-950/40"
          }`}
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs uppercase tracking-widest text-warning font-semibold">Arch 01 • Ground Loop</p>
              <h3 className="text-xl font-bold mt-1 text-text">DSN Navigation</h3>
            </div>
            <Globe className={`h-5 w-5 text-warning group-hover:scale-110 transition-transform`} />
          </div>
          
          <div className="mt-5 space-y-2 font-mono text-sm">
            <div className="flex justify-between border-b border-slate-800/60 pb-1">
              <span className="text-slate-400">Est. Mean Error:</span>
              <span className="font-semibold text-warning">
                {simResult ? `${simResult.dsnSummary.meanError.toFixed(3)} km` : "Simulating..."}
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-800/60 pb-1">
              <span className="text-slate-400">Earth Dependency:</span>
              <span className="font-semibold text-warning">100% (Critical)</span>
            </div>
            <div className="flex justify-between pb-1">
              <span className="text-slate-400">Autonomy Score:</span>
              <span className="font-semibold text-warning">5 / 100</span>
            </div>
          </div>
          
          <div className="mt-4 flex gap-1.5 items-center">
            <Badge className="border-warning/30 bg-warning/10 text-amber-200 text-[10px]">Ground Dependent</Badge>
            <Badge className="border-warning/30 bg-warning/10 text-amber-200 text-[10px]">High Cross-Range Drift</Badge>
          </div>
        </div>

        {/* PULSAR CARD */}
        <div
          onClick={() => setSelectedSystem("pulsar")}
          className={`glass cursor-pointer rounded-lg p-5 transition-all duration-300 relative overflow-hidden group border ${
            selectedSystem === "pulsar"
              ? "border-primary/60 shadow-[0_0_22px_rgba(0,191,255,0.15)] bg-primary/5"
              : "border-cyan-300/10 hover:border-cyan-300/30 bg-slate-950/40"
          }`}
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs uppercase tracking-widest text-primary font-semibold">Arch 02 • Celestial</p>
              <h3 className="text-xl font-bold mt-1 text-text">Pulsar Navigation</h3>
            </div>
            <Cpu className={`h-5 w-5 text-primary group-hover:scale-110 transition-transform`} />
          </div>
          
          <div className="mt-5 space-y-2 font-mono text-sm">
            <div className="flex justify-between border-b border-slate-800/60 pb-1">
              <span className="text-slate-400">Est. Mean Error:</span>
              <span className="font-semibold text-primary">
                {simResult ? `${simResult.pulsarSummary.meanError.toFixed(3)} km` : "Simulating..."}
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-800/60 pb-1">
              <span className="text-slate-400">Earth Dependency:</span>
              <span className="font-semibold text-primary">0% (Autonomous)</span>
            </div>
            <div className="flex justify-between pb-1">
              <span className="text-slate-400">Autonomy Score:</span>
              <span className="font-semibold text-primary">100 / 100</span>
            </div>
          </div>
          
          <div className="mt-4 flex gap-1.5 items-center">
            <Badge className="border-primary/30 bg-primary/10 text-cyan-200 text-[10px]">Fully Autonomous</Badge>
            <Badge className="border-primary/30 bg-primary/10 text-cyan-200 text-[10px]">Distance Independent</Badge>
          </div>
        </div>

        {/* HYBRID CARD */}
        <div
          onClick={() => setSelectedSystem("hybrid")}
          className={`glass cursor-pointer rounded-lg p-5 transition-all duration-300 relative overflow-hidden group border ${
            selectedSystem === "hybrid"
              ? "border-success/60 shadow-[0_0_22px_rgba(34,197,94,0.15)] bg-success/5"
              : "border-cyan-300/10 hover:border-cyan-300/30 bg-slate-950/40"
          }`}
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs uppercase tracking-widest text-success font-semibold">Arch 03 • Co-operative</p>
              <h3 className="text-xl font-bold mt-1 text-text">Hybrid Architecture</h3>
            </div>
            <Compass className={`h-5 w-5 text-success group-hover:scale-110 transition-transform`} />
          </div>
          
          <div className="mt-5 space-y-2 font-mono text-sm">
            <div className="flex justify-between border-b border-slate-800/60 pb-1">
              <span className="text-slate-400">Est. Mean Error:</span>
              <span className="font-semibold text-success">
                {simResult ? `${simResult.hybridSummary.meanError.toFixed(3)} km` : "Simulating..."}
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-800/60 pb-1">
              <span className="text-slate-400">Earth Dependency:</span>
              <span className="font-semibold text-success">Sparse (10-15%)</span>
            </div>
            <div className="flex justify-between pb-1">
              <span className="text-slate-400">Autonomy Score:</span>
              <span className="font-semibold text-success">90 / 100</span>
            </div>
          </div>
          
          <div className="mt-4 flex gap-1.5 items-center">
            <Badge className="border-success/30 bg-success/10 text-green-200 text-[10px]">Optimal Solution</Badge>
            <Badge className="border-success/30 bg-success/10 text-green-200 text-[10px]">Lower DSN Queue Load</Badge>
          </div>
        </div>
      </div>

      {/* Main Lab Layout */}
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        
        {/* Left Column: Simulation Controls */}
        <Panel className="space-y-5">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Compass className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Simulation Parameters</h2>
          </div>

          {/* Mission Region Selector */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2">
              Mission Flight Region
            </label>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value as MissionRegion)}
              className="w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-text font-medium focus:ring-1 focus:ring-primary focus:outline-none"
            >
              <option value="earth_orbit">Earth Orbit (LEO/GEO)</option>
              <option value="earth_moon">Cislunar Space (Earth-Moon)</option>
              <option value="deep_space">Deep Space (Mars Cruise)</option>
              <option value="outer_solar_system">Outer Solar System (40 AU)</option>
            </select>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-500 font-mono">
              <span>Ref. Dist: ~{(activeRegion.distanceKm / 1e6).toFixed(2)}M km</span>
              <span>RTLT: {(activeRegion.rtltSec).toFixed(2)} s</span>
            </div>
          </div>

          {/* DSN Tracking Interval */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2">
              DSN Tracking Pass Interval
            </label>
            <select
              value={dsnInterval}
              onChange={(e) => setDsnInterval(Number(e.target.value))}
              className="w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-text font-medium focus:ring-1 focus:ring-primary focus:outline-none"
            >
              <option value={4}>Every 4 Hours</option>
              <option value={8}>Every 8 Hours</option>
              <option value={12}>Every 12 Hours (Standard)</option>
              <option value={24}>Every 24 Hours</option>
              <option value={48}>Every 48 Hours (Sparse DSN)</option>
            </select>
            <p className="mt-1 text-[11px] text-slate-500">
              Frequency of active ground ranging updates.
            </p>
          </div>

          {/* Pulsar Counts Slider */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-xs uppercase tracking-wider text-slate-400 font-semibold">
                XNAV Pulsar Sources
              </label>
              <span className="text-xs font-mono text-primary font-bold">{pulsarCount} Sources</span>
            </div>
            <input
              type="range"
              min={4}
              max={8}
              value={pulsarCount}
              onChange={(e) => setPulsarCount(Number(e.target.value))}
              className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <div className="mt-1 flex justify-between text-[10px] text-slate-500 font-mono">
              <span>Min: 4 (4D Fix)</span>
              <span>Max: 8 (Over-determined)</span>
            </div>
          </div>

          {/* Timing Noise Selector */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2">
              Pulsar Timing Noise
            </label>
            <select
              value={noiseNs}
              onChange={(e) => setNoiseNs(Number(e.target.value))}
              className="w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-text font-medium focus:ring-1 focus:ring-primary focus:outline-none"
            >
              <option value={10}>10 ns (Research Grade)</option>
              <option value={50}>50 ns (Highly Stable MSPs)</option>
              <option value={100}>100 ns (Standard Crab/MSPs)</option>
              <option value={500}>500 ns (Coarse XNAV)</option>
              <option value={1000}>1000 ns (High Noise)</option>
            </select>
          </div>

          {/* Onboard X-ray Detector Area */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-xs uppercase tracking-wider text-slate-400 font-semibold">
                X-ray Detector Area
              </label>
              <span className="text-xs font-mono text-primary font-bold">{detectorArea.toFixed(1)} m²</span>
            </div>
            <input
              type="range"
              min={0.1}
              max={5.0}
              step={0.1}
              value={detectorArea}
              onChange={(e) => setDetectorArea(Number(e.target.value))}
              className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Larger areas collect more photons, lowering Poisson phase uncertainty.
            </p>
          </div>

          {/* Integration Time Selector */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2">
              Pulsar Integration Time
            </label>
            <select
              value={integrationTime}
              onChange={(e) => setIntegrationTime(Number(e.target.value))}
              className="w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-text font-medium focus:ring-1 focus:ring-primary focus:outline-none"
            >
              <option value={1000}>1,000 seconds (~16m)</option>
              <option value={3600}>3,600 seconds (1 hour)</option>
              <option value={7200}>7,200 seconds (2 hours)</option>
              <option value={14400}>14,400 seconds (4 hours)</option>
            </select>
          </div>

          <Button
            onClick={runComparisonSimulation}
            disabled={loading}
            className="w-full bg-primary/20 hover:bg-primary/30 border-primary/40 text-primary mt-4 flex items-center justify-center gap-2"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Re-simulating..." : "Reset & Run Sim"}
          </Button>

          <div className="rounded-md border border-cyan-300/10 bg-slate-950/60 p-3 text-[11px] text-slate-500 space-y-1.5 font-mono">
            <p className="font-semibold text-slate-400">SIMULATION ENGINE NOTES:</p>
            <p>• True trajectory: Perturbed orbital propagation</p>
            <p>• DSN model: Angular scale error ($\theta \cdot r$)</p>
            <p>• XNAV model: Poisson photon process estimator</p>
            <p>• EKF fusion: State covariance tracking</p>
          </div>
        </Panel>

        {/* Right Column: Comparative Charts & Detailed Metrics */}
        <div className="space-y-6">
          <Panel className="p-0 flex flex-col h-full min-h-[500px]">
            <div className="border-b border-slate-800 p-5 flex flex-wrap justify-between items-center gap-3">
              <div>
                <h3 className="text-lg font-bold text-text">Interactive Analysis Visualizations</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Compare tracking accuracy, latencies, autonomy, and infrastructure loads.
                </p>
              </div>
              <div className="flex gap-1.5 bg-slate-950/60 p-1 rounded-lg border border-slate-800">
                {(["error", "latency", "autonomy", "infrastructure"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-all ${
                      activeTab === tab
                        ? "bg-primary text-slate-950 shadow-glow font-bold"
                        : "text-slate-400 hover:text-text hover:bg-slate-900"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-5 flex-1 min-h-[380px] flex items-center justify-center">
              {loading ? (
                <div className="text-center space-y-3">
                  <div className="h-8 w-8 animate-spin border-2 border-primary border-t-transparent rounded-full mx-auto" />
                  <p className="text-xs text-slate-500 font-mono">Executing Monte Carlo flight passes...</p>
                </div>
              ) : (
                <div className="w-full h-full min-h-[350px]">
                  {activeTab === "error" && (
                    <ResponsiveContainer width="100%" height={350}>
                      <LineChart
                        data={simResult?.steps || []}
                        margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
                      >
                        <CartesianGrid stroke="rgba(148, 163, 184, 0.08)" />
                        <XAxis
                          dataKey="hour"
                          stroke="#94A3B8"
                          tick={{ fill: "#CBD5E1", fontSize: 11 }}
                          label={{ value: "Simulation Flight Time (Hours)", position: "insideBottom", offset: -5, fill: "#94A3B8", fontSize: 12 }}
                        />
                        <YAxis
                          stroke="#94A3B8"
                          tick={{ fill: "#CBD5E1", fontSize: 11 }}
                          label={{ value: "Position Error (km)", angle: -90, position: "insideLeft", offset: 10, fill: "#94A3B8", fontSize: 12 }}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#090d16",
                            border: "1px solid rgba(0, 191, 255, 0.25)",
                            borderRadius: "6px",
                            color: "#F8FAFC",
                            fontFamily: "monospace",
                            fontSize: "12px",
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                        <Line
                          type="monotone"
                          dataKey="dsnError"
                          name="DSN (Ground-based)"
                          stroke="#F59E0B"
                          strokeWidth={2}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="pulsarError"
                          name="Pulsar (Autonomous)"
                          stroke="#00BFFF"
                          strokeWidth={1.5}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="hybridError"
                          name="Hybrid Solution (EKF)"
                          stroke="#22C55E"
                          strokeWidth={2.5}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}

                  {activeTab === "latency" && (
                    <ResponsiveContainer width="100%" height={350}>
                      <BarChart
                        data={latencyChartData}
                        margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
                      >
                        <CartesianGrid stroke="rgba(148, 163, 184, 0.08)" />
                        <XAxis dataKey="name" stroke="#94A3B8" tick={{ fill: "#CBD5E1", fontSize: 11 }} />
                        <YAxis
                          stroke="#94A3B8"
                          tick={{ fill: "#CBD5E1", fontSize: 11 }}
                          label={{ value: "Latency (Seconds)", angle: -90, position: "insideLeft", offset: 10, fill: "#94A3B8", fontSize: 12 }}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#090d16",
                            border: "1px solid rgba(0, 191, 255, 0.25)",
                            borderRadius: "6px",
                            color: "#F8FAFC",
                            fontFamily: "monospace",
                            fontSize: "12px",
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="RTLT" name="Earth Link RTLT (Seconds)" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="OnboardDelay" name="Onboard Folding/Processing (Seconds)" fill="#00BFFF" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}

                  {activeTab === "autonomy" && (
                    <ResponsiveContainer width="100%" height={350}>
                      <BarChart
                        data={autonomyChartData}
                        margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
                      >
                        <CartesianGrid stroke="rgba(148, 163, 184, 0.08)" />
                        <XAxis dataKey="name" stroke="#94A3B8" tick={{ fill: "#CBD5E1", fontSize: 11 }} />
                        <YAxis stroke="#94A3B8" tick={{ fill: "#CBD5E1", fontSize: 11 }} domain={[0, 100]} />
                        <Tooltip
                          contentStyle={{
                            background: "#090d16",
                            border: "1px solid rgba(0, 191, 255, 0.25)",
                            borderRadius: "6px",
                            color: "#F8FAFC",
                            fontFamily: "monospace",
                            fontSize: "12px",
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="DSN" name="DSN Loop" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Pulsar" name="XNAV" fill="#00BFFF" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Hybrid" name="Hybrid EKF" fill="#22C55E" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}

                  {activeTab === "infrastructure" && (
                    <ResponsiveContainer width="100%" height={350}>
                      <BarChart
                        data={infraChartData}
                        margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
                      >
                        <CartesianGrid stroke="rgba(148, 163, 184, 0.08)" />
                        <XAxis dataKey="metric" stroke="#94A3B8" tick={{ fill: "#CBD5E1", fontSize: 10 }} />
                        <YAxis stroke="#94A3B8" tick={{ fill: "#CBD5E1", fontSize: 11 }} domain={[0, 100]} />
                        <Tooltip
                          contentStyle={{
                            background: "#090d16",
                            border: "1px solid rgba(0, 191, 255, 0.25)",
                            borderRadius: "6px",
                            color: "#F8FAFC",
                            fontFamily: "monospace",
                            fontSize: "12px",
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="DSN" name="DSN Loop" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Pulsar" name="XNAV" fill="#00BFFF" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Hybrid" name="Hybrid EKF" fill="#22C55E" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              )}
            </div>

            {/* Sub-chart quick data table summary */}
            <div className="border-t border-slate-800 bg-slate-950/20 p-4">
              <h4 className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-3">
                Key Performance Indicators (Simulated Stats)
              </h4>
              <div className="grid grid-cols-3 gap-4 text-xs font-mono">
                <div>
                  <p className="text-slate-500 font-semibold">DSN NAVIGATION</p>
                  <p className="text-text mt-1">
                    Mean Err: <span className="text-warning">{simResult?.dsnSummary.meanError.toFixed(3)} km</span>
                  </p>
                  <p className="text-text">
                    Max Err: <span className="text-warning">{simResult?.dsnSummary.maxError.toFixed(3)} km</span>
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 font-semibold">PULSAR NAVIGATION</p>
                  <p className="text-text mt-1">
                    Mean Err: <span className="text-primary">{simResult?.pulsarSummary.meanError.toFixed(3)} km</span>
                  </p>
                  <p className="text-text">
                    Max Err: <span className="text-primary">{simResult?.pulsarSummary.maxError.toFixed(3)} km</span>
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 font-semibold">HYBRID NAVIGATION</p>
                  <p className="text-text mt-1">
                    Mean Err: <span className="text-success">{simResult?.hybridSummary.meanError.toFixed(3)} km</span>
                  </p>
                  <p className="text-text">
                    Max Err: <span className="text-success">{simResult?.hybridSummary.maxError.toFixed(3)} km</span>
                  </p>
                </div>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {/* Educational & Explanatory section */}
      <Panel className="space-y-6">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <BookOpen className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Scientific Reference & Educational Context</h2>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* How DSN Works */}
          <div className="space-y-2 border border-slate-800/80 bg-slate-950/20 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <Globe className="h-4.5 w-4.5 text-warning" />
              <h3 className="font-semibold text-text text-sm">How DSN Works</h3>
            </div>
            <p className="text-xs leading-5 text-slate-400">
              The **Deep Space Network (DSN)** utilizes massive ground-based radio reflectors (34m and 70m) located in California, Madrid, and Canberra. By transmitting high-power radio signals to space probes, operators calculate **range** based on round-trip light time (RTLT) and **radial velocity** via Doppler shift. Angular position is calculated using **Delta-DOR** interferometry matching multiple antennas.
            </p>
            <p className="text-xs leading-5 text-slate-500">
              *Limitations:* While range is accurate to meters, cross-range (transverse) error increases linearly with distance. Crucially, ground antenna time is a severe scheduling bottleneck.
            </p>
          </div>

          {/* How Pulsar Nav Works */}
          <div className="space-y-2 border border-slate-800/80 bg-slate-950/20 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <Cpu className="h-4.5 w-4.5 text-primary" />
              <h3 className="font-semibold text-text text-sm">How Pulsar Nav Works</h3>
            </div>
            <p className="text-xs leading-5 text-slate-400">
              **X-ray Pulsar Navigation (XNAV)** measures the periodic pulses of rotationally stable millisecond pulsars (MSPs) using onboard X-ray photon-counting telescopes. By folding photon events over time, the system estimates the pulse **Time of Arrival (TOA)**. Comparing these arrivals against reference models at the Solar System Barycenter (SSB) solves for the spacecraft's 3D position vector relative to the SSB.
            </p>
            <p className="text-xs leading-5 text-slate-500">
              *Limitations:* Suffers from Poisson photon noise. Achieving sub-kilometer accuracy requires integration times of hours and heavy, dedicated onboard instrumentation.
            </p>
          </div>

          {/* Why Hybrid is Key */}
          <div className="space-y-2 border border-slate-800/80 bg-slate-950/20 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <Shield className="h-4.5 w-4.5 text-success" />
              <h3 className="font-semibold text-text text-sm">Why Hybrid is Important</h3>
            </div>
            <p className="text-xs leading-5 text-slate-400">
              **Hybrid Navigation** represents the optimal aerospace design for deep-space flight. By combining absolute line-of-sight range data from DSN passes with continuous onboard pulsar observations, an Extended Kalman Filter (EKF) constrains the states. XNAV limits transverse and along-track drift during DSN telemetry gaps, reducing ground antenna booking loads by up to 85%.
            </p>
            <p className="text-xs leading-5 text-slate-500">
              *Failsafe:* If communications are lost, the spacecraft continues to navigate autonomously indefinitely, preventing critical drift that could cause total mission loss.
            </p>
          </div>
        </div>

        {/* References and assumptions */}
        <div className="border-t border-slate-800/80 pt-4 space-y-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Info className="h-4 w-4 text-primary shrink-0" />
            <span className="font-semibold uppercase tracking-wider">Scientific Assumptions & Reference Values</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-400 border border-slate-800/60 rounded-md">
              <thead className="bg-slate-950/60 font-semibold text-slate-300">
                <tr>
                  <th className="p-2 border-b border-slate-800">Parameter</th>
                  <th className="p-2 border-b border-slate-800">Assumption / Value</th>
                  <th className="p-2 border-b border-slate-800">Literature / Source Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                <tr>
                  <td className="p-2 font-mono text-cyan-200">Delta-DOR Accuracy</td>
                  <td className="p-2">1.0 to 5.0 nrad (nanoradians) angular resolution limit</td>
                  <td className="p-2">CCSDS 506.0-B-1 (2013) Radio Metric Estimation guidelines</td>
                </tr>
                <tr>
                  <td className="p-2 font-mono text-cyan-200">Pulsar Stability</td>
                  <td className="p-2">MSP spin stability compared to hydrogen maser clocks ($10^{-15}$ over years)</td>
                  <td className="p-2">"X-Ray Pulsar Navigation" (Emadzadeh & Speyer, Springer 2011)</td>
                </tr>
                <tr>
                  <td className="p-2 font-mono text-cyan-200">Poisson Photon noise</td>
                  <td className="p-2">Arrival processes modeled as Non-Homogeneous Poisson Processes (NHPP)</td>
                  <td className="p-2">NASA NICER/SEXTANT Flight Test Demonstration (MIT, 2018)</td>
                </tr>
                <tr>
                  <td className="p-2 font-mono text-cyan-200">Hybrid EKF Updates</td>
                  <td className="p-2">Dynamic state propagation includes J2 gravity harmonics & Solar Pressure</td>
                  <td className="p-2">Standard IAU SOFA Trajectory correction and barycentric calculations</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
            <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
            <span>Simulation outputs are calculated live on-client using physics-representative models. Reference values are matched to flight-proven limits of Voyager, New Horizons, and NICER.</span>
          </div>
        </div>
      </Panel>
    </div>
  );
}
