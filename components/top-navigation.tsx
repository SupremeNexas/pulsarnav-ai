"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/*
 * TopNavigation — DESIGN.md specification:
 * - Transparent over hero, switches to #000000 on scroll
 * - Logo (white wordmark) left
 * - Nav links center — Geist Mono 500 14px, uppercase
 * - "Mission Control" outlined pill button right (ONLY bordered element)
 * - Hairline 1px bottom border on scroll (dashed graphite)
 * - border-radius: 6px for nav elements
 * - No filled buttons. No icon buttons. No colors except periwinkle on active dot.
 */
export function TopNavigation() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navLinks = [
    { name: "Platform",      href: "/" },
    { name: "Geometry",      href: "/geometry" },
    { name: "Dashboard",     href: "/dashboard" },
    { name: "Comparison",    href: "/comparison" },
    { name: "Documentation", href: "/documentation" },
  ];

  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 999,
        height: "64px",
        display: "flex",
        alignItems: "center",
        background: scrolled ? "#000000" : "transparent",
        borderBottom: scrolled ? "1px dashed #4d4d4d" : "1px dashed transparent",
        transition: "background 0.3s ease, border-color 0.3s ease",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "0 24px",
        }}
      >
        {/* Wordmark — logo left */}
        <Link
          href="/"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "14px",
            fontWeight: 500,
            color: "#ffffff",
            textDecoration: "none",
            letterSpacing: "0.02em",
            textTransform: "uppercase",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <span>PulsarNav</span>
          <span style={{ color: "#7089ba" }}>AI</span>
        </Link>

        {/* Nav links — center */}
        <nav style={{ display: "flex", alignItems: "center", gap: "32px" }}>
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.name}
                href={link.href}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: "0.02em",
                  color: isActive ? "#ffffff" : "#808080",
                  textDecoration: "none",
                  transition: "color 0.2s ease",
                  borderBottom: isActive ? "1px solid #ffffff" : "1px solid transparent",
                  paddingBottom: "2px",
                }}
              >
                {link.name}
              </Link>
            );
          })}
        </nav>

        {/* Right — outlined pill button ONLY */}
        <Link
          href="/dashboard"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.02em",
            color: "#ffffff",
            textDecoration: "none",
            border: "1px solid #ffffff",
            borderRadius: "100px",
            padding: "6px 16px",
            background: "transparent",
            transition: "background 0.2s ease, color 0.2s ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "#ffffff";
            (e.currentTarget as HTMLElement).style.color = "#000000";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color = "#ffffff";
          }}
        >
          Mission Control
        </Link>
      </div>
    </nav>
  );
}
