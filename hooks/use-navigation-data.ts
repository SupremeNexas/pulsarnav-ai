import { useCallback, useEffect, useMemo, useState } from "react";
import { NavigationService, SimulationConfig, SimulationResult } from "../lib/services/navigation-service";

export function useNavigationData(config: SimulationConfig) {
  const [simulationData, setSimulationData] = useState<SimulationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Trigger simulation fetch
  const triggerSimulation = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await NavigationService.runSimulation(config);
      setSimulationData(data);
      setCurrentFrame(0);
      setIsPlaying(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fetch simulation data");
    } finally {
      setIsLoading(false);
    }
  }, [config]);

  // Run simulation when configuration changes
  useEffect(() => {
    triggerSimulation();
  }, [triggerSimulation]);

  // Playback timer loop
  useEffect(() => {
    if (!isPlaying || !simulationData) return;

    const intervalTime = 100 / playbackSpeed;
    const timer = setInterval(() => {
      setCurrentFrame((prev) => {
        if (prev >= simulationData.samples.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed, simulationData]);

  // Derived properties
  const activeSample = useMemo(() => {
    if (!simulationData) return null;
    return simulationData.samples[currentFrame] || null;
  }, [simulationData, currentFrame]);

  const metrics = useMemo(() => {
    if (!simulationData) return { avgError: 0, maxError: 0, finalError: 0 };
    const errors = simulationData.samples.map((s) => s.errorKm);
    const avgError = errors.reduce((a, b) => a + b, 0) / errors.length;
    const maxError = Math.max(...errors);
    const finalError = errors[errors.length - 1];
    return { avgError, maxError, finalError };
  }, [simulationData]);

  const chartData = useMemo(() => {
    if (!simulationData) return [];
    return simulationData.samples.slice(0, currentFrame + 1).map((s) => ({
      step: s.trial,
      error: s.errorKm,
    }));
  }, [simulationData, currentFrame]);

  return {
    simulationData,
    isLoading,
    error,
    currentFrame,
    setCurrentFrame,
    isPlaying,
    setIsPlaying,
    playbackSpeed,
    setPlaybackSpeed,
    activeSample,
    metrics,
    chartData,
    triggerSimulation,
  };
}
