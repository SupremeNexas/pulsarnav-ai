"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { PULSAR_CATALOGUE } from "@/lib/pulsar-catalogue";
import { useNavigationData } from "@/hooks/use-navigation-data";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { TooltipProps } from "recharts";

/*
 * Mission Dashboard — DESIGN.md specification:
 * - Layout: 3-column (controls | 3D viz | telemetry) inside max-width 1200px
 * - NO rounded cards → 0px border-radius on all panels
 * - NO colored rows → achromatic only, periwinkle for annotations
 * - NO box shadows
 * - Dashed borders throughout
 * - Chart: thin line, minimal grid, monochrome + periwinkle only
 * - Typography: Geist Mono for all data/labels
 */

const SpaceScene = dynamic(
  () => import("@/components/space-scene").then((mod) => mod.SpaceScene),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#000000",
          border: "1px dashed #4d4d4d",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          color: "#808080",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          gap: "12px",
        }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="8" stroke="#7089ba" strokeWidth="1" strokeDasharray="3 2"/>
          <circle cx="10" cy="10" r="4" stroke="#7089ba" strokeWidth="0.75"/>
        </svg>
        Initializing 3D Celestial Engine...
      </div>
    ),
  }
);

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

/* Inline custom tooltip for chart */
function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const value = typeof payload[0].value === "number" ? payload[0].value : Number(payload[0].value ?? 0);
  return (
    <div
      style={{
        background: T.carbon,
        border: `1px dashed ${T.graphite}`,
        padding: "8px 12px",
        fontFamily: "var(--font-mono)",
        fontSize: "11px",
      }}
    >
      <div style={{ color: T.steel, marginBottom: "4px" }}>Epoch {label}</div>
      <div style={{ color: T.paper }}>{value.toFixed(3)} km</div>
    </div>
  );
}

export default function DashboardPage() {
  const [missionType, setMissionType] = useState("LEO");
  const [algorithm, setAlgorithm] = useState("EKF");
  const [measurementNoise, setMeasurementNoise] = useState(250);
  const [selectedPulsars, setSelectedPulsars] = useState<string[]>(
    PULSAR_CATALOGUE.slice(0, 4).map((p) => p.name)
  );

  const config = useMemo(
    () => ({ missionType, algorithm, measurementNoise, selectedPulsars }),
    [missionType, algorithm, measurementNoise, selectedPulsars]
  );

  const {
    simulationData, isLoading, currentFrame, setCurrentFrame,
    isPlaying, setIsPlaying, playbackSpeed, setPlaybackSpeed,
    activeSample, metrics, chartData, triggerSimulation,
  } = useNavigationData(config);

  const togglePulsar = (name: string) => {
    setSelectedPulsars((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]
    );
  };

  const panel: React.CSSProperties = {
    background: T.carbon,
    border: `1px dashed ${T.graphite}`,
    padding: "20px",
  };

  const panelLabel: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "11px",
    fontWeight: 500,
    textTransform: "uppercase" as const,
    letterSpacing: "0.1em",
    color: T.periwinkle,
    marginBottom: "16px",
  };

  const dataRowLabel: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "10px",
    color: T.steel,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
  };

  const dataRowValue: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "12px",
    color: T.paper,
    fontWeight: 500,
  };

  return (
    <div
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "40px 24px 80px",
      }}
    >
      {/* ── Page Header ────────────────────────────────────── */}
      <div
        style={{
          borderBottom: `1px dashed ${T.graphite}`,
          paddingBottom: "24px",
          marginBottom: "40px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={dataRowLabel}>Navigation simulation facility</div>
          <h1
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "32px",
              fontWeight: 900,
              lineHeight: 1.2,
              letterSpacing: "-0.32px",
              color: T.paper,
              textTransform: "uppercase",
              marginTop: "6px",
            }}
          >
            Mission Control
          </h1>
        </div>

        <button
          onClick={triggerSimulation}
          disabled={isLoading}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: T.paper,
            border: `1px solid ${T.paper}`,
            borderRadius: "100px",
            padding: "8px 20px",
            background: "transparent",
            cursor: isLoading ? "not-allowed" : "pointer",
            opacity: isLoading ? 0.4 : 1,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            transition: "background 0.2s ease, color 0.2s ease",
          }}
          onMouseEnter={(e) => {
            if (!isLoading) {
              (e.currentTarget as HTMLElement).style.background = T.paper;
              (e.currentTarget as HTMLElement).style.color = T.void;
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color = T.paper;
          }}
        >
          {isLoading && (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ animation: "spin 1s linear infinite" }}>
              <circle cx="6" cy="6" r="5" stroke={T.steel} strokeWidth="1"/>
              <path d="M6 1 A5 5 0 0 1 11 6" stroke={T.paper} strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          )}
          Re-initialize
        </button>
      </div>

      {/* ── 3-column layout ──────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "260px 1fr 260px",
          gap: "24px",
          alignItems: "start",
        }}
      >

        {/* ── LEFT: Parameter Controls ──────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* Orbit & Algorithm panel */}
          <div style={panel}>
            <div style={panelLabel}>Orbit &amp; Algorithm</div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <div style={{ ...dataRowLabel, marginBottom: "6px" }}>Mission Archetype</div>
                <select
                  value={missionType}
                  onChange={(e) => setMissionType(e.target.value)}
                  style={{
                    width: "100%",
                    background: T.void,
                    border: `1px dashed ${T.graphite}`,
                    padding: "8px 10px",
                    fontFamily: "var(--font-mono)",
                    fontSize: "12px",
                    color: T.paper,
                    outline: "none",
                    borderRadius: "0",
                    WebkitAppearance: "none",
                    appearance: "none",
                    cursor: "pointer",
                  }}
                >
                  {["LEO", "GEO", "Earth-Moon Transfer", "Lunar Orbit", "Lagrange L1/L2 Halo", "Earth-Mars Transfer", "Deep Space Cruise"].map(
                    (t) => <option key={t} value={t} style={{ background: T.carbon }}>{t}</option>
                  )}
                </select>
              </div>

              <div>
                <div style={{ ...dataRowLabel, marginBottom: "6px" }}>Estimation Algorithm</div>
                <select
                  value={algorithm}
                  onChange={(e) => setAlgorithm(e.target.value)}
                  style={{
                    width: "100%",
                    background: T.void,
                    border: `1px dashed ${T.graphite}`,
                    padding: "8px 10px",
                    fontFamily: "var(--font-mono)",
                    fontSize: "12px",
                    color: T.paper,
                    outline: "none",
                    borderRadius: "0",
                    WebkitAppearance: "none",
                    appearance: "none",
                    cursor: "pointer",
                  }}
                >
                  {["EKF", "LS", "WLS"].map(
                    (a) => <option key={a} value={a} style={{ background: T.carbon }}>{a}</option>
                  )}
                </select>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" }}>
                  <span style={dataRowLabel}>Photon Noise Floor</span>
                  <span style={dataRowValue}>{measurementNoise} ns</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="1000"
                  step="50"
                  value={measurementNoise}
                  onChange={(e) => setMeasurementNoise(Number(e.target.value))}
                  style={{ width: "100%", cursor: "pointer" }}
                />
              </div>
            </div>
          </div>

          {/* Tracking Beacons panel */}
          <div style={panel}>
            <div style={panelLabel}>Tracking Beacons</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {PULSAR_CATALOGUE.map((p) => {
                const active = selectedPulsars.includes(p.name);
                return (
                  <button
                    key={p.name}
                    onClick={() => togglePulsar(p.name)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "7px 10px",
                      border: `1px dashed ${active ? T.periwinkle : T.graphite}`,
                      background: active ? T.pWash : "transparent",
                      fontFamily: "var(--font-mono)",
                      fontSize: "11px",
                      color: active ? T.paper : T.steel,
                      borderRadius: "0",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "border-color 0.15s ease, color 0.15s ease, background 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!active) (e.currentTarget as HTMLElement).style.color = T.paper;
                    }}
                    onMouseLeave={(e) => {
                      if (!active) (e.currentTarget as HTMLElement).style.color = T.steel;
                    }}
                  >
                    <span>{p.name}</span>
                    {active && (
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                        <polyline points="1,5.5 4,9 10,1" stroke={T.periwinkle} strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── CENTER: 3D Visualization + Playback ───────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* 3D scene */}
          <div style={{ height: "460px", border: `1px dashed ${T.graphite}` }}>
            <SpaceScene
              missionType={missionType}
              samples={simulationData ? simulationData.samples : []}
              currentFrame={currentFrame}
            />
          </div>

          {/* Playback Controls */}
          <div
            style={{
              ...panel,
              display: "flex",
              alignItems: "center",
              gap: "16px",
              flexWrap: "wrap",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              {/* Play/Pause */}
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                style={{
                  width: "32px",
                  height: "32px",
                  border: `1px dashed ${T.graphite}`,
                  borderRadius: "50%",
                  background: "transparent",
                  color: T.paper,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  flexShrink: 0,
                  transition: "border-color 0.15s ease",
                }}
              >
                {isPlaying ? (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill={T.paper}>
                    <rect x="1" y="1" width="3" height="8"/>
                    <rect x="6" y="1" width="3" height="8"/>
                  </svg>
                ) : (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill={T.paper}>
                    <polygon points="1,1 9,5 1,9"/>
                  </svg>
                )}
              </button>

              {/* Reset */}
              <button
                onClick={() => { setCurrentFrame(0); setIsPlaying(false); }}
                style={{
                  width: "32px",
                  height: "32px",
                  border: `1px dashed ${T.graphite}`,
                  borderRadius: "50%",
                  background: "transparent",
                  color: T.paper,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6 A4 4 0 1 1 6 10" stroke={T.paper} strokeWidth="1.5" strokeLinecap="round"/>
                  <polyline points="2,3 2,6 5,6" stroke={T.paper} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {/* Scrubber */}
              <input
                type="range"
                min="0"
                max={simulationData ? simulationData.samples.length - 1 : 0}
                value={currentFrame}
                onChange={(e) => { setCurrentFrame(Number(e.target.value)); setIsPlaying(false); }}
                style={{ width: "160px", cursor: "pointer" }}
              />

              <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: T.steel }}>
                {currentFrame} / {simulationData ? simulationData.samples.length - 1 : 199}
              </span>
            </div>

            {/* Speed */}
            <div style={{ display: "flex", gap: "4px" }}>
              {[1, 2, 5].map((speed) => (
                <button
                  key={speed}
                  onClick={() => setPlaybackSpeed(speed)}
                  style={{
                    padding: "4px 10px",
                    border: `1px dashed ${playbackSpeed === speed ? T.periwinkle : T.graphite}`,
                    background: playbackSpeed === speed ? T.pWash : "transparent",
                    fontFamily: "var(--font-mono)",
                    fontSize: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: playbackSpeed === speed ? T.paper : T.steel,
                    cursor: "pointer",
                    borderRadius: "0",
                    transition: "border-color 0.15s ease, color 0.15s ease",
                  }}
                >
                  {speed}×
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Telemetry + Convergence Chart ─────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* Position Telemetry */}
          <div style={panel}>
            <div style={panelLabel}>State Vector</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {[
                { label: "Position X", value: activeSample ? activeSample.truePosition[0].toFixed(2) : "—", unit: "km" },
                { label: "Position Y", value: activeSample ? activeSample.truePosition[1].toFixed(2) : "—", unit: "km" },
                { label: "Position Z", value: activeSample ? activeSample.truePosition[2].toFixed(2) : "—", unit: "km" },
              ].map((row) => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={dataRowLabel}>{row.label}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: T.paper }}>
                    {row.value} <span style={{ color: T.steel, fontSize: "10px" }}>{row.unit}</span>
                  </span>
                </div>
              ))}
            </div>

            <div style={{ borderTop: `1px dashed ${T.graphite}`, marginTop: "16px", paddingTop: "16px" }}>
              <div style={dataRowLabel}>Estimation Error</div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "28px",
                  fontWeight: 900,
                  color: T.paper,
                  letterSpacing: "-0.5px",
                  lineHeight: 1,
                  marginTop: "6px",
                }}
              >
                {activeSample ? activeSample.errorKm.toFixed(3) : "0.000"}
                <span style={{ fontSize: "11px", color: T.steel, fontWeight: 400, marginLeft: "4px" }}>km</span>
              </div>
            </div>
          </div>

          {/* EKF Convergence Chart */}
          <div style={{ ...panel, flex: 1 }}>
            <div style={panelLabel}>Estimation Convergence</div>

            <div style={{ width: "100%", height: "140px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  {/* Minimal grid — horizontal hairlines only */}
                  <YAxis
                    stroke={T.graphite}
                    strokeDasharray="2 2"
                    tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: T.steel }}
                    domain={["auto", "auto"]}
                    tickLine={false}
                    axisLine={false}
                  />
                  <XAxis dataKey="step" hide />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: T.graphite, strokeDasharray: "3 2", strokeWidth: 1 }} />
                  {/* Single periwinkle line — no dots */}
                  <Line
                    type="monotone"
                    dataKey="error"
                    stroke={T.periwinkle}
                    strokeWidth={1}
                    dot={false}
                    activeDot={{ r: 3, fill: T.periwinkle, stroke: "none" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Stats beneath chart */}
            <div style={{ borderTop: `1px dashed ${T.graphite}`, marginTop: "12px", paddingTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
              {[
                { label: "Avg Error", value: `${metrics.avgError.toFixed(2)} km` },
                { label: "Max Error", value: `${metrics.maxError.toFixed(2)} km` },
                { label: "Final",     value: `${metrics.finalError.toFixed(2)} km` },
              ].map((row) => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={dataRowLabel}>{row.label}</span>
                  <span style={dataRowValue}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
