"use client";

import dynamic from "next/dynamic";
import type Plotly from "plotly.js";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { countCurve, errorCurve } from "@/lib/mission-data";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

const chartText = { fill: "#CBD5E1", fontSize: 12 };

export function ErrorLineChart() {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={errorCurve}>
        <CartesianGrid stroke="rgba(148,163,184,0.14)" />
        <XAxis dataKey="noise" stroke="#94A3B8" tick={chartText} label={{ value: "Timing noise (ns)", fill: "#94A3B8", position: "insideBottom", offset: -4 }} />
        <YAxis stroke="#94A3B8" tick={chartText} />
        <Tooltip contentStyle={{ background: "#0F172A", border: "1px solid rgba(56,189,248,.25)", color: "#F8FAFC" }} />
        <Line type="monotone" dataKey="pulsars4" stroke="#F59E0B" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="pulsars6" stroke="#00BFFF" strokeWidth={3} dot />
        <Line type="monotone" dataKey="pulsars8" stroke="#22C55E" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function AccuracyAreaChart() {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <AreaChart data={countCurve}>
        <defs>
          <linearGradient id="accuracy" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#00BFFF" stopOpacity={0.8} />
            <stop offset="95%" stopColor="#00BFFF" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(148,163,184,0.14)" />
        <XAxis dataKey="count" stroke="#94A3B8" tick={chartText} />
        <YAxis stroke="#94A3B8" tick={chartText} />
        <Tooltip contentStyle={{ background: "#0F172A", border: "1px solid rgba(56,189,248,.25)", color: "#F8FAFC" }} />
        <Area dataKey="error" stroke="#00BFFF" fill="url(#accuracy)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function HeatmapChart() {
  const heatmapData = [
    {
      z: [
        [0.08, 0.06, 0.04, 0.03],
        [0.41, 0.28, 0.21, 0.15],
        [0.83, 0.57, 0.43, 0.31],
      ],
      x: ["4", "5", "6", "8"],
      y: ["100 ns", "500 ns", "1 us"],
      type: "heatmap",
      colorscale: [
        [0, "#061826"],
        [0.5, "#00BFFF"],
        [1, "#F59E0B"],
      ],
    },
  ] as unknown as Plotly.Data[];
  const heatmapLayout = {
    autosize: true,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 55, r: 20, t: 20, b: 45 },
    font: { color: "#CBD5E1" },
    xaxis: { title: { text: "Pulsars" } },
    yaxis: { title: { text: "Noise" } },
  } as unknown as Partial<Plotly.Layout>;

  return (
    <div className="h-[300px] overflow-hidden rounded-lg border border-slate-700/70">
      <Plot
        data={heatmapData}
        layout={heatmapLayout}
        config={{ displayModeBar: false, responsive: true }}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
