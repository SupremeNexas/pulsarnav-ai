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

export function ErrorLineChart({ result }: { result?: any }) {
  const data = result ? result.samples.map((t: any) => ({
    name: result.config.algorithm === "EKF" ? `${t.trial * 10}s` : `T ${t.trial}`,
    error: t.errorKm
  })) : errorCurve;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid stroke="rgba(148,163,184,0.14)" />
        <XAxis dataKey="name" stroke="#94A3B8" tick={chartText} />
        <YAxis stroke="#94A3B8" tick={chartText} />
        <Tooltip contentStyle={{ background: "#0F172A", border: "1px solid rgba(56,189,248,.25)", color: "#F8FAFC" }} />
        <Line type="monotone" dataKey="error" stroke="#00BFFF" strokeWidth={2} dot={!result || result.config.algorithm !== "EKF"} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function AccuracyAreaChart({ result }: { result?: any }) {
  let data = countCurve;
  
  if (result) {
    const sortedErrors = [...result.rawTrials].map((t: any) => t.errorKm).sort((a,b) => a - b);
    // Downsample to max 50 points to prevent chart lag
    data = sortedErrors.map((err, index) => ({
      count: err.toFixed(3),
      error: ((index + 1) / sortedErrors.length) * 100
    })).filter((_, idx, arr) => idx % Math.max(1, Math.floor(arr.length / 50)) === 0);
  }

  return (
    <ResponsiveContainer width="100%" height={230}>
      <AreaChart data={data}>
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
        <Area dataKey="error" stroke="#00BFFF" fill="url(#accuracy)" strokeWidth={2} name="Probability" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function HeatmapChart({ result }: { result?: any }) {
  // Construct dynamic heatmap z-scores if result is active, or use static values
  const zData = result ? [
    [result.summary.medianErrorKm * 0.4, result.summary.medianErrorKm * 0.3, result.summary.medianErrorKm * 0.2, result.summary.medianErrorKm * 0.15],
    [result.summary.medianErrorKm * 1.5, result.summary.medianErrorKm * 1.0, result.summary.medianErrorKm * 0.8, result.summary.medianErrorKm * 0.6],
    [result.summary.medianErrorKm * 3.5, result.summary.medianErrorKm * 2.5, result.summary.medianErrorKm * 1.8, result.summary.medianErrorKm * 1.2],
  ] : [
    [0.08, 0.06, 0.04, 0.03],
    [0.41, 0.28, 0.21, 0.15],
    [0.83, 0.57, 0.43, 0.31],
  ];

  const heatmapData = [
    {
      z: zData,
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
