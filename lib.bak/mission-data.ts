export const kpis = [
  { label: "Total Pulsars", value: "47", delta: "+12.5 yr DR", tone: "primary" },
  { label: "Available TOAs", value: "415,122", delta: "narrowband", tone: "secondary" },
  { label: "Navigation Accuracy", value: "0.04 km", delta: "100 ns model", tone: "success" },
  { label: "Selected Pulsars", value: "6", delta: "WLS active", tone: "warning" },
];

export const topPulsars = [
  { name: "J0613-0200", rank: 1, stability: 98, score: 88.7, accuracy: 0.031, ra: 93.43, dec: -2.01, freq: 326.6, period: 3.06 },
  { name: "J1713+0747", rank: 2, stability: 99, score: 83.6, accuracy: 0.036, ra: 258.46, dec: 7.79, freq: 218.8, period: 4.57 },
  { name: "J1909-3744", rank: 3, stability: 96, score: 83.1, accuracy: 0.038, ra: 287.45, dec: -37.74, freq: 339.3, period: 2.95 },
  { name: "J1744-1134", rank: 4, stability: 99, score: 77.5, accuracy: 0.044, ra: 266.12, dec: -11.58, freq: 245.4, period: 4.07 },
  { name: "J1012+5307", rank: 5, stability: 98, score: 77.1, accuracy: 0.048, ra: 153.14, dec: 53.12, freq: 190.3, period: 5.26 },
  { name: "J0030+0451", rank: 6, stability: 99, score: 75.8, accuracy: 0.051, ra: 7.61, dec: 4.86, freq: 205.5, period: 4.87 },
  { name: "J2317+1439", rank: 7, stability: 99, score: 75.5, accuracy: 0.054, ra: 349.29, dec: 14.66, freq: 290.3, period: 3.45 },
  { name: "J1640+2224", rank: 8, stability: 99, score: 75.5, accuracy: 0.056, ra: 250.07, dec: 22.4, freq: 316.1, period: 3.16 },
];

export const errorCurve = [
  { noise: 10, error: 0.004, pulsars4: 0.008, pulsars6: 0.004, pulsars8: 0.003 },
  { noise: 50, error: 0.021, pulsars4: 0.041, pulsars6: 0.021, pulsars8: 0.016 },
  { noise: 100, error: 0.043, pulsars4: 0.083, pulsars6: 0.043, pulsars8: 0.031 },
  { noise: 500, error: 0.214, pulsars4: 0.416, pulsars6: 0.214, pulsars8: 0.157 },
  { noise: 1000, error: 0.428, pulsars4: 0.832, pulsars6: 0.428, pulsars8: 0.314 },
];

export const countCurve = [
  { count: 4, error: 0.083 },
  { count: 5, error: 0.057 },
  { count: 6, error: 0.043 },
  { count: 7, error: 0.036 },
  { count: 8, error: 0.031 },
];

export const logs = [
  { time: "T+00:12:44", event: "WLS navigation solution converged", status: "Nominal" },
  { time: "T+00:11:08", event: "Pulsar set optimized for 6-source geometry", status: "Nominal" },
  { time: "T+00:08:39", event: "TOA residual distribution refreshed", status: "Review" },
  { time: "T+00:04:21", event: "Deep-space region Monte Carlo batch complete", status: "Nominal" },
];

export const toaRows = [
  { pulsar: "J1713+0747", mjd: 53343.69043, frequency: 1442, error: 0.066, observatory: "AO" },
  { pulsar: "J1909-3744", mjd: 53420.48727, frequency: 1382, error: 0.051, observatory: "GBT" },
  { pulsar: "J0613-0200", mjd: 53628.90394, frequency: 2382, error: 0.112, observatory: "AO" },
  { pulsar: "J1744-1134", mjd: 53715.67146, frequency: 1414, error: 0.084, observatory: "GBT" },
  { pulsar: "J1012+5307", mjd: 53800.37685, frequency: 792, error: 0.231, observatory: "AO" },
];

export const simulations = [
  { id: "SIM-2048", region: "Earth-Moon", algorithm: "Weighted LS", pulsars: 6, error: "0.043 km", state: "Complete" },
  { id: "SIM-2049", region: "Deep Space", algorithm: "Least Squares", pulsars: 8, error: "0.031 km", state: "Running" },
  { id: "SIM-2050", region: "Earth Orbit", algorithm: "Weighted LS", pulsars: 5, error: "0.057 km", state: "Queued" },
];

export const workflow = [
  "Data Acquisition",
  "Pulsar Catalog Creation",
  "TOA Processing",
  "Navigation Computation",
  "Error Analysis",
  "Visualization",
];

export const features = [
  "Pulsar Catalog Engine",
  "TOA Processing",
  "Navigation Engine",
  "Error Analysis",
  "Pulsar Selection AI",
  "Deep Space Visualization",
];
