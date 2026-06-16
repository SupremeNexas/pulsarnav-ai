# Context

- **Current Task**: Completed Navigation Lab & SpaceScene visualizer repair pass (Tailwind RGB opacity compile fix, label collision resolution, zoom-aware tags, real-time control toggles, layout height stretch).
- **Key Decisions**:
  - Configured comma-separated RGB variables in `globals.css` and `tailwind.config.ts` to solve Tailwind v3 opacity-modifier compilation issues for theme colors.
  - Implemented priority-based 2D screen box overlap shifting (22px step-down) in the 60fps label projection frame loop.
  - Integrated zoom-aware checks (`cameraDistance > 11.5`) and hover exceptions to automatically show/hide secondary pulsar tags.
- **Next Steps**:
  - Connect the TOA Timing Residuals page skeleton to an active WebSockets/SSE stream from the backend.
  - Render 3D error covariance ellipsoids inside Three.js space visualizer scene.
  - Optimize the Monte Carlo execution loop with web workers or parallel thread pools.
