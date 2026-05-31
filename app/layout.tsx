import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PulsarNav AI",
  description: "Autonomous pulsar-based deep space navigation framework",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
