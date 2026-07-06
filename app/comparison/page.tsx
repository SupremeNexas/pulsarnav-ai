"use client";

import { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import type { TooltipProps } from "recharts";

/*
 * Comparison Dashboard — DESIGN.md specification:
 *
 * CRITICAL VIOLATIONS TO FIX FROM ORIGINAL:
 * ✗ Red line (#ef4444) for DSN → achromatic: use #ffffff (paper)
 * ✗ Green line (#22c55e) for Hybrid → use #ababab (ash)
 * ✗ Green/Red icons → use periwinkle for XNAV icon only
 * ✗ Red/green text in matrix → use paper/steel/ash only
 * ✗ rounded-2xl cards → 0px radius
 *
 * Engineering plot rules per DESIGN.md:
 * - Thin lines (strokeWidth: 1)
 * - Minimal grid (dashed, very subtle)
 * - Monochrome: paper=DSN, ash=XNAV, periwinkle=Hybrid (annotation)
 * - No colorful legends
 */

const T = {
  void:       "#000000",
  carbon:     "#1c1c1c",
  graphite:   "#4d4d4d",
  steel:      "#808080",
  ash:        "#ababab",
  paper:      "#ffffff",
  periwinkle: "#7089ba",
  pWash:      "rgba(112,137,186,0.06)",
};

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: T.carbon,
      border: `1px dashed ${T.graphite}`,
      padding: "10px 14px",
      fontFamily: "var(--font-mono)",
      fontSize: "11px",
      minWidth: "160px",
    }}>
      <div style={{ color: T.steel, marginBottom: "8px", fontSize: "10px" }}>Epoch {label}</div>
      {payload.map((entry) => (
        <div key={entry.name} style={{ display: "flex", justifyContent: "space-between", gap: "16px", marginBottom: "4px" }}>
          <span style={{ color: entry.color }}>{entry.name}</span>
          <span style={{ color: T.paper }}>{Number(entry.value ?? 0).toFixed(1)} km</span>
        </div>
      ))}
    </div>
  );
}

export default function ComparisonPage() {
  const [orbitRegion, setOrbitRegion] = useState("Cislunar Transfer");

  const comparisonData = useMemo(() => {
    const data = [];
    let dsnError = 15, xnavError = 300, hybridError = 300;
    const regionFactor = orbitRegion === "Interplanetary Cruise" ? 1.35 : orbitRegion === "Lagrange Halo Orbit" ? 1.15 : 1;
    for (let step = 0; step < 100; step++) {
      const isVisible = (step % 30) < 18;
      dsnError = isVisible
        ? Math.max(5, dsnError - 2 + Math.sin(step * 1.7) * 1)
        : dsnError + 8 + Math.sin(step * 0.8) * 2;
      xnavError = (80 + Math.exp(-0.08 * step) * 220 + Math.cos(step * 0.4) * 7.5) * regionFactor;
      hybridError = step < 20
        ? 15 + Math.exp(-0.15 * step) * 285 + Math.sin(step * 0.6) * 2.5
        : isVisible
          ? 6 + Math.cos(step * 0.5)
          : 12 + Math.sin(step * 0.5) * 1.5;
      data.push({
        epoch: step,
        "DSN":    Math.max(0, dsnError),
        "XNAV":   Math.max(0, xnavError),
        "Hybrid": Math.max(0, hybridError),
      });
    }
    return data;
  }, [orbitRegion]);

  const panel: React.CSSProperties = { background: T.carbon, border: `1px dashed ${T.graphite}`, padding: "20px" };
  const panelLabel: React.CSSProperties = {
    fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 500,
    textTransform: "uppercase" as const, letterSpacing: "0.1em", color: T.periwinkle, marginBottom: "16px",
  };
  const dataRowLabel: React.CSSProperties = {
    fontFamily: "var(--font-mono)", fontSize: "10px", color: T.steel,
    textTransform: "uppercase" as const, letterSpacing: "0.08em",
  };

  const systemInfo = [
    {
      key: "DSN",
      title: "DSN Limitations",
      body: "Ground tracking suffers visibility blockage during Earth rotation. Position uncertainty grows linearly with distance from ground stations during blackout periods.",
    },
    {
      key: "XNAV",
      title: "Autonomous XNAV",
      body: "Provides constant coverage and bounded uncertainty throughout deep space, but requires extended integration times to fold pulsar profiles above noise floor.",
    },
    {
      key: "Hybrid",
      title: "Hybrid EKF Benefits",
      body: "Fuses ground range-rates and pulsar arrival delays inside an EKF, delivering sub-kilometer precision without blackout degradation.",
    },
  ];

  const matrix = [
    {
      label: "Availability",
      dsn: "~60%",
      xnav: "100%",
      hybrid: "100%",
    },
    {
      label: "Ground Dependency",
      dsn: "Mandatory",
      xnav: "None",
      hybrid: "Optional",
    },
    {
      label: "Estimated Drift",
      dsn: "5–150 km/day",
      xnav: "Bounded",
      hybrid: "Bounded",
    },
    {
      label: "Calculation Delay",
      dsn: "Up to 40 min",
      xnav: "Real-time",
      hybrid: "Real-time",
    },
  ];

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "40px 24px 80px" }}>

      {/* ── Page Header ─────────────────────────────────── */}
      <div style={{ borderBottom: `1px dashed ${T.graphite}`, paddingBottom: "24px", marginBottom: "40px" }}>
        <div style={dataRowLabel}>Navigation Comparison Lab</div>
        <h1 style={{
          fontFamily: "var(--font-sans)",
          fontSize: "32px",
          fontWeight: 900,
          lineHeight: 1.2,
          letterSpacing: "-0.32px",
          color: T.paper,
          textTransform: "uppercase",
          marginTop: "6px",
        }}>
          Conventional DSN vs. XNAV
        </h1>
      </div>

      {/* ── 8/4 split ──────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "24px", alignItems: "start" }}>

        {/* ── LEFT: Chart + Summary ──────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* Convergence Plot */}
          <div style={panel}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px", flexWrap: "wrap", gap: "16px" }}>
              <div>
                <div style={panelLabel}>Error Convergence Simulation</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: T.steel }}>
                  Positioning uncertainty (km) over orbital propagation epochs
                </div>
              </div>
              <select
                value={orbitRegion}
                onChange={(e) => setOrbitRegion(e.target.value)}
                style={{
                  background: T.void,
                  border: `1px dashed ${T.graphite}`,
                  padding: "6px 10px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: T.paper,
                  outline: "none",
                  borderRadius: "0",
                  WebkitAppearance: "none",
                  appearance: "none",
                  cursor: "pointer",
                }}
              >
                {["Cislunar Transfer", "Lagrange Halo Orbit", "Interplanetary Cruise"].map((r) => (
                  <option key={r} value={r} style={{ background: T.carbon }}>{r}</option>
                ))}
              </select>
            </div>

            {/* Engineering chart legend — achromatic */}
            <div style={{ display: "flex", gap: "24px", marginBottom: "16px" }}>
              {[
                { name: "DSN",    color: T.paper,      dash: false },
                { name: "XNAV",   color: T.ash,        dash: true  },
                { name: "Hybrid", color: T.periwinkle, dash: false },
              ].map((item) => (
                <div key={item.name} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <svg width="24" height="2" viewBox="0 0 24 2">
                    <line
                      x1="0" y1="1" x2="24" y2="1"
                      stroke={item.color}
                      strokeWidth="1.5"
                      strokeDasharray={item.dash ? "4 3" : "none"}
                    />
                  </svg>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: T.steel, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    {item.name}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ width: "100%", height: "280px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={comparisonData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  {/* Blueprint grid — very subtle horizontal hairlines */}
                  <CartesianGrid vertical={false} stroke={T.carbon} strokeDasharray="2 4"/>
                  <XAxis
                    dataKey="epoch"
                    stroke={T.graphite}
                    tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: T.steel }}
                    axisLine={{ stroke: T.graphite }}
                    tickLine={false}
                    label={{ value: "Epoch", position: "insideBottom", offset: -2, fontFamily: "var(--font-mono)", fontSize: 9, fill: T.steel }}
                  />
                  <YAxis
                    stroke={T.graphite}
                    tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: T.steel }}
                    axisLine={false}
                    tickLine={false}
                    label={{ value: "Error (km)", angle: -90, position: "insideLeft", offset: 8, fontFamily: "var(--font-mono)", fontSize: 9, fill: T.steel }}
                  />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ stroke: T.graphite, strokeDasharray: "3 2", strokeWidth: 1 }}
                  />
                  {/* Achromatic lines — paper, ash, periwinkle (annotation only) */}
                  <Line type="monotone" dataKey="DSN"    stroke={T.paper}      strokeWidth={1}   dot={false} activeDot={{ r: 3, fill: T.paper,      stroke: "none" }}/>
                  <Line type="monotone" dataKey="XNAV"   stroke={T.ash}        strokeWidth={1}   dot={false} activeDot={{ r: 3, fill: T.ash,        stroke: "none" }} strokeDasharray="5 3"/>
                  <Line type="monotone" dataKey="Hybrid" stroke={T.periwinkle} strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: T.periwinkle, stroke: "none" }}/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* System analysis block — text only, no colored icons */}
          <div style={{ ...panel, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "24px" }}>
            {systemInfo.map((item) => (
              <div key={item.key}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.1em", color: T.periwinkle, marginBottom: "8px" }}>
                  {item.title}
                </div>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: "12px", lineHeight: 1.7, color: T.steel }}>
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT: Systems Matrix ──────────────────────── */}
        <div style={panel}>
          <div style={panelLabel}>Systems Matrix</div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
            {/* Header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              borderBottom: `1px dashed ${T.graphite}`,
              paddingBottom: "8px",
              marginBottom: "8px",
            }}>
              {["DSN", "XNAV", "Hybrid"].map((h) => (
                <div key={h} style={{ fontFamily: "var(--font-mono)", fontSize: "9px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.1em", color: T.periwinkle, textAlign: "right" }}>
                  {h}
                </div>
              ))}
            </div>

            {matrix.map((row, i) => (
              <div
                key={row.label}
                style={{
                  paddingTop: "12px",
                  paddingBottom: "12px",
                  borderBottom: i < matrix.length - 1 ? `1px dashed ${T.carbon}` : "none",
                }}
              >
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: T.steel, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>
                  {row.label}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: T.ash, textAlign: "right" }}>{row.dsn}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: T.paper, textAlign: "right" }}>{row.xnav}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: T.paper, textAlign: "right" }}>{row.hybrid}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
