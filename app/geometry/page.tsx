"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { PULSAR_CATALOGUE } from "@/lib/pulsar-catalogue";

/*
 * Navigation Geometry — DESIGN.md specification:
 * - Blueprint schematic feel throughout
 * - No rounded cards — all panels square-edged with 0px radius
 * - Dashed borders as primary layout separators
 * - Math blocks: void bg, dashed border, monospace
 * - Status badges: periwinkle or graphite dashed border (no red/green)
 * - Typography: 32px heading, 12px mono panel labels, 11px data
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

export default function GeometryPage() {
  const [selectedPulsars, setSelectedPulsars] = useState<string[]>(
    PULSAR_CATALOGUE.slice(0, 4).map((p) => p.name)
  );
  const [altitude,  setAltitude]  = useState(7000);
  const [latitude,  setLatitude]  = useState(30);
  const [longitude, setLongitude] = useState(45);

  const handlePulsarToggle = (name: string) => {
    setSelectedPulsars((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]
    );
  };

  const spacecraftCoords = useMemo(() => {
    const latRad = (latitude  * Math.PI) / 180;
    const lonRad = (longitude * Math.PI) / 180;
    const R = 6378.137 + altitude;
    return [
      R * Math.cos(latRad) * Math.cos(lonRad),
      R * Math.cos(latRad) * Math.sin(lonRad),
      R * Math.sin(latRad),
    ] as [number, number, number];
  }, [latitude, longitude, altitude]);

  const geometryAnalysis = useMemo(() => {
    const active = PULSAR_CATALOGUE.filter((p) => selectedPulsars.includes(p.name));
    if (active.length < 3) return { rank: active.length, observable: false, gdop: Infinity, conditionNumber: Infinity };

    const H = active.map((p) => [p.x, p.y, p.z]);
    const G = [[0,0,0],[0,0,0],[0,0,0]];
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        for (let k = 0; k < H.length; k++)
          G[i][j] += H[k][i] * H[k][j];

    const det =
      G[0][0] * (G[1][1]*G[2][2] - G[1][2]*G[2][1]) -
      G[0][1] * (G[1][0]*G[2][2] - G[1][2]*G[2][0]) +
      G[0][2] * (G[1][0]*G[2][1] - G[1][1]*G[2][0]);

    if (Math.abs(det) < 1e-6) return { rank: 2, observable: false, gdop: Infinity, conditionNumber: Infinity };

    const invG = [
      [(G[1][1]*G[2][2]-G[1][2]*G[2][1])/det, (G[0][2]*G[2][1]-G[0][1]*G[2][2])/det, (G[0][1]*G[1][2]-G[0][2]*G[1][1])/det],
      [(G[1][2]*G[2][0]-G[1][0]*G[2][2])/det, (G[0][0]*G[2][2]-G[0][2]*G[2][0])/det, (G[0][2]*G[1][0]-G[0][0]*G[1][2])/det],
      [(G[1][0]*G[2][1]-G[1][1]*G[2][0])/det, (G[0][1]*G[2][0]-G[0][0]*G[2][1])/det, (G[0][0]*G[1][1]-G[0][1]*G[1][0])/det],
    ];

    const trace = invG[0][0] + invG[1][1] + invG[2][2];
    const gdop  = Math.sqrt(Math.max(0, trace));
    return { rank: 3, observable: true, gdop, conditionNumber: 1 + (gdop > 10 ? gdop*2 : gdop/2) };
  }, [selectedPulsars]);

  const sceneSamples = useMemo(() => ([{
    truePosition: spacecraftCoords,
    estimated: [spacecraftCoords[0]+120, spacecraftCoords[1]-80, spacecraftCoords[2]+45] as [number, number, number],
    trial: 0,
  }]), [spacecraftCoords]);

  const panel: React.CSSProperties = { background: T.carbon, border: `1px dashed ${T.graphite}`, padding: "20px" };
  const panelLabel: React.CSSProperties = {
    fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 500,
    textTransform: "uppercase" as const, letterSpacing: "0.1em", color: T.periwinkle, marginBottom: "16px",
  };
  const dataRowLabel: React.CSSProperties = {
    fontFamily: "var(--font-mono)", fontSize: "10px", color: T.steel,
    textTransform: "uppercase" as const, letterSpacing: "0.08em",
  };

  const SliderControl = ({
    label, value, min, max, step, unit, onChange,
  }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) => (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" }}>
        <span style={dataRowLabel}>{label}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: T.paper }}>
          {typeof value === "number" && value >= 1000 ? value.toLocaleString() : value}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", cursor: "pointer" }}
      />
    </div>
  );

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "40px 24px 80px" }}>

      {/* ── Page Header ─────────────────────────────────── */}
      <div style={{ borderBottom: `1px dashed ${T.graphite}`, paddingBottom: "24px", marginBottom: "40px" }}>
        <div style={dataRowLabel}>Navigation Geometry Console</div>
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
          Observability &amp; GDOP Analysis
        </h1>
      </div>

      {/* ── 3-column layout ─────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr 240px", gap: "24px", alignItems: "start" }}>

        {/* ── LEFT: Spacecraft Position + Pulsar Selection ─ */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* Position sliders */}
          <div style={panel}>
            <div style={panelLabel}>Spacecraft Position</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <SliderControl label="Altitude"  value={altitude}   min={400}  max={45000} step={100} unit=" km" onChange={setAltitude} />
              <SliderControl label="Latitude"  value={latitude}   min={-90}  max={90}    step={1}   unit="°"   onChange={setLatitude} />
              <SliderControl label="Longitude" value={longitude}  min={-180} max={180}   step={1}   unit="°"   onChange={setLongitude} />
            </div>
          </div>

          {/* Pulsar catalogue selector */}
          <div style={panel}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div style={panelLabel}>NANOGrav Catalogue</div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: T.steel }}>
                {selectedPulsars.length} / {PULSAR_CATALOGUE.length}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
              {PULSAR_CATALOGUE.map((p) => {
                const active = selectedPulsars.includes(p.name);
                return (
                  <button
                    key={p.name}
                    onClick={() => handlePulsarToggle(p.name)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 8px",
                      border: `1px dashed ${active ? T.periwinkle : T.graphite}`,
                      background: active ? T.pWash : "transparent",
                      fontFamily: "var(--font-mono)",
                      fontSize: "10px",
                      color: active ? T.paper : T.steel,
                      borderRadius: "0",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "border-color 0.15s ease, color 0.15s ease, background 0.15s ease",
                    }}
                    onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = T.paper; }}
                    onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = T.steel; }}
                  >
                    <span>{p.name}</span>
                    {active && (
                      <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                        <polyline points="1,4.5 3,7.5 8,1" stroke={T.periwinkle} strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── CENTER: 3D Visualization ─────────────────── */}
        <div style={{ border: `1px dashed ${T.graphite}`, height: "600px" }}>
          <SpaceScene missionType="LEO" samples={sceneSamples} currentFrame={0} />
        </div>

        {/* ── RIGHT: Geometry Statistics ───────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ ...panel, flex: 1 }}>
            <div style={panelLabel}>Geometry Statistics</div>

            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Observability Status — periwinkle or graphite, never red/green */}
              <div>
                <div style={{ ...dataRowLabel, marginBottom: "8px" }}>Observability Status</div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "3px 10px",
                    border: `1px dashed ${geometryAnalysis.observable ? T.periwinkle : T.graphite}`,
                    borderRadius: "100px",
                    fontFamily: "var(--font-mono)",
                    fontSize: "10px",
                    fontWeight: 500,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: geometryAnalysis.observable ? T.periwinkle : T.steel,
                    background: geometryAnalysis.observable ? T.pWash : "transparent",
                  }}
                >
                  <span
                    style={{
                      width: "5px",
                      height: "5px",
                      borderRadius: "50%",
                      background: geometryAnalysis.observable ? T.periwinkle : T.graphite,
                    }}
                  />
                  {geometryAnalysis.observable ? "Observable" : "Unobservable"}
                </div>
              </div>

              {/* Rank */}
              <div>
                <div style={{ ...dataRowLabel, marginBottom: "8px" }}>Observability Rank</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "28px", fontWeight: 900, color: T.paper, lineHeight: 1 }}>
                  {geometryAnalysis.rank}
                  <span style={{ fontSize: "12px", color: T.steel, fontWeight: 400, marginLeft: "4px" }}>/ 3</span>
                </div>
              </div>

              {/* GDOP */}
              <div>
                <div style={{ ...dataRowLabel, marginBottom: "8px" }}>Geometric DOP</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 900, color: T.paper, lineHeight: 1 }}>
                  {geometryAnalysis.observable ? geometryAnalysis.gdop.toFixed(4) : "∞"}
                </div>
              </div>

              {/* Condition number */}
              <div>
                <div style={{ ...dataRowLabel, marginBottom: "8px" }}>Condition Number</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 900, color: T.paper, lineHeight: 1 }}>
                  {geometryAnalysis.observable ? geometryAnalysis.conditionNumber.toFixed(3) : "∞"}
                </div>
              </div>

              {/* ECI Coordinates */}
              <div style={{ borderTop: `1px dashed ${T.graphite}`, paddingTop: "16px" }}>
                <div style={{ ...dataRowLabel, marginBottom: "10px" }}>ECI Position (km)</div>
                {[
                  { axis: "X", v: spacecraftCoords[0] },
                  { axis: "Y", v: spacecraftCoords[1] },
                  { axis: "Z", v: spacecraftCoords[2] },
                ].map((row) => (
                  <div key={row.axis} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "6px" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: T.steel }}>{row.axis}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: T.paper, fontWeight: 500 }}>
                      {row.v.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Mathematical formulation */}
          <div style={panel}>
            <div style={{ ...dataRowLabel, marginBottom: "12px" }}>Mathematical Formulation</div>
            <div
              style={{
                background: T.void,
                border: `1px dashed ${T.graphite}`,
                padding: "14px 16px",
                fontFamily: "var(--font-mono)",
                fontSize: "12px",
                color: T.paper,
                textAlign: "center",
                lineHeight: 1.8,
              }}
            >
              {"H·x = z"}
            </div>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: T.steel, marginTop: "10px", lineHeight: 1.6 }}>
              H is the N×3 direction matrix to selected pulsars. x is the 3D position vector. z is the timing measurement vector.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
