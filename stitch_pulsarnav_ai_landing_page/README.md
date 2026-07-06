# PulsarNav AI — Premium Standalone Landing Page & Simulation Console

A premium standalone frontend demonstrator for the **PulsarNav AI** autonomous deep space spacecraft navigation system. The visual and interface language is built on the **Index — Style Reference** blueprint design guidelines (matte surfaces, wireframe blueprints on a dark light table, periwinkle annotation, and solid layout sectioning with dashed borders).

This dashboard operates entirely on the client side, running actual Runge-Kutta 4th-order (RK4) dynamics propagation and EKF convergence models to simulate deep space navigation coordinates realistically.

---

## Project Structure

```
stitch_pulsarnav_ai_landing_page/
├── app/
│   ├── comparison/
│   │   └── page.tsx        # Conventional DSN vs XNAV comparison lab
│   ├── dashboard/
│   │   └── page.tsx        # Interactive mission control & EKF simulator
│   ├── documentation/
│   │   └── page.tsx        # Scientific article and mathematics viewer
│   ├── geometry/
│   │   └── page.tsx        # Observability & GDOP analysis console
│   ├── layout.tsx          # Root layout and theme setups
│   └── page.tsx            # Landing page (hero spotlight radial wash)
├── components/
│   ├── space-scene.tsx     # 3D R3F orbital trajectory & celestial rays visualizer
│   └── top-navigation.tsx  # Sticky technical top navigation bar
├── lib/
│   ├── physics-engine.ts   # Astrodynamics engine: RK4 propagation, gravity, etc.
│   ├── pulsar-catalogue.ts # NANOGrav 12.5y pulsar entries & ground visibility constants
│   └── utils.ts            # Classnames consolidation (cn) and number formatting
├── styles/
│   └── globals.css         # Theme overrides and CSS variables
├── package.json            # Node dependencies (Next.js 15, Three.js, Recharts, Tailwind v3)
├── tailwind.config.ts      # Theme color tokens mapping
├── tsconfig.json           # TS compiling configurations
└── README.md               # Project documentation
```

---

## Installation & Setup

1. Navigate to the standalone project directory:
   ```bash
   cd stitch_pulsarnav_ai_landing_page
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

---

## Development

Run the development server locally:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to view the application.

---

## Build Process

Compile and bundle the production assets:
```bash
npm run build
```

Verify that there are no compilation or static type-checking errors.

## API Configuration & Environment Variables

This project is built as an online-first web application. Data consumption is fully abstracted behind a service layer (`lib/services/navigation-service.ts`) and custom hooks (`hooks/use-navigation-data.ts`).

To toggle between mock client-side RK4 propagation and a live API backend, configure the following environment variables:

```bash
# Set to 'true' to call live FastAPI/Next.js routes. Set to 'false' for offline client-side simulation.
NEXT_PUBLIC_USE_LIVE_API=false

# The base URL of the active production API.
NEXT_PUBLIC_API_URL=https://api.pulsarnav-ai.space
```

Create a `.env.local` file in the root directory for local overrides.

---

## Production Deployment

### 1. Vercel / Netlify / Cloudflare Pages
This is a standard Next.js application that can be deployed with one click:
- **Build Command**: `next build`
- **Output Directory**: `.next`
- **Environment Variables**: Add `NEXT_PUBLIC_USE_LIVE_API` and `NEXT_PUBLIC_API_URL` under your project settings.

### 2. Containerized Hosting (Railway / Render / AWS)
A `Dockerfile` can be used to compile and serve the production build:
```dockerfile
FROM node:18-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
```

---

## Integration with PulsarNav AI

When integrating this project into the production PulsarNav AI repository:
1. **API Router Mapping**: Set `NEXT_PUBLIC_USE_LIVE_API=true` and point the `NEXT_PUBLIC_API_URL` to your production API gateway to instantly route dashboard controls to the Python Extended Kalman Filter.
2. **Design System Merge**: Move the CSS variables in `styles/globals.css` and the theme configurations in `tailwind.config.ts` into the main application configurations.
3. **Physics Engine Alignment**: The client-side physics propagation inside `lib/physics-engine.ts` is fully consistent with the math equations used in the main repo's core package `pulsar_nav`, facilitating seamless coordinate data sync.
