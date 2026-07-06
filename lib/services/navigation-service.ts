import { propagateRK4, getMissionInitialState, Vec3 } from "../physics-engine";

export interface SimulationConfig {
  missionType: string;
  algorithm: string;
  measurementNoise: number;
  selectedPulsars: string[];
}

export interface TelemetrySample {
  trial: number;
  truePosition: Vec3;
  trueVelocity: Vec3;
  estimated: Vec3;
  errorKm: number;
}

export interface SimulationResult {
  config: {
    missionType: string;
    algorithm: string;
    measurementNoise: number;
  };
  pulsars: string[];
  samples: TelemetrySample[];
}

export class NavigationService {
  private static apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
  private static useLiveApi = process.env.NEXT_PUBLIC_USE_LIVE_API === "true";

  /**
   * Fetches or runs an orbit simulation based on configurations.
   */
  public static async runSimulation(config: SimulationConfig): Promise<SimulationResult> {
    if (this.useLiveApi) {
      try {
        const response = await fetch(`${this.apiUrl}/api/navigation-lab`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            region: config.missionType.toLowerCase().replace(/ /g, "_"),
            algorithm: config.algorithm,
            noise_ns: config.measurementNoise,
            pulsars: config.selectedPulsars,
          }),
        });

        if (!response.ok) {
          throw new Error(`API response error: ${response.status}`);
        }

        return await response.json();
      } catch (error) {
        console.warn("Live API call failed. Falling back to local physics simulator.", error);
      }
    }

    // Client-side local physics simulation fallback (RK4 + Convergence Noise)
    return this.runLocalSimulation(config);
  }

  /**
   * Run local physics simulation (RK4 orbit propagation + EKF convergence modeling).
   */
  private static runLocalSimulation(config: SimulationConfig): SimulationResult {
    const initialState = getMissionInitialState(config.missionType);
    const samples: TelemetrySample[] = [];
    let r = [...initialState.r0] as Vec3;
    let v = [...initialState.v0] as Vec3;
    const dt = initialState.dt;
    const steps = initialState.totalSteps;

    const initialError = 1500; // km
    const decayRate = config.algorithm === "EKF" ? 0.03 : 0;
    const baseNoise = (config.measurementNoise / 100) * (3 / Math.sqrt(config.selectedPulsars.length || 1));

    for (let step = 0; step < steps; step++) {
      // Propagate true state via RK4
      const nextState = propagateRK4(r, v, dt, config.missionType);
      r = nextState.r;
      v = nextState.v;

      // Simulate estimation error
      let errorMagnitude = 0;
      if (config.algorithm === "EKF") {
        errorMagnitude = initialError * Math.exp(-decayRate * step) + (Math.random() - 0.5) * 5 + baseNoise;
      } else {
        errorMagnitude = baseNoise * 15 + (Math.random() - 0.5) * 20;
      }
      errorMagnitude = Math.max(0.5, errorMagnitude);

      // Distribute error vector randomly on a sphere
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.acos(2 * Math.random() - 1);
      const ex = errorMagnitude * Math.sin(phi) * Math.cos(theta);
      const ey = errorMagnitude * Math.sin(phi) * Math.sin(theta);
      const ez = errorMagnitude * Math.cos(phi);

      const estimated: Vec3 = [r[0] + ex, r[1] + ey, r[2] + ez];

      samples.push({
        trial: step,
        truePosition: [...r],
        trueVelocity: [...v],
        estimated,
        errorKm: errorMagnitude,
      });
    }

    return {
      config: {
        missionType: config.missionType,
        algorithm: config.algorithm,
        measurementNoise: config.measurementNoise,
      },
      pulsars: config.selectedPulsars,
      samples,
    };
  }
}
