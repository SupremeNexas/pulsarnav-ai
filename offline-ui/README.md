# PulsarNav AI - Offline Static Portal Manual

This directory contains a standalone, offline-only user interface layer for the PulsarNav AI project. It runs entirely inside your browser without Node.js, npm, or local web servers.

---

## File Structure

- **`index.html`** - The primary HTML layout containing the control console and dashboard tabs.
- **`styles.css`** - Curated aerospace styling, responsive grid, custom HSL color palettes, and Dark/Light Mode selectors.
- **`app.js`** - Client-side state manager handling page routing, SVG plotting, drag-to-rotate 3D orbit visuals, and CSV loading.
- **`data/`** - Precompiled data outputs to bypass browser-level local CORS blocks:
  - `pulsar_catalog.js` - Reference candidates.
  - `ranked_pulsars.js` - Scoring indices.
  - `navigation_summary.js` - Monte Carlo grid results.
  - `spacecraft_trajectory.js` - Reference orbits.
  - `xray_nav_validation.js` - EKF validation convergence run.

---

## How to Open and Use

1. Locate the directory `offline-ui/` on your system:
   `/Users/supryo/Desktop/pulsar/offline-ui`
2. **Double-click `index.html`** to open it directly in your browser. (Supports Chrome, Safari, Firefox, Edge, etc.)
3. Use the left sidebar to navigate between tabs:
   - **Dashboard**: High-level EKF errors and convergence.
   - **Pulsar Catalog**: Sortable tables and a celestial sky map projection.
   - **TOA Measurements**: Dynamic receiver noise simulators and folded profiles.
   - **Navigation Lab**: Spacecraft coordinate plots across different regions.
   - **Error Analysis**: Monte Carlo parameters comparison grid.
   - **3D Space View**: Interactive orbit visualizer. Click and drag your mouse to rotate the 3D scene, or scroll to zoom.
   - **Comparison Lab**: Comparative error curves vs Cramér-Rao Lower Bounds.
   - **Settings**: Dynamic light/dark theme toggles and a drag-and-drop file importer.

---

## Updating Precompiled Datasets

If you run new Python simulation runs and want to refresh the pre-loaded offline console charts:

1. Open your terminal in the repository root:
   `cd /Users/supryo/Desktop/pulsar`
2. Run the automated data compiler script:
   `python3 scripts/generate_offline_data.py`
3. Reload your browser page to see the updated figures.

---

## Direct File Import (No Refresh Required)

You can also import new `.csv` output logs directly at runtime without editing code:
1. Navigate to the **Settings** tab.
2. Locate the dashed **Custom Data Import Portal** box.
3. Drag-and-drop any output file from your `/Users/supryo/Desktop/pulsar/output/` directory (e.g. `xray_nav_validation.csv` or `pulsar_catalog.csv`).
4. The dashboard charts, tables, and 3D scenes will immediately parse the file and update dynamically!
