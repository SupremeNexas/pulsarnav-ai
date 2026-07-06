"use client";

import { useMemo } from "react";

export function StarField() {
  const stars = useMemo(
    () =>
      Array.from({ length: 150 }, (_, i) => ({
        id: i,
        left: ((i * 37) % 101) + ((i % 3) * 0.17),
        top: ((i * 61) % 97) + ((i % 5) * 0.13),
        size: ((i * 11) % 22) / 10 + 0.6,
        delay: ((i * 7) % 40) / 10,
      })),
    [],
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {stars.map((star) => (
        <span
          key={star.id}
          className="absolute rounded-full bg-cyan-100/80 shadow-[0_0_10px_rgba(56,189,248,0.8)]"
          style={{
            left: `${star.left}%`,
            top: `${star.top}%`,
            width: star.size,
            height: star.size,
            animation: `pulseGlow ${3 + (star.id % 5)}s ease-in-out ${star.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
