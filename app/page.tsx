"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/*
 * Landing Page — DESIGN.md specification:
 *
 * Hero:
 *   - #1c1c1c radial lamp background (Carbon center → Void edges)
 *   - Eyebrow chip: Geist Mono 9px, 1px dashed #fff border, 100px radius
 *   - Display headline: 70px, weight 900, line-height 1.1, letter-spacing -2.8px
 *   - Subtitle: 16px Mono, #808080, centered, max-width 520px
 *   - One outlined pill button (single action)
 *
 * Step cards:
 *   - No fill. No shadow. Periwinkle circle icon (top).
 *   - Raveo 500 16px label. 14px body.
 *   - Inside dashed section container.
 *
 * Feature split:
 *   - 12px uppercase Geist Mono label
 *   - 32px display heading
 *   - 4 periwinkle check items
 *   - Right: 1:1 illustration area — Carbon bg, 1px periwinkle line art
 *
 * Footer:
 *   - Hairline divider (1px dashed graphite)
 *   - Two-column metadata strip
 */

const TELEMETRY_SEED = {
  x: 7421.32,
  y: -312.44,
  z: 2154.68,
  vx: 5.421,
  vy: 4.887,
  vz: -1.025,
  mjd: 58000.124578,
};

export default function LandingPage() {
  const [tel, setTel] = useState(TELEMETRY_SEED);

  useEffect(() => {
    const id = setInterval(() => {
      setTel((prev) => ({
        x:   prev.x   + (Math.random() - 0.5) * 1.8,
        y:   prev.y   + (Math.random() - 0.5) * 1.8,
        z:   prev.z   + (Math.random() - 0.5) * 1.2,
        vx:  prev.vx  + (Math.random() - 0.5) * 0.008,
        vy:  prev.vy  + (Math.random() - 0.5) * 0.008,
        vz:  prev.vz  + (Math.random() - 0.5) * 0.008,
        mjd: prev.mjd + 0.0000012,
      }));
    }, 1200);
    return () => clearInterval(id);
  }, []);

  // ─── Design tokens inlined for zero Tailwind dependency divergence ──────────
  const T = {
    void:        "#000000",
    carbon:      "#1c1c1c",
    graphite:    "#4d4d4d",
    steel:       "#808080",
    ash:         "#ababab",
    paper:       "#ffffff",
    periwinkle:  "#7089ba",
    pWash:       "rgba(112,137,186,0.05)",
    fontMono:    "var(--font-mono)",
    fontDisplay: "var(--font-sans)",
  };

  const steps = [
    {
      label: "01  Epoch Folding",
      body: "Overlay sparse Poisson photon events over period templates to reconstruct the integrated pulse profile of millisecond pulsars.",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="7" stroke={T.periwinkle} strokeWidth="1" strokeDasharray="3 2"/>
          <circle cx="10" cy="10" r="3" stroke={T.periwinkle} strokeWidth="1"/>
          <line x1="10" y1="3" x2="10" y2="17" stroke={T.periwinkle} strokeWidth="0.75"/>
          <line x1="3" y1="10" x2="17" y2="10" stroke={T.periwinkle} strokeWidth="0.75"/>
        </svg>
      ),
    },
    {
      label: "02  Phase Estimation",
      body: "Determine the spacecraft Time of Arrival (TOA) using Maximum Likelihood cross-correlation against the NANOGrav pulsar template bank.",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <polyline points="2,14 6,8 9,11 13,5 18,9" stroke={T.periwinkle} strokeWidth="1" fill="none"/>
          <line x1="2" y1="16" x2="18" y2="16" stroke={T.periwinkle} strokeWidth="0.75" strokeDasharray="2 2"/>
        </svg>
      ),
    },
    {
      label: "03  EKF Fusion",
      body: "Propagate spacecraft dynamics via RK4 with J2 perturbations. Recursively update position and velocity inside an 8-state Extended Kalman Filter.",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <rect x="4" y="4" width="12" height="12" stroke={T.periwinkle} strokeWidth="1" strokeDasharray="3 2"/>
          <rect x="7" y="7" width="6" height="6" stroke={T.periwinkle} strokeWidth="0.75"/>
          <circle cx="10" cy="10" r="1.5" fill={T.periwinkle}/>
        </svg>
      ),
    },
  ];

  const features = [
    "Continuous observability check on 8-pulsar NANOGrav catalogue",
    "Dynamic Solar System Barycenter (SSB) relativity correction",
    "Ground station visibility masking — Goldstone, Canberra, Madrid",
    "EKF covariance regularization with numerical noise-floor clamps",
  ];

  return (
    <div style={{ background: T.void, color: T.paper, minHeight: "100vh" }}>

      {/* ══════════════════════════════════════════════════════
          HERO — Carbon radial lamp, 70px display headline
          ══════════════════════════════════════════════════════ */}
      <section
        style={{
          width: "100%",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(ellipse at 50% 40%, #1c1c1c 0%, #000000 80%)",
          borderBottom: `1px dashed ${T.graphite}`,
          textAlign: "center",
          padding: "80px 24px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Blueprint grid */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `
              linear-gradient(to right, rgba(112,137,186,0.03) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(112,137,186,0.03) 1px, transparent 1px)
            `,
            backgroundSize: "40px 40px",
            pointerEvents: "none",
          }}
          aria-hidden
        />

        {/* Eyebrow chip */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "4px 14px",
            border: `1px dashed ${T.paper}`,
            borderRadius: "100px",
            fontFamily: T.fontMono,
            fontSize: "9px",
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            color: T.paper,
            marginBottom: "40px",
          }}
        >
          <span
            style={{
              width: "5px",
              height: "5px",
              borderRadius: "50%",
              background: T.periwinkle,
              display: "inline-block",
              animation: "pulse 2s ease-in-out infinite",
            }}
          />
          XNAV · NANOGrav 12-yr Dataset · EKF Estimation Engine
        </div>

        {/* Display headline — 70px, weight 900, -2.8px */}
        <h1
          style={{
            fontFamily: T.fontDisplay,
            fontSize: "clamp(42px, 8vw, 70px)",
            fontWeight: 900,
            lineHeight: 1.05,
            letterSpacing: "-2.8px",
            color: T.paper,
            maxWidth: "820px",
            marginBottom: "28px",
            textTransform: "uppercase",
          }}
        >
          Autonomous Space Navigation
        </h1>

        {/* Subheading — 16px mono, steel */}
        <p
          style={{
            fontFamily: T.fontMono,
            fontSize: "16px",
            lineHeight: 1.7,
            color: T.steel,
            maxWidth: "520px",
            marginBottom: "56px",
          }}
        >
          PulsarNav AI delivers autonomous deep space positioning using millisecond
          X-ray pulsar signals — bypassing Earth-ground tracking delays entirely.
        </p>

        {/* Single outlined pill button */}
        <div style={{ display: "flex", gap: "24px", alignItems: "center" }}>
          <Link
            href="/dashboard"
            style={{
              fontFamily: T.fontMono,
              fontSize: "12px",
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: T.paper,
              textDecoration: "none",
              border: `1px solid ${T.paper}`,
              borderRadius: "100px",
              padding: "10px 24px",
              background: "transparent",
              transition: "background 0.2s ease, color 0.2s ease",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = T.paper;
              (e.currentTarget as HTMLElement).style.color = T.void;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = T.paper;
            }}
          >
            Launch Console
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.5"/>
              <polyline points="7,2 11,6 7,10" stroke="currentColor" strokeWidth="1.5" fill="none"/>
            </svg>
          </Link>

          <Link
            href="/documentation"
            style={{
              fontFamily: T.fontMono,
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: T.steel,
              textDecoration: "none",
              transition: "color 0.2s ease",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = T.paper; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = T.steel; }}
          >
            Technical Manual →
          </Link>
        </div>

        {/* Live telemetry ticker at hero bottom */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            borderTop: `1px dashed ${T.graphite}`,
            padding: "10px 24px",
            display: "flex",
            justifyContent: "center",
            gap: "40px",
            flexWrap: "wrap",
            fontFamily: T.fontMono,
            fontSize: "10px",
            color: T.steel,
            background: "rgba(0,0,0,0.4)",
          }}
        >
          <span style={{ color: T.periwinkle }}>● LIVE TELEMETRY</span>
          <span>X: <span style={{ color: T.paper }}>{tel.x.toFixed(2)}</span> km</span>
          <span>Y: <span style={{ color: T.paper }}>{tel.y.toFixed(2)}</span> km</span>
          <span>Z: <span style={{ color: T.paper }}>{tel.z.toFixed(2)}</span> km</span>
          <span>Vx: <span style={{ color: T.paper }}>{tel.vx.toFixed(3)}</span> km/s</span>
          <span>Vy: <span style={{ color: T.paper }}>{tel.vy.toFixed(3)}</span> km/s</span>
          <span>MJD: <span style={{ color: T.paper }}>{tel.mjd.toFixed(6)}</span></span>
        </div>
      </section>


      {/* ══════════════════════════════════════════════════════
          3-STEP HOW IT WORKS — No fill, no shadow, dashed container
          ══════════════════════════════════════════════════════ */}
      <section
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "80px 24px",
          borderBottom: `1px dashed ${T.graphite}`,
        }}
      >
        {/* Section eyebrow + heading */}
        <div style={{ marginBottom: "64px" }}>
          <div
            style={{
              fontFamily: T.fontMono,
              fontSize: "12px",
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: T.steel,
              marginBottom: "12px",
            }}
          >
            Scientific Architecture
          </div>
          <h2
            style={{
              fontFamily: T.fontDisplay,
              fontSize: "32px",
              fontWeight: 900,
              lineHeight: 1.2,
              letterSpacing: "-0.32px",
              color: T.paper,
              textTransform: "uppercase",
              maxWidth: "480px",
            }}
          >
            Navigating by stellar beacons
          </h2>
        </div>

        {/* 3 columns — no border between, dashed section wraps all */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "0",
            border: `1px dashed ${T.graphite}`,
          }}
        >
          {steps.map((step, i) => (
            <div
              key={step.label}
              style={{
                padding: "40px 32px",
                borderRight: i < steps.length - 1 ? `1px dashed ${T.graphite}` : "none",
              }}
            >
              {/* Periwinkle icon container */}
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  border: `1px dashed ${T.graphite}`,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "24px",
                }}
              >
                {step.icon}
              </div>

              <h3
                style={{
                  fontFamily: T.fontMono,
                  fontSize: "14px",
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: T.paper,
                  marginBottom: "12px",
                }}
              >
                {step.label}
              </h3>
              <p
                style={{
                  fontFamily: T.fontMono,
                  fontSize: "13px",
                  lineHeight: 1.7,
                  color: T.steel,
                }}
              >
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </section>


      {/* ══════════════════════════════════════════════════════
          FEATURE SPLIT PANEL — Text left, CAD illustration right
          ══════════════════════════════════════════════════════ */}
      <section
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "80px 24px",
          borderBottom: `1px dashed ${T.graphite}`,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "80px",
          alignItems: "center",
        }}
      >
        {/* Left — text column */}
        <div>
          <div
            style={{
              fontFamily: T.fontMono,
              fontSize: "12px",
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: T.steel,
              marginBottom: "16px",
            }}
          >
            Flight Dynamics
          </div>

          <h2
            style={{
              fontFamily: T.fontDisplay,
              fontSize: "32px",
              fontWeight: 900,
              lineHeight: 1.15,
              letterSpacing: "-0.32px",
              color: T.paper,
              textTransform: "uppercase",
              marginBottom: "24px",
              maxWidth: "400px",
            }}
          >
            Designed for autonomous deep space cruise
          </h2>

          <p
            style={{
              fontFamily: T.fontMono,
              fontSize: "14px",
              lineHeight: 1.7,
              color: T.steel,
              marginBottom: "36px",
              maxWidth: "440px",
            }}
          >
            Aerospace systems operate under hard computational constraints.
            PulsarNav AI delivers model-based covariance analysis and
            real-time observability matrices to guarantee EKF convergence.
          </p>

          {/* Periwinkle checklist */}
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
            {features.map((f, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                  fontFamily: T.fontMono,
                  fontSize: "13px",
                  lineHeight: 1.6,
                  color: T.paper,
                }}
              >
                {/* Periwinkle check icon */}
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  style={{ flexShrink: 0, marginTop: "2px" }}
                >
                  <polyline
                    points="2,7 5.5,11 12,3"
                    stroke={T.periwinkle}
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Right — CAD illustration area */}
        <div
          style={{
            aspectRatio: "1/1",
            background: T.carbon,
            border: `1px dashed ${T.graphite}`,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "28px",
            position: "relative",
          }}
        >
          {/* Header row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontFamily: T.fontMono, fontSize: "10px", color: T.steel, textTransform: "uppercase", letterSpacing: "0.1em" }}>Platform Status</div>
              <div style={{ fontFamily: T.fontMono, fontSize: "13px", color: T.paper, fontWeight: 500, textTransform: "uppercase", marginTop: "2px" }}>Nav Locked</div>
            </div>
            <div
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: T.periwinkle,
                animation: "pulse 2s ease-in-out infinite",
              }}
            />
          </div>

          {/* Center — wire-frame orbital diagram */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
            <svg width="200" height="200" viewBox="0 0 200 200" fill="none">
              {/* Outer dashed circle */}
              <circle cx="100" cy="100" r="90" stroke={T.graphite} strokeWidth="1" strokeDasharray="4 3"/>
              {/* Mid circle */}
              <circle cx="100" cy="100" r="60" stroke={T.graphite} strokeWidth="0.75" strokeDasharray="3 3"/>
              {/* Inner circle */}
              <circle cx="100" cy="100" r="30" stroke={T.graphite} strokeWidth="0.75" strokeDasharray="2 3"/>
              {/* ECI axes */}
              <line x1="10" y1="100" x2="190" y2="100" stroke={T.carbon} strokeWidth="0.75"/>
              <line x1="100" y1="10" x2="100" y2="190" stroke={T.carbon} strokeWidth="0.75"/>
              {/* Pulsar lines of sight */}
              <line x1="100" y1="100" x2="190" y2="30" stroke={T.periwinkle} strokeWidth="0.5" strokeDasharray="4 3" opacity="0.5"/>
              <line x1="100" y1="100" x2="20" y2="50" stroke={T.periwinkle} strokeWidth="0.5" strokeDasharray="4 3" opacity="0.5"/>
              <line x1="100" y1="100" x2="160" y2="180" stroke={T.periwinkle} strokeWidth="0.5" strokeDasharray="4 3" opacity="0.5"/>
              <line x1="100" y1="100" x2="10" y2="155" stroke={T.periwinkle} strokeWidth="0.5" strokeDasharray="4 3" opacity="0.5"/>
              {/* Pulsar nodes */}
              <circle cx="190" cy="30" r="3" fill={T.periwinkle} opacity="0.8"/>
              <circle cx="20" cy="50" r="3" fill={T.periwinkle} opacity="0.8"/>
              <circle cx="160" cy="180" r="3" fill={T.periwinkle} opacity="0.8"/>
              <circle cx="10" cy="155" r="3" fill={T.periwinkle} opacity="0.8"/>
              {/* Spacecraft orbit path */}
              <ellipse cx="100" cy="100" rx="75" ry="45" stroke={T.periwinkle} strokeWidth="0.5" strokeDasharray="3 2" opacity="0.3" transform="rotate(-20 100 100)"/>
              {/* Spacecraft */}
              <circle cx="100" cy="55" r="4" fill={T.paper}/>
              {/* Earth */}
              <circle cx="100" cy="100" r="14" stroke={T.steel} strokeWidth="0.75" fill={T.carbon}/>
              <ellipse cx="100" cy="100" rx="14" ry="5" stroke={T.graphite} strokeWidth="0.5"/>
            </svg>
          </div>

          {/* Footer telemetry row */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: T.fontMono,
              fontSize: "10px",
              color: T.steel,
              borderTop: `1px dashed ${T.graphite}`,
              paddingTop: "12px",
            }}
          >
            <span>AZ: 142.34°</span>
            <span>EL: 38.52°</span>
            <span>GDOP: 0.982</span>
          </div>
        </div>
      </section>


      {/* ══════════════════════════════════════════════════════
          NAVIGATION METHODS COMPARISON — achromatic table
          ══════════════════════════════════════════════════════ */}
      <section
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "80px 24px",
          borderBottom: `1px dashed ${T.graphite}`,
        }}
      >
        <div
          style={{
            fontFamily: T.fontMono,
            fontSize: "12px",
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: T.steel,
            marginBottom: "12px",
          }}
        >
          Navigation Comparison
        </div>
        <h2
          style={{
            fontFamily: T.fontDisplay,
            fontSize: "32px",
            fontWeight: 900,
            lineHeight: 1.2,
            letterSpacing: "-0.32px",
            color: T.paper,
            textTransform: "uppercase",
            marginBottom: "48px",
          }}
        >
          DSN vs XNAV vs Hybrid EKF
        </h2>

        {/* Comparison table — no colorful rows */}
        <div style={{ border: `1px dashed ${T.graphite}` }}>
          {/* Header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr 1fr",
              borderBottom: `1px dashed ${T.graphite}`,
              padding: "12px 24px",
            }}
          >
            {["Capability", "DSN", "XNAV", "Hybrid"].map((h, i) => (
              <div
                key={h}
                style={{
                  fontFamily: T.fontMono,
                  fontSize: "11px",
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: i === 0 ? T.steel : T.periwinkle,
                }}
              >
                {h}
              </div>
            ))}
          </div>

          {[
            { cap: "Coverage", dsn: "~60%", xnav: "100%", hybrid: "100%" },
            { cap: "Ground Dependency", dsn: "Mandatory", xnav: "None", hybrid: "Optional" },
            { cap: "Estimation Delay", dsn: "Up to 40 min", xnav: "Real-time", hybrid: "Real-time" },
            { cap: "Drift (blackout)", dsn: "5–150 km/day", xnav: "Bounded", hybrid: "Bounded" },
            { cap: "Deep Space", dsn: "Degraded", xnav: "Full", hybrid: "Full" },
          ].map((row, i) => (
            <div
              key={row.cap}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr 1fr",
                padding: "14px 24px",
                borderBottom: i < 4 ? `1px dashed ${T.carbon}` : "none",
              }}
            >
              <div style={{ fontFamily: T.fontMono, fontSize: "12px", color: T.paper }}>{row.cap}</div>
              <div style={{ fontFamily: T.fontMono, fontSize: "12px", color: T.steel }}>{row.dsn}</div>
              <div style={{ fontFamily: T.fontMono, fontSize: "12px", color: T.ash }}>{row.xnav}</div>
              <div style={{ fontFamily: T.fontMono, fontSize: "12px", color: T.ash }}>{row.hybrid}</div>
            </div>
          ))}
        </div>
      </section>


      {/* ══════════════════════════════════════════════════════
          FOOTER — Hairline divider, two-column metadata
          ══════════════════════════════════════════════════════ */}
      <footer
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "40px 24px",
          borderTop: `1px dashed ${T.graphite}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "24px",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: T.fontMono,
              fontSize: "14px",
              fontWeight: 500,
              color: T.paper,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "8px",
            }}
          >
            PulsarNav <span style={{ color: T.periwinkle }}>AI</span>
          </div>
          <div style={{ fontFamily: T.fontMono, fontSize: "12px", color: T.steel }}>
            Autonomous deep space navigation via XNAV
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: "40px",
            flexWrap: "wrap",
          }}
        >
          {[
            { label: "Dataset", value: "NANOGrav 12-yr v4" },
            { label: "Algorithm", value: "EKF / WLS / LS" },
            { label: "Reference", value: "ECI J2000" },
            { label: "Build", value: "Production" },
          ].map((item) => (
            <div key={item.label}>
              <div style={{ fontFamily: T.fontMono, fontSize: "10px", color: T.steel, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "4px" }}>
                {item.label}
              </div>
              <div style={{ fontFamily: T.fontMono, fontSize: "12px", color: T.ash }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </footer>

      {/* Keyframe for pulsing dot */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
