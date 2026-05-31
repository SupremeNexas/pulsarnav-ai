"use client";

import { Suspense, useMemo, useState } from "react";
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
  Home,
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

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "catalog", label: "Pulsar Catalog", icon: Database },
  { id: "toa", label: "TOA Database", icon: CircleDot },
  { id: "simulator", label: "Navigation Simulator", icon: Rocket },
  { id: "selection", label: "Pulsar Selection", icon: Radar },
  { id: "errors", label: "Error Analysis", icon: BarChart3 },
  { id: "ai", label: "AI Insights", icon: BrainCircuit },
  { id: "space", label: "3D Space View", icon: Sparkles },
  { id: "settings", label: "Settings", icon: Settings },
];

function DashboardContent() {
  const search = useSearchParams();
  const initial = search.get("view") ?? "dashboard";
  const [active, setActive] = useState(initial);
  const [collapsed, setCollapsed] = useState(false);
  const ActiveIcon = navItems.find((item) => item.id === active)?.icon ?? Home;

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
                <Button>
                  <Download className="h-4 w-4" />
                  Export
                </Button>
              </div>
            </div>
          </header>
          <div className="p-4 md:p-7">
            {active === "dashboard" && <DashboardHome />}
            {active === "catalog" && <CatalogPage />}
            {active === "toa" && <ToaPage />}
            {active === "simulator" && <SimulatorPage />}
            {active === "selection" && <SelectionPage />}
            {active === "errors" && <ErrorAnalysisPage />}
            {active === "ai" && <AiInsightsPage />}
            {active === "space" && <SpaceViewPage />}
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

function SimulatorPage() {
  return (
    <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
      <Panel>
        <SectionTitle title="Simulation Controls" />
        <Control label="Number of Pulsars" value="6" />
        <Control label="Noise Level" value="100 ns" />
        <Control label="Navigation Algorithm" value="Weighted Least Squares" />
        <Control label="Spacecraft Region" value="Earth-Moon Space" />
        <Control label="Monte Carlo Runs" value="1000" />
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button className="bg-success/20 text-green-100"><Play className="h-4 w-4" /> Start</Button>
          <Button><Pause className="h-4 w-4" /> Pause</Button>
          <Button><RefreshCcw className="h-4 w-4" /> Reset</Button>
          <Button><FileDown className="h-4 w-4" /> Report</Button>
        </div>
      </Panel>
      <Panel className="p-0">
        <div className="border-b border-slate-800 p-5"><SectionTitle title="3D Space Visualization" action="Earth • Moon • Spacecraft • Pulsar vectors" /></div>
        <SpaceScene />
      </Panel>
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

function ErrorAnalysisPage() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {["PNG", "PDF", "CSV"].map((type) => <Button key={type}><Download className="h-4 w-4" /> Export {type}</Button>)}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel><SectionTitle title="Position Error vs Timing Error" /><ErrorLineChart /></Panel>
        <Panel><SectionTitle title="Position Error vs Number of Pulsars" /><AccuracyAreaChart /></Panel>
        <Panel><SectionTitle title="Monte Carlo Heatmap" /><HeatmapChart /></Panel>
        <Panel><SectionTitle title="Confidence Ellipses" /><div className="relative h-[300px] rounded-lg border border-slate-700 bg-slate-950/50"><div className="absolute left-1/2 top-1/2 h-40 w-64 -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-primary/70" /><div className="absolute left-1/2 top-1/2 h-24 w-40 -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-success/70" /></div></Panel>
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

function SpaceViewPage() {
  return (
    <Panel className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-5">
        <SectionTitle title="Immersive 3D Space View" action="Rotate • Zoom • Pan • Follow Spacecraft" />
        <div className="flex gap-2"><Button>Rotate</Button><Button>Zoom</Button><Button>Pan</Button><Button>Follow</Button></div>
      </div>
      <SpaceScene full />
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
