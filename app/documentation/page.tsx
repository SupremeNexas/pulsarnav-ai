"use client";

import { useState } from "react";

/*
 * Documentation — DESIGN.md specification:
 * - Dashed section container as primary layout primitive
 * - Sidebar TOC: no rounded cards, doc-nav-item style
 * - Math blocks: void bg, dashed border, mono font
 * - Info callout: periwinkle dashed border (never blue/teal fill)
 * - All icons replaced with minimal SVG (consistent stroke 1px)
 * - No rounded-2xl cards anywhere
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

const sections = [
  { id: "signal-model",    label: "Pulsar Signal Model"    },
  { id: "epoch-folding",   label: "Epoch Folding"          },
  { id: "delay-estimation",label: "Phase Delay Estimation" },
  { id: "kalman-filter",   label: "Extended Kalman Filter" },
];

const systemChecks = [
  "Relativistic barycentric coordinate conversion verified",
  "Sub-100 ns phase delay timing lock achieved",
  "Numerical EKF covariance stability guards active",
  "Pulsar visibility elevation mask configured",
  "NANOGrav 12-yr v4 template bank loaded",
];

export default function DocumentationPage() {
  const [activeSection, setActiveSection] = useState("signal-model");

  const panel: React.CSSProperties = {
    background: T.carbon,
    border: `1px dashed ${T.graphite}`,
    padding: "20px",
  };
  const dataRowLabel: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "10px",
    color: T.steel,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
  };
  const mathBlock: React.CSSProperties = {
    background: T.void,
    border: `1px dashed ${T.graphite}`,
    padding: "16px 20px",
    fontFamily: "var(--font-mono)",
    fontSize: "12px",
    color: T.paper,
    textAlign: "center",
    lineHeight: 1.8,
    overflowX: "auto",
  };
  const bodyText: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "13px",
    lineHeight: 1.8,
    color: T.steel,
  };
  const inlineCode: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    color: T.paper,
  };

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "40px 24px 80px" }}>

      {/* ── Page Header ─────────────────────────────────── */}
      <div style={{ borderBottom: `1px dashed ${T.graphite}`, paddingBottom: "24px", marginBottom: "40px" }}>
        <div style={dataRowLabel}>Academic &amp; Research Portal</div>
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
          Scientific Documentation
        </h1>
      </div>

      {/* ── 3-column layout ─────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 220px", gap: "24px", alignItems: "start" }}>

        {/* ── LEFT: TOC Sidebar ─────────────────────────── */}
        <div style={{ ...panel, position: "sticky", top: "80px" }}>
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: T.periwinkle,
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="1" y="1" width="10" height="2" stroke={T.periwinkle} strokeWidth="1"/>
              <rect x="1" y="5" width="7" height="2" stroke={T.periwinkle} strokeWidth="1"/>
              <rect x="1" y="9" width="8" height="2" stroke={T.periwinkle} strokeWidth="1"/>
            </svg>
            Articles
          </div>
          <nav style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {sections.map((section) => {
              const isActive = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "8px 10px",
                    border: `1px dashed ${isActive ? T.periwinkle : "transparent"}`,
                    background: isActive ? T.pWash : "transparent",
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: isActive ? T.paper : T.steel,
                    borderRadius: "0",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "color 0.15s ease, border-color 0.15s ease, background 0.15s ease",
                  }}
                  onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.color = T.paper; }}
                  onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.color = T.steel; }}
                >
                  {section.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* ── CENTER: Documentation Content ─────────────── */}
        <div style={{ border: `1px dashed ${T.graphite}`, padding: "28px" }}>
          {activeSection === "signal-model" && (
            <article style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <h2 style={{
                fontFamily: "var(--font-sans)", fontSize: "24px", fontWeight: 900,
                lineHeight: 1.3, letterSpacing: "-0.24px", color: T.paper,
                textTransform: "uppercase", borderBottom: `1px dashed ${T.graphite}`, paddingBottom: "16px",
              }}>
                Pulsar Signal Modeling
              </h2>
              <p style={bodyText}>
                X-ray pulsar photon emissions are modeled as a Non-Homogeneous Poisson Process (NHPP).
                The time-varying intensity function λ(t) is defined as:
              </p>
              <div style={mathBlock}>
                λ(t) = λ₀ [ (1 − d) h(φ(t)) + d ]
              </div>
              <p style={bodyText}>Where:</p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                {[
                  ["λ₀", "Total peak photon arrival intensity."],
                  ["h(φ)", "Normalized pulsar pulse profile (pulse template)."],
                  ["φ(t)", "Pulsar rotation phase at time t."],
                  ["d", "Background radiation fraction (noise ratio)."],
                ].map(([sym, desc]) => (
                  <li key={sym} style={{ display: "flex", gap: "12px", ...bodyText }}>
                    <span style={{ ...inlineCode, minWidth: "36px" }}>{sym}</span>
                    <span style={{ color: T.steel }}>{desc}</span>
                  </li>
                ))}
              </ul>
              {/* Periwinkle callout — dashed border, never filled */}
              <div style={{
                border: `1px dashed ${T.periwinkle}`,
                background: T.pWash,
                padding: "14px 16px",
                display: "flex",
                gap: "12px",
                alignItems: "flex-start",
              }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: "1px" }}>
                  <circle cx="7" cy="7" r="6" stroke={T.periwinkle} strokeWidth="1"/>
                  <line x1="7" y1="5" x2="7" y2="10" stroke={T.periwinkle} strokeWidth="1.5" strokeLinecap="round"/>
                  <circle cx="7" cy="3.5" r="0.75" fill={T.periwinkle}/>
                </svg>
                <p style={{ ...bodyText, fontSize: "12px", color: T.steel }}>
                  NANOGrav data releases provide high-accuracy templates for each pulsar profile,
                  used as matched filters during phase estimation.
                </p>
              </div>
            </article>
          )}

          {activeSection === "epoch-folding" && (
            <article style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <h2 style={{
                fontFamily: "var(--font-sans)", fontSize: "24px", fontWeight: 900,
                lineHeight: 1.3, letterSpacing: "-0.24px", color: T.paper,
                textTransform: "uppercase", borderBottom: `1px dashed ${T.graphite}`, paddingBottom: "16px",
              }}>
                Epoch Folding
              </h2>
              <p style={bodyText}>
                Because individual X-ray photon events are extremely sparse (&lt; 1 photon per period),
                individual pulses cannot be resolved directly. Epoch folding overlays multiple periods
                to construct a high-SNR integrated profile.
              </p>
              <p style={bodyText}>
                The phase of each photon arrival at time t_i is computed modulo the pulsar period P:
              </p>
              <div style={mathBlock}>
                φ(t_i) = frac( (t_i − t₀)/P + (Ṗ/2)·((t_i − t₀)/P)² )
              </div>
              <p style={bodyText}>
                Where <span style={inlineCode}>t₀</span> is the reference epoch and{" "}
                <span style={inlineCode}>Ṗ</span> represents the period spin-down rate.
              </p>
            </article>
          )}

          {activeSection === "delay-estimation" && (
            <article style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <h2 style={{
                fontFamily: "var(--font-sans)", fontSize: "24px", fontWeight: 900,
                lineHeight: 1.3, letterSpacing: "-0.24px", color: T.paper,
                textTransform: "uppercase", borderBottom: `1px dashed ${T.graphite}`, paddingBottom: "16px",
              }}>
                Phase Delay Estimation
              </h2>
              <p style={bodyText}>
                The phase offset θ̂ between the folded profile and the reference template is computed
                to find the Time of Arrival (TOA) at the spacecraft.
              </p>
              <p style={bodyText}>Using the Maximum Likelihood Estimator (MLE):</p>
              <div style={mathBlock}>
                θ̂ = argmax_θ Σᵢ ln[ (1 − d) h(φ(tᵢ) − θ) + d ]
              </div>
              <p style={bodyText}>
                Alternatively, cross-correlation (CC) in the frequency domain is used for lower
                computational complexity at the cost of slight statistical efficiency.
              </p>
            </article>
          )}

          {activeSection === "kalman-filter" && (
            <article style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <h2 style={{
                fontFamily: "var(--font-sans)", fontSize: "24px", fontWeight: 900,
                lineHeight: 1.3, letterSpacing: "-0.24px", color: T.paper,
                textTransform: "uppercase", borderBottom: `1px dashed ${T.graphite}`, paddingBottom: "16px",
              }}>
                Extended Kalman Filter
              </h2>
              <p style={bodyText}>
                The EKF tracks the spacecraft state vector{" "}
                <span style={inlineCode}>x = [r^T, v^T]^T</span> representing position and velocity.
                Dynamics are propagated via:
              </p>
              <div style={mathBlock}>ẋ(t) = f(x(t)) + w(t)</div>
              <p style={bodyText}>
                Where <span style={inlineCode}>f(x)</span> incorporates central Keplerian gravity
                and J2 Earth oblateness perturbations.
              </p>
              <p style={bodyText}>When a pulsar phase delay δτ is observed, the measurement update:</p>
              <div style={{ ...mathBlock, display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>K_k = P_k⁻ H_k^T (H_k P_k⁻ H_k^T + R_k)⁻¹</div>
                <div>x̂_k = x̂_k⁻ + K_k (δτ_k − h(x̂_k⁻))</div>
                <div>P_k = (I − K_k H_k) P_k⁻</div>
              </div>
            </article>
          )}
        </div>

        {/* ── RIGHT: System Checks ──────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={panel}>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: T.periwinkle,
              marginBottom: "16px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="6" r="5" stroke={T.periwinkle} strokeWidth="1"/>
                <polyline points="3,6 5,8.5 9,3.5" stroke={T.periwinkle} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              System Checks
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
              {systemChecks.map((check, idx) => (
                <li
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    lineHeight: 1.6,
                    color: T.steel,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, marginTop: "1px" }}>
                    <polyline points="2,6 4.5,9.5 10,2.5" stroke={T.periwinkle} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {check}
                </li>
              ))}
            </ul>
          </div>

          {/* Quick reference panel */}
          <div style={panel}>
            <div style={{ ...dataRowLabel, marginBottom: "16px" }}>Quick Reference</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[
                { key: "Dataset",   val: "NANOGrav 12-yr v4" },
                { key: "Algorithm", val: "MLE + EKF"          },
                { key: "State Dim", val: "8 (r, v)"           },
                { key: "Pulsars",   val: `${8} beacons`       },
                { key: "Frame",     val: "ECI J2000"           },
              ].map((row) => (
                <div key={row.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={dataRowLabel}>{row.key}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: T.paper }}>{row.val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
