import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { JetBrains_Mono } from "next/font/google";
import "../styles/globals.css";
import { TopNavigation } from "@/components/top-navigation";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "700", "900"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "PulsarNav AI | Autonomous Deep Space Navigation",
  description:
    "A precision XNAV navigation platform implementing Extended Kalman Filtering on millisecond pulsar signals for autonomous spacecraft positioning.",
  keywords: ["XNAV", "pulsar navigation", "deep space", "EKF", "spacecraft", "NANOGrav"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
      style={{ fontFamily: "var(--font-sans)" }}
    >
      <head>
        {/* Prevent any flash of unstyled content */}
        <meta name="color-scheme" content="dark" />
      </head>
      <body className="antialiased bg-void text-paper" suppressHydrationWarning>
        {/* Scanline overlay — single subtle CRT texture */}
        <div className="scanline" aria-hidden="true" />
        <TopNavigation />
        {/* pt-16 to clear fixed nav */}
        <main className="pt-16 min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
