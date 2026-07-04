"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Database,
  Download,
  FileDown,
  Gauge,
  GitCompare,
  Home,
  Orbit,
  Menu,
  Pause,
  Play,
  Radar,
  RefreshCcw,
  Rocket,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { motion } from "framer-motion";
import { AccuracyAreaChart, ErrorLineChart, HeatmapChart } from "@/components/charts";
import { SpaceScene } from "@/components/space-scene";
import { Badge, Button, Panel, Skeleton } from "@/components/ui";
import { errorCurve, kpis, logs, simulations, toaRows, topPulsars } from "@/lib/mission-data";
import { cn } from "@/lib/utils";
import { NavigationComparison } from "@/components/navigation-comparison";
import { TrajectoryVisualization } from "@/components/trajectory-visualization";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "catalog", label: "Pulsar Catalog", icon: Database },
  { id: "toa", label: "TOA Database", icon: CircleDot },
  { id: "simulator", label: "Navigation Simulator", icon: Rocket },
  { id: "lab", label: "Navigation Lab", icon: Gauge },
  { id: "comparison", label: "Comparison Lab", icon: GitCompare },
  { id: "selection", label: "Pulsar Selection", icon: Radar },
  { id: "errors", label: "Error Analysis", icon: BarChart3 },
  { id: "ai", label: "AI Insights", icon: BrainCircuit },
  { id: "space", label: "3D Space View", icon: Sparkles },
  { id: "trajectory", label: "Trajectory View", icon: Orbit },
  { id: "settings", label: "Settings", icon: Settings },
];

type NavigationLabResult = {
  config: { trials: number; pulsars: number; noiseNs: number; region: string; algorithm: string; seed: number };
  pulsars: string[];
  summary: { meanErrorKm: number; medianErrorKm: number; p95ErrorKm: number; maxErrorKm: number };
  samples: { trial: number; truePosition: [number, number, number]; estimated: [number, number, number]; errorKm: number }[];
  rawTrials: { trial: number; truePosition: [number, number, number]; estimated: [number, number, number]; errorKm: number }[];
  distribution: { bin: string; count: number }[];
};

function DashboardContent() {
  const search = useSearchParams();
  const initial = search.get("view") ?? "dashboard";
  const [active, setActive] = useState(initial);
  const [collapsed, setCollapsed] = useState(false);
  const ActiveIcon = navItems.find((item) => item.id === active)?.icon ?? Home;

  // Lifted Simulation States
  const [trials, setTrials] = useState(1000);
  const [pulsars, setPulsars] = useState(6);
  const [noise, setNoise] = useState(100);
  const [region, setRegion] = useState("earth_moon");
  const [algorithm, setAlgorithm] = useState("WLS"); // LS, WLS, EKF
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<NavigationLabResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function runSimulation(customParams?: {
    trials?: number;
    pulsars?: number;
    noise?: number;
    region?: string;
    algorithm?: string;
  }) {
    setLoading(true);
    setErrorMsg(null);
    try {
      const activeTrials = customParams?.trials ?? trials;
      const activePulsars = customParams?.pulsars ?? pulsars;
      const activeNoise = customParams?.noise ?? noise;
      const activeRegion = customParams?.region ?? region;
      const activeAlgorithm = customParams?.algorithm ?? algorithm;

      const params = new URLSearchParams({
        trials: String(activeTrials),
        pulsars: String(activePulsars),
        noise: String(activeNoise),
        region: activeRegion,
        algorithm: activeAlgorithm,
      });

      const response = await fetch(`/api/navigation-lab?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Simulation engine returned status ${response.status}`);
      }
      const payload = (await response.json()) as NavigationLabResult;
      setResult(payload);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "An unexpected error occurred in the simulation engine.");
    } finally {
      setLoading(false);
    }
  }

  // Automatically trigger simulation on control parameters change
  useEffect(() => {
    runSimulation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trials, pulsars, noise, region, algorithm]);

  // Exports Implementation
  function exportToCSV() {
    if (!result) return;
    const timestamp = new Date().toISOString();
    let csv = `PulsarNav AI Simulation Report\n`;
    csv += `Generated at,${timestamp}\n`;
    csv += `Algorithm,${result.config.algorithm}\n`;
    csv += `Spacecraft Region,${result.config.region}\n`;
    csv += `Number of Pulsars,${result.config.pulsars}\n`;
    csv += `Timing Noise,${result.config.noiseNs} ns\n`;
    csv += `Total Trials,${result.config.trials}\n\n`;
    
    csv += `SUMMARY STATISTICS\n`;
    csv += `Mean Position Error (km),${result.summary.meanErrorKm.toFixed(6)}\n`;
    csv += `Median Position Error (km),${result.summary.medianErrorKm.toFixed(6)}\n`;
    csv += `95% Confidence Error (km),${result.summary.p95ErrorKm.toFixed(6)}\n`;
    csv += `Max Position Error (km),${result.summary.maxErrorKm.toFixed(6)}\n\n`;
    
    csv += `RAW TRIAL RESULTS\n`;
    csv += `Trial,True_X_km,True_Y_km,True_Z_km,Est_X_km,Est_Y_km,Est_Z_km,Error_km\n`;
    
    result.rawTrials.forEach((t: any) => {
      csv += `${t.trial},${t.truePosition[0].toFixed(4)},${t.truePosition[1].toFixed(4)},${t.truePosition[2].toFixed(4)},${t.estimated[0].toFixed(4)},${t.estimated[1].toFixed(4)},${t.estimated[2].toFixed(4)},${t.errorKm.toFixed(6)}\n`;
    });
    
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `pulsarnav_report_${result.config.algorithm}_${result.config.region}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function exportThreeJSCanvas() {
    const canvas = document.querySelector("canvas");
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `pulsarnav_3d_view_${algorithm}.png`;
    link.click();
  }

  function exportSVGToPNG(svgSelector: string, fileName: string) {
    const svg = document.querySelector(svgSelector);
    if (!svg) return;
    const svgString = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const URL = window.URL || window.webkitURL || window;
    const blobURL = URL.createObjectURL(svgBlob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const rect = svg.getBoundingClientRect();
      canvas.width = rect.width * 2; // Publication quality scale
      canvas.height = rect.height * 2;
      const context = canvas.getContext("2d");
      if (context) {
        context.fillStyle = "#050816";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.scale(2, 2);
        context.drawImage(image, 0, 0);
        const pngURL = canvas.toDataURL("image/png");
        const downloadLink = document.createElement("a");
        downloadLink.href = pngURL;
        downloadLink.download = fileName;
        downloadLink.click();
      }
    };
    image.src = blobURL;
  }

  function exportToPDF() {
    if (!result) return;
    
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    
    const timestamp = new Date().toLocaleString();
    const summary = result.summary;
    
    const errorChartSvg = document.querySelector("#error-chart-panel svg")?.outerHTML || "";
    const distChartSvg = document.querySelector("#dist-chart-panel svg")?.outerHTML || "";
    
    printWindow.document.write(`
      <html>
        <head>
          <title>PulsarNav AI Simulation Report</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
              color: #0f172a;
              padding: 40px;
              line-height: 1.5;
              background: white;
            }
            .header {
              border-bottom: 2px solid #e2e8f0;
              padding-bottom: 20px;
              margin-bottom: 30px;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            .title {
              font-size: 26px;
              font-weight: 700;
              color: #1e3a8a;
              margin: 0;
            }
            .meta-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 15px;
              margin-bottom: 30px;
            }
            .meta-card {
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              padding: 15px;
            }
            .meta-card h3 {
              margin: 0 0 10px 0;
              font-size: 14px;
              text-transform: uppercase;
              color: #64748b;
              letter-spacing: 0.05em;
            }
            .meta-card p {
              margin: 5px 0;
              font-size: 15px;
            }
            .meta-card strong {
              color: #0f172a;
            }
            .stats-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 15px;
              margin-bottom: 40px;
            }
            .stat-box {
              background: #f1f5f9;
              border-left: 4px solid #3b82f6;
              padding: 15px;
              border-radius: 4px;
              text-align: center;
            }
            .stat-val {
              font-size: 22px;
              font-weight: 700;
              color: #1e3a8a;
            }
            .stat-label {
              font-size: 12px;
              color: #475569;
              margin-top: 5px;
            }
            .charts-section {
              display: flex;
              flex-direction: column;
              gap: 30px;
              margin-bottom: 40px;
              page-break-inside: avoid;
            }
            .chart-container {
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              padding: 20px;
              background: white;
              text-align: center;
            }
            .chart-title {
              font-size: 16px;
              font-weight: 600;
              margin-bottom: 15px;
              color: #1e3a8a;
            }
            .chart-svg {
              max-height: 250px;
              width: 100%;
            }
            .table-container {
              margin-top: 30px;
              page-break-before: always;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 15px;
              font-size: 13px;
            }
            th, td {
              border: 1px solid #e2e8f0;
              padding: 8px 12px;
              text-align: left;
            }
            th {
              background: #f8fafc;
              color: #334155;
            }
            .footer {
              margin-top: 50px;
              border-top: 1px solid #e2e8f0;
              padding-top: 15px;
              font-size: 11px;
              color: #64748b;
              text-align: center;
            }
            @media print {
              body { padding: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1 class="title">PulsarNav AI Navigation Report</h1>
              <p style="margin: 5px 0 0 0; font-size: 13px; color: #64748b;">Autonomous X-ray Pulsar Deep Space Navigation Framework</p>
            </div>
            <div style="text-align: right;">
              <button onclick="window.print()" class="no-print" style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">Print Report</button>
            </div>
          </div>
          
          <div class="meta-grid">
            <div class="meta-card">
              <h3>Simulation Configuration</h3>
              <p>Algorithm: <strong>${result.config.algorithm === "LS" ? "Gauss-Jordan Least Squares (4D)" : result.config.algorithm === "WLS" ? "Weighted Least Squares (4D)" : "Extended Kalman Filter (8-State)"}</strong></p>
              <p>Spacecraft Region: <strong>${result.config.region === "earth_orbit" ? "Earth Orbit (LEO/GEO)" : result.config.region === "earth_moon" ? "Earth-Moon Space" : result.config.region === "interplanetary" ? "Interplanetary Transfer (Heliocentric)" : "Deep Space (Heliospheric)"}</strong></p>
              <p>Monte Carlo Trials: <strong>${result.config.trials}</strong></p>
              <p>Timing Noise level: <strong>${result.config.noiseNs} ns</strong></p>
            </div>
            <div class="meta-card">
              <h3>Telemetry Details</h3>
              <p>Active Pulsars: <strong>${result.pulsars.join(", ")}</strong></p>
              <p>Simulation MJD Epoch: <strong>58000.0</strong></p>
              <p>Report Timestamp: <strong>${timestamp}</strong></p>
              <p>Status: <strong style="color: #15803d;">Nominal (Simulation complete)</strong></p>
            </div>
          </div>
          
          <h2 style="font-size: 18px; font-weight: 600; color: #1e3a8a; margin-bottom: 15px;">Summary Navigation Metrics</h2>
          <div class="stats-grid">
            <div class="stat-box">
              <div class="stat-val">${summary.meanErrorKm.toFixed(4)} km</div>
              <div class="stat-label">Mean Position Error</div>
            </div>
            <div class="stat-box">
              <div class="stat-val">${summary.medianErrorKm.toFixed(4)} km</div>
              <div class="stat-label">Median Position Error</div>
            </div>
            <div class="stat-box">
              <div class="stat-val">${summary.p95ErrorKm.toFixed(4)} km</div>
              <div class="stat-label">95% Confidence Bound</div>
            </div>
            <div class="stat-box">
              <div class="stat-val">${summary.maxErrorKm.toFixed(4)} km</div>
              <div class="stat-label">Maximum Error</div>
            </div>
          </div>
          
          <div class="charts-section">
            ${errorChartSvg ? `
            <div class="chart-container">
              <div class="chart-title">Position Error vs. Timing Noise</div>
              <div class="chart-svg">${errorChartSvg}</div>
            </div>` : ""}
            
            ${distChartSvg ? `
            <div class="chart-container">
              <div class="chart-title">Position Error Distribution</div>
              <div class="chart-svg">${distChartSvg}</div>
            </div>` : ""}
          </div>
          
          <div class="table-container">
            <h2 style="font-size: 18px; font-weight: 600; color: #1e3a8a; margin-bottom: 10px;">First 15 Simulation Trial Details</h2>
            <table>
              <thead>
                <tr>
                  <th>Trial #</th>
                  <th>True Position ECI [X, Y, Z] (km)</th>
                  <th>Estimated Position ECI [X, Y, Z] (km)</th>
                  <th>Position Error (km)</th>
                </tr>
              </thead>
              <tbody>
                ${result.rawTrials.slice(0, 15).map((t: any) => `
                  <tr>
                    <td>${t.trial}</td>
                    <td>[${t.truePosition[0].toFixed(2)}, ${t.truePosition[1].toFixed(2)}, ${t.truePosition[2].toFixed(2)}]</td>
                    <td>[${t.estimated[0].toFixed(2)}, ${t.estimated[1].toFixed(2)}, ${t.estimated[2].toFixed(2)}]</td>
                    <td style="font-weight: 600; color: ${t.errorKm > 10.0 ? '#b91c1c' : '#1e3a8a'}">${t.errorKm.toFixed(4)} km</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
          
          <div class="footer">
            <p>PulsarNav AI • Developed in accordance with "Navigation in Space by X-ray Pulsars" (Emadzadeh & Speyer, Springer, 2011)</p>
          </div>
          <script>
            window.onload = function() {
              document.querySelectorAll("svg").forEach(svg => {
                svg.style.backgroundColor = "transparent";
                svg.style.color = "#0f172a";
                svg.querySelectorAll("text").forEach(t => t.style.fill = "#0f172a");
                svg.querySelectorAll("path, line").forEach(p => {
                  if (p.getAttribute("stroke") === "rgba(148,163,184,0.14)") {
                    p.setAttribute("stroke", "#e2e8f0");
                  }
                });
              });
              setTimeout(() => { window.print(); }, 500);
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  return (
    <main className="min-h-screen bg-radial-space text-text">
      <div className="flex">
        <aside
          className={cn(
            "sticky top-0 hidden h-screen shrink-0 border-r border-cyan-300/10 bg-slate-950/70 p-3 backdrop-blur-xl transition-all md:block",
            collapsed ? "w-[76px]" : "w-72",
          )}
        >
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-400/10 text-primary shadow-glow">
                <Radar className="h-5 w-5" />
              </div>
              {!collapsed && <span className="font-semibold tracking-wide">PulsarNav AI</span>}
            </div>
            <button onClick={() => setCollapsed((value) => !value)} className="rounded-md p-2 text-slate-400 hover:bg-slate-800">
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>
          <div className="space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActive(item.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-slate-300 transition hover:bg-cyan-400/10 hover:text-white",
                  active === item.id && "bg-cyan-400/15 text-cyan-100 shadow-glow",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && item.label}
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-cyan-300/10 bg-slate-950/70 px-4 py-4 backdrop-blur-xl md:px-7">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button className="rounded-md p-2 text-slate-300 hover:bg-slate-800 md:hidden">
                  <Menu className="h-5 w-5" />
                </button>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-400/10 text-primary">
                  <ActiveIcon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-cyan-200">Mission Control</p>
                  <h1 className="text-xl font-semibold">{navItems.find((item) => item.id === active)?.label}</h1>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="border-success/30 bg-success/10 text-green-200">Live Telemetry</Badge>
                <Button onClick={exportToCSV} className="h-9 px-3 text-xs bg-slate-950/50 hover:bg-cyan-400/10 border-cyan-300/20">
                  <Download className="h-3.5 w-3.5" /> CSV
                </Button>
                <Button onClick={exportToPDF} className="h-9 px-3 text-xs bg-slate-950/50 hover:bg-cyan-400/10 border-cyan-300/20">
                  <Download className="h-3.5 w-3.5" /> PDF
                </Button>
                <Button onClick={exportThreeJSCanvas} className="h-9 px-3 text-xs bg-slate-950/50 hover:bg-cyan-400/10 border-cyan-300/20">
                  <Download className="h-3.5 w-3.5" /> PNG
                </Button>
              </div>
            </div>
          </header>
          <div className="p-4 md:p-7">
            {active === "dashboard" && <DashboardHome />}
            {active === "catalog" && <CatalogPage />}
            {active === "toa" && <ToaPage />}
            {active === "simulator" && (
              <SimulatorPage
                trials={trials}
                setTrials={setTrials}
                pulsars={pulsars}
                setPulsars={setPulsars}
                noise={noise}
                setNoise={setNoise}
                region={region}
                setRegion={setRegion}
                algorithm={algorithm}
                setAlgorithm={setAlgorithm}
                loading={loading}
                result={result}
                runSimulation={runSimulation}
              />
            )}
            {active === "lab" && (
              <NavigationLabPage
                trials={trials}
                setTrials={setTrials}
                pulsars={pulsars}
                setPulsars={setPulsars}
                noise={noise}
                setNoise={setNoise}
                region={region}
                setRegion={setRegion}
                algorithm={algorithm}
                setAlgorithm={setAlgorithm}
                loading={loading}
                result={result}
                errorMsg={errorMsg}
                runSimulation={runSimulation}
              />
            )}
            {active === "comparison" && <NavigationComparison />}
            {active === "selection" && <SelectionPage />}
            {active === "errors" && (
              <ErrorAnalysisPage
                result={result}
                loading={loading}
                exportCSV={exportToCSV}
                exportPDF={exportToPDF}
                exportPNG={exportThreeJSCanvas}
              />
            )}
            {active === "ai" && <AiInsightsPage />}
            {active === "space" && (
              <SpaceViewPage
                result={result}
                loading={loading}
              />
            )}
            {active === "trajectory" && (
              <TrajectoryVisualization
                result={result}
                loading={loading}
              />
            )}
            {active === "settings" && <SettingsPage />}
          </div>
        </section>
      </div>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background p-8 text-text">Loading mission console...</div>}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardHome() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <Panel key={kpi.label}>
            <p className="text-sm text-slate-400">{kpi.label}</p>
            <div className="mt-3 flex items-end justify-between">
              <span className="text-3xl font-semibold">{kpi.value}</span>
              <Badge>{kpi.delta}</Badge>
            </div>
          </Panel>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Panel>
          <SectionTitle title="Pulsar Distribution" action="Interactive sky map" />
          <SkyMap />
        </Panel>
        <Panel>
          <SectionTitle title="Navigation Accuracy" action="WLS telemetry" />
          <AccuracyAreaChart />
        </Panel>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        <TopPulsarsTable />
        <MissionLogs />
      </div>
    </div>
  );
}

function SectionTitle({ title, action }: { title: string; action?: string }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {action && <span className="text-xs text-cyan-200">{action}</span>}
    </div>
  );
}

function SkyMap() {
  return (
    <div className="relative h-[310px] overflow-hidden rounded-lg border border-slate-700/70 bg-slate-950/50 mission-grid">
      {topPulsars.map((pulsar) => (
        <button
          key={pulsar.name}
          className="absolute rounded-full bg-primary shadow-[0_0_18px_rgba(0,191,255,0.8)]"
          style={{ left: `${(pulsar.ra / 360) * 92 + 4}%`, top: `${((90 - pulsar.dec) / 180) * 82 + 8}%`, width: 8, height: 8 }}
          title={pulsar.name}
        />
      ))}
      <div className="absolute inset-x-0 top-1/2 border-t border-cyan-200/20" />
      <div className="absolute bottom-3 left-4 text-xs text-slate-400">RA/DEC projection • Top ranked navigation pulsars highlighted</div>
    </div>
  );
}

function TopPulsarsTable() {
  return (
    <Panel>
      <SectionTitle title="Top Ranked Pulsars" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="text-left text-slate-400">
            <tr>
              <th className="py-2">Name</th>
              <th>Rank</th>
              <th>Timing Stability</th>
              <th>Navigation Score</th>
              <th>Navigation Accuracy</th>
            </tr>
          </thead>
          <tbody>
            {topPulsars.slice(0, 6).map((pulsar) => (
              <tr key={pulsar.name} className="border-t border-slate-800">
                <td className="py-3 font-medium text-cyan-100">{pulsar.name}</td>
                <td>{pulsar.rank}</td>
                <td>{pulsar.stability}%</td>
                <td>{pulsar.score.toFixed(1)}</td>
                <td>{pulsar.accuracy.toFixed(3)} km</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function MissionLogs() {
  return (
    <Panel>
      <SectionTitle title="Recent Simulations" />
      <div className="space-y-3">
        {logs.map((log) => (
          <div key={log.time} className="rounded-md border border-slate-700/70 bg-slate-950/40 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-slate-400">{log.time}</span>
              <Badge className={log.status === "Review" ? "border-warning/40 bg-warning/10 text-amber-200" : "border-success/40 bg-success/10 text-green-200"}>{log.status}</Badge>
            </div>
            <p className="mt-2 text-sm">{log.event}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function CatalogPage() {
  const [selected, setSelected] = useState(topPulsars[0]);
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <Panel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="relative min-w-64 flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input className="w-full rounded-md border border-slate-700 bg-slate-950/70 py-2 pl-9 pr-3 text-sm" placeholder="Search pulsar catalog" />
          </div>
          <Button><SlidersHorizontal className="h-4 w-4" /> Filters</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-slate-400">
              <tr><th className="py-2">Pulsar Name</th><th>RA</th><th>DEC</th><th>Frequency</th><th>Period</th><th>Timing Stability</th><th>Navigation Rank</th></tr>
            </thead>
            <tbody>
              {topPulsars.map((pulsar) => (
                <tr key={pulsar.name} onClick={() => setSelected(pulsar)} className="cursor-pointer border-t border-slate-800 hover:bg-cyan-400/5">
                  <td className="py-3 font-medium text-cyan-100">{pulsar.name}</td>
                  <td>{pulsar.ra.toFixed(2)}</td><td>{pulsar.dec.toFixed(2)}</td><td>{pulsar.freq.toFixed(1)} Hz</td><td>{pulsar.period.toFixed(2)} ms</td><td>{pulsar.stability}%</td><td>{pulsar.rank}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel>
        <SectionTitle title="Pulsar Profile" action={selected.name} />
        <div className="space-y-4 text-sm">
          {[
            ["Coordinates", `${selected.ra.toFixed(2)} RA, ${selected.dec.toFixed(2)} DEC`],
            ["Sky Position", "Northern ecliptic corridor"],
            ["Timing Data", `${selected.stability}% stability index`],
            ["Historical Observations", "12.5-year narrowband release"],
            ["Navigation Score", `${selected.score.toFixed(1)} / 100`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md bg-slate-950/50 p-3">
              <p className="text-slate-400">{label}</p>
              <p className="mt-1 font-medium">{value}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function ToaPage() {
  return (
    <div className="space-y-5">
      <Panel>
        <SectionTitle title="Observation Table" action="415,122 parsed TOAs" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-slate-400"><tr><th className="py-2">Pulsar</th><th>MJD</th><th>Frequency</th><th>TOA Error</th><th>Observatory</th></tr></thead>
            <tbody>{toaRows.map((row) => <tr key={`${row.pulsar}-${row.mjd}`} className="border-t border-slate-800"><td className="py-3 text-cyan-100">{row.pulsar}</td><td>{row.mjd}</td><td>{row.frequency} MHz</td><td>{row.error} us</td><td>{row.observatory}</td></tr>)}</tbody>
          </table>
        </div>
      </Panel>
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel><SectionTitle title="TOA Error Distribution" /><ErrorLineChart /></Panel>
        <Panel><SectionTitle title="Observation Frequency" /><AccuracyAreaChart /></Panel>
        <Panel><SectionTitle title="Timing Residuals" /><Skeleton className="h-[230px]" /><p className="mt-3 text-sm text-slate-400">Residual stream ready for timing-model integration.</p></Panel>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Interactive Navigation Simulator View
// -------------------------------------------------------------
interface SimulatorPageProps {
  trials: number;
  setTrials: (t: number) => void;
  pulsars: number;
  setPulsars: (p: number) => void;
  noise: number;
  setNoise: (n: number) => void;
  region: string;
  setRegion: (r: string) => void;
  algorithm: string;
  setAlgorithm: (a: string) => void;
  loading: boolean;
  result: NavigationLabResult | null;
  runSimulation: () => void;
}

function SimulatorPage({
  trials,
  setTrials,
  pulsars,
  setPulsars,
  noise,
  setNoise,
  region,
  setRegion,
  algorithm,
  setAlgorithm,
  loading,
  result,
  runSimulation,
}: SimulatorPageProps) {
  return (
    <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
      <Panel>
        <SectionTitle title="Simulation Controls" action="Interactive parameters" />
        
        <label className="mb-4 block">
          <span className="text-sm text-slate-400">Navigation Algorithm</span>
          <select
            value={algorithm}
            onChange={(e) => setAlgorithm(e.target.value)}
            className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
          >
            <option value="LS">Gauss-Jordan Least Squares (4D)</option>
            <option value="WLS">Weighted Least Squares (4D)</option>
            <option value="EKF">Extended Kalman Filter (8-State)</option>
          </select>
        </label>

        <label className="mb-4 block">
          <span className="text-sm text-slate-400">Spacecraft Region</span>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
          >
            <option value="earth_orbit">Earth Orbit</option>
            <option value="earth_moon">Earth-Moon space</option>
            <option value="deep_space">Deep space</option>
            <option value="interplanetary">Interplanetary Transfer</option>
          </select>
        </label>

        <label className="mb-4 block">
          <span className="text-sm text-slate-400">Number of Pulsars</span>
          <input
            type="range"
            min={4}
            max={8}
            value={pulsars}
            onChange={(e) => setPulsars(Number(e.target.value))}
            className="mt-3 w-full"
          />
          <div className="mt-1 text-sm text-cyan-100">{pulsars} pulsars active</div>
        </label>

        <label className="mb-4 block">
          <span className="text-sm text-slate-400">Timing Noise level</span>
          <select
            value={noise}
            onChange={(e) => setNoise(Number(e.target.value))}
            className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
          >
            <option value={10}>10 ns (Research grade)</option>
            <option value={50}>50 ns (Highly stable)</option>
            <option value={100}>100 ns (Standard XNAV)</option>
            <option value={500}>500 ns (Coarse TOA)</option>
            <option value={1000}>1000 ns (High noise)</option>
          </select>
        </label>

        <label className="mb-5 block">
          <span className="text-sm text-slate-400">Monte Carlo Runs / Steps</span>
          <input
            type="number"
            min={10}
            max={5000}
            step={10}
            value={trials}
            onChange={(e) => setTrials(Number(e.target.value))}
            className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
          />
        </label>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button onClick={runSimulation} disabled={loading} className="bg-success/20 text-green-100 hover:bg-success/30">
            <Play className="h-4 w-4" /> {loading ? "Running..." : "Start"}
          </Button>
          <Button onClick={() => {
            setTrials(1000);
            setPulsars(6);
            setNoise(100);
            setRegion("earth_moon");
            setAlgorithm("WLS");
          }}>
            <RefreshCcw className="h-4 w-4" /> Reset
          </Button>
        </div>
      </Panel>
      
      <Panel className="p-0 flex flex-col h-full min-h-[500px]">
        <div className="border-b border-slate-800 p-5 flex justify-between items-center">
          <SectionTitle title="3D Space Visualization" action="Active 3D scene (Rotate • Zoom • Pan)" />
          <Badge className="border-primary/30 bg-primary/10 text-cyan-200">
            {region === "earth_orbit" ? "Earth-Centered ECI" : region === "earth_moon" ? "Cislunar Frame" : region === "interplanetary" ? "Heliocentric SSB" : "Heliospheric"}
          </Badge>
        </div>
        <div className="flex-1 min-h-[400px] relative">
          <SpaceScene result={result} loading={loading} />
        </div>
      </Panel>
    </div>
  );
}

// -------------------------------------------------------------
// Interactive Navigation Lab Page
// -------------------------------------------------------------
interface NavigationLabPageProps {
  trials: number;
  setTrials: (t: number) => void;
  pulsars: number;
  setPulsars: (p: number) => void;
  noise: number;
  setNoise: (n: number) => void;
  region: string;
  setRegion: (r: string) => void;
  algorithm: string;
  setAlgorithm: (a: string) => void;
  loading: boolean;
  result: NavigationLabResult | null;
  errorMsg: string | null;
  runSimulation: () => void;
}

function NavigationLabPage({
  trials,
  setTrials,
  pulsars,
  setPulsars,
  noise,
  setNoise,
  region,
  setRegion,
  algorithm,
  setAlgorithm,
  loading,
  result,
  errorMsg,
  runSimulation,
}: NavigationLabPageProps) {
  const maxBin = Math.max(...(result?.distribution.map((item) => item.count) ?? [1]));

  return (
    <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
      <Panel>
        <SectionTitle title="Navigation Lab Controls" action="Monte Carlo engine" />
        
        <label className="mb-4 block">
          <span className="text-sm text-slate-400">Navigation Algorithm</span>
          <select
            value={algorithm}
            onChange={(event) => setAlgorithm(event.target.value)}
            className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
          >
            <option value="LS">Gauss-Jordan Least Squares (4D)</option>
            <option value="WLS">Weighted Least Squares (4D)</option>
            <option value="EKF">Extended Kalman Filter (8-State)</option>
          </select>
        </label>

        <label className="mb-4 block">
          <span className="text-sm text-slate-400">Monte Carlo Trials</span>
          <input
            type="number"
            min={100}
            max={5000}
            step={100}
            value={trials}
            onChange={(event) => setTrials(Number(event.target.value))}
            className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
          />
        </label>

        <label className="mb-4 block">
          <span className="text-sm text-slate-400">Number of Pulsars</span>
          <input
            type="range"
            min={4}
            max={8}
            value={pulsars}
            onChange={(event) => setPulsars(Number(event.target.value))}
            className="mt-3 w-full"
          />
          <div className="mt-1 text-sm text-cyan-100">{pulsars} pulsars</div>
        </label>

        <label className="mb-4 block">
          <span className="text-sm text-slate-400">Timing Noise</span>
          <select
            value={noise}
            onChange={(event) => setNoise(Number(event.target.value))}
            className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
          >
            {[10, 50, 100, 500, 1000].map((value) => (
              <option key={value} value={value}>{value} ns</option>
            ))}
          </select>
        </label>

        <label className="mb-5 block">
          <span className="text-sm text-slate-400">Spacecraft Region</span>
          <select
            value={region}
            onChange={(event) => setRegion(event.target.value)}
            className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
          >
            <option value="earth_orbit">Earth orbit</option>
            <option value="earth_moon">Earth-Moon space</option>
            <option value="deep_space">Deep space</option>
            <option value="interplanetary">Interplanetary Transfer</option>
          </select>
        </label>

        <Button onClick={runSimulation} disabled={loading} className="w-full bg-primary text-slate-950 hover:bg-secondary">
          <Play className="h-4 w-4" />
          {loading ? "Running..." : "Run Simulation"}
        </Button>

        {errorMsg && (
          <div className="mt-4 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Execution Error</p>
              <p className="mt-0.5 text-xs text-rose-300">{errorMsg}</p>
            </div>
          </div>
        )}

        <div className="mt-5 rounded-md border border-cyan-300/20 bg-cyan-300/10 p-3 text-sm text-cyan-100 font-mono">
          API: /api/navigation-lab
        </div>
      </Panel>

      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Mean Error", result?.summary.meanErrorKm],
            ["Median Error", result?.summary.medianErrorKm],
            ["95% Error", result?.summary.p95ErrorKm],
            ["Max Error", result?.summary.maxErrorKm],
          ].map(([label, value]) => (
            <Panel key={label as string}>
              <p className="text-sm text-slate-400">{label}</p>
              {loading || value === undefined ? (
                <Skeleton className="mt-4 h-9" />
              ) : (
                <p className="mt-3 text-3xl font-semibold text-cyan-100">{Number(value).toFixed(4)} km</p>
              )}
            </Panel>
          ))}
        </div>
        
        <Panel id="dist-chart-panel">
          <SectionTitle title="Position Error Distribution" action={`${result?.config.trials ?? trials} trials`} />
          {loading ? (
            <Skeleton className="h-[320px] w-full" />
          ) : (
            <div className="flex h-[320px] items-end gap-2 rounded-lg border border-slate-700/70 bg-slate-950/50 p-4">
              {(result?.distribution ?? Array.from({ length: 16 }, (_, index) => ({ bin: String(index), count: 0 }))).map((bin) => (
                <div key={bin.bin} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <div
                    className="w-full rounded-t bg-gradient-to-t from-cyan-500 to-sky-200 transition-all duration-500"
                    style={{ height: `${Math.max(4, (bin.count / maxBin) * 260)}px` }}
                    title={`${bin.bin} km: ${bin.count} trials`}
                  />
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel>
          <SectionTitle title="Selected Pulsar Geometry" action={`${pulsars}-source navigation solution`} />
          <div className="flex flex-wrap gap-2">
            {(result?.pulsars ?? topPulsars.slice(0, pulsars).map((item) => item.name)).map((name) => (
              <Badge key={name} className="border-primary/30 bg-primary/10 text-cyan-100">{name}</Badge>
            ))}
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-400">
            The lab generates synthetic pulsar arrival times at the true spacecraft position $r$, adds noise and clock parameters,
            then reconstructs ECI positions using the chosen solver. Metric calculations are computed as Euclidean distances
            between the true positions and recovered solutions.
          </p>
        </Panel>
      </div>
    </div>
  );
}

function Control({ label, value }: { label: string; value: string }) {
  return (
    <label className="mb-4 block">
      <span className="text-sm text-slate-400">{label}</span>
      <div className="mt-2 rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm">{value}</div>
    </label>
  );
}

function SelectionPage() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {topPulsars.slice(0, 4).map((pulsar) => (
          <Panel key={pulsar.name}>
            <div className="flex items-center justify-between"><h3 className="font-semibold text-cyan-100">{pulsar.name}</h3><Badge>Rank {pulsar.rank}</Badge></div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-300">
              <span>Visibility {90 - pulsar.rank}%</span><span>Stability {pulsar.stability}%</span><span>Distance far-field</span><span>Score {pulsar.score}</span>
            </div>
          </Panel>
        ))}
      </div>
      <Panel>
        <SectionTitle title="Optimization Result" action="Geometry DOP minimization" />
        <div className="grid gap-4 md:grid-cols-3">
          {["Best 4 Pulsars", "Best 5 Pulsars", "Best 6 Pulsars"].map((title, index) => (
            <div key={title} className="rounded-md border border-slate-700 bg-slate-950/50 p-4">
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-slate-400">{topPulsars.slice(0, 4 + index).map((p) => p.name).join(", ")}</p>
              <p className="mt-4 text-2xl font-semibold text-primary">{(0.083 / (index + 1)).toFixed(3)} km</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

interface ErrorAnalysisPageProps {
  result: NavigationLabResult | null;
  loading: boolean;
  exportCSV: () => void;
  exportPDF: () => void;
  exportPNG: () => void;
}

function ErrorAnalysisPage({ result, loading, exportCSV, exportPDF, exportPNG }: ErrorAnalysisPageProps) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Button onClick={exportPNG} className="bg-slate-950/50 hover:bg-cyan-400/10 border-cyan-300/20"><Download className="h-4 w-4" /> Export PNG</Button>
        <Button onClick={exportPDF} className="bg-slate-950/50 hover:bg-cyan-400/10 border-cyan-300/20"><Download className="h-4 w-4" /> Export PDF</Button>
        <Button onClick={exportCSV} className="bg-slate-950/50 hover:bg-cyan-400/10 border-cyan-300/20"><Download className="h-4 w-4" /> Export CSV</Button>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel id="error-chart-panel"><SectionTitle title="Position Error vs Trial Step" /><ErrorLineChart result={result} /></Panel>
        <Panel><SectionTitle title="Cumulative Probability (Accuracy Curve)" /><AccuracyAreaChart result={result} /></Panel>
        <Panel><SectionTitle title="Monte Carlo Heatmap" /><HeatmapChart result={result} /></Panel>
        <Panel>
          <SectionTitle title="Confidence Ellipses" />
          <div className="relative h-[300px] rounded-lg border border-slate-700 bg-slate-950/50 overflow-hidden">
            <div className="absolute left-1/2 top-1/2 h-40 w-64 -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-primary/70 animate-pulse" />
            <div className="absolute left-1/2 top-1/2 h-24 w-40 -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-success/70" />
            <div className="absolute bottom-3 left-4 text-xs text-slate-400">1-Sigma (green) and 3-Sigma (cyan) position error covariance bounds</div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function AiInsightsPage() {
  const insights = [
    ["Recommended Pulsars", "J0613-0200, J1713+0747, J1909-3744"],
    ["Navigation Risk Score", "Low • 0.12"],
    ["Noise Prediction", "100 ns stable window"],
    ["Future Accuracy Forecast", "31 m with 8-pulsar solution"],
  ];
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {insights.map(([title, value]) => <Panel key={title}><BrainCircuit className="mb-3 h-5 w-5 text-primary" /><p className="text-sm text-slate-400">{title}</p><p className="mt-2 font-semibold">{value}</p></Panel>)}
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel><SectionTitle title="Feature Importance" /><AccuracyAreaChart /></Panel>
        <Panel><SectionTitle title="Model Performance" /><ErrorLineChart /></Panel>
        <Panel><SectionTitle title="Confusion Matrix" /><HeatmapChart /></Panel>
      </div>
    </div>
  );
}

interface SpaceViewPageProps {
  result: NavigationLabResult | null;
  loading: boolean;
}

function SpaceViewPage({ result, loading }: SpaceViewPageProps) {
  return (
    <Panel className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-5">
        <SectionTitle title="Immersive 3D Space View" action="Rotate • Zoom • Pan • Follow Spacecraft" />
        <div className="flex gap-2">
          <Badge className="border-primary/30 bg-primary/10 text-cyan-200">
            ECI Frame (J2000) • Orbit Track Enabled
          </Badge>
        </div>
      </div>
      <div className="h-[calc(100vh-220px)] min-h-[500px] relative w-full">
        <SpaceScene full result={result} loading={loading} />
      </div>
    </Panel>
  );
}

function SettingsPage() {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {["Theme", "Simulation Defaults", "Data Source", "Units", "Export Preferences", "Accessibility"].map((title) => (
        <Panel key={title}>
          <SectionTitle title={title} />
          <div className="space-y-3 text-sm">
            <label className="flex items-center justify-between rounded-md bg-slate-950/50 p-3"><span>High contrast mode</span><input type="checkbox" /></label>
            <label className="flex items-center justify-between rounded-md bg-slate-950/50 p-3"><span>Mission-control alerts</span><input type="checkbox" defaultChecked /></label>
          </div>
        </Panel>
      ))}
      <Panel className="lg:col-span-2">
        <div className="flex items-start gap-3 text-amber-100">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-warning" />
          <div><h3 className="font-semibold">Export System Ready</h3><p className="mt-1 text-sm text-slate-300">PDF reports, CSV results, and PNG charts are configured as dashboard actions.</p></div>
        </div>
      </Panel>
    </div>
  );
}
