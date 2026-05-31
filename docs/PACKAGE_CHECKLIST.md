# Frontend Package Verification Checklist

Use this checklist after `npm install`.

- `next`, `react`, and `react-dom` are installed and version-compatible.
- `typescript`, `tailwindcss`, `postcss`, and `autoprefixer` are present for the frontend toolchain.
- `lucide-react` is installed for dashboard icons.
- `framer-motion` is installed for UI animation.
- `three` and `@react-three/fiber` are installed for 3D space visualization.
- `recharts`, `plotly.js`, and `react-plotly.js` are installed for charts.
- `clsx` and `tailwind-merge` are installed for class-name composition.
- `package-lock.json` is committed for reproducible npm installs.
- `node_modules/` is not committed.
- `npm run build` completes before pushing.
