"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Activity,
  BarChart3,
  BrainCircuit,
  Database,
  Globe2,
  Orbit,
  RadioTower,
  Rocket,
  Satellite,
} from "lucide-react";
import { Button, Panel } from "@/components/ui";
import { StarField } from "@/components/star-field";
import { features, workflow } from "@/lib/mission-data";

const featureIcons = [Database, RadioTower, Satellite, BarChart3, BrainCircuit, Globe2];

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-radial-space text-text">
      <StarField />
      <div className="absolute inset-0 mission-grid opacity-70" />
      <section className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 md:px-8">
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-300/30 bg-cyan-400/10 shadow-glow">
              <Orbit className="h-5 w-5 text-primary" />
            </div>
            <span className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-100">PulsarNav AI</span>
          </div>
          <Link href="/dashboard" className="hidden text-sm text-slate-300 hover:text-cyan-100 sm:block">
            Mission Dashboard
          </Link>
        </nav>

        <div className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.02fr_0.98fr]">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-medium text-cyan-100">
              <Activity className="h-3.5 w-3.5" />
              NANOGrav 12.5-Year Narrowband Mission Data
            </div>
            <h1 className="max-w-4xl text-5xl font-semibold leading-tight tracking-normal text-white md:text-7xl">
              PulsarNav AI
            </h1>
            <p className="mt-5 max-w-2xl text-xl leading-8 text-slate-300">
              AI-Assisted Autonomous Deep Space Navigation Using Pulsar Timing Data
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/dashboard">
                <Button className="bg-primary text-slate-950 hover:bg-secondary">
                  <Rocket className="h-4 w-4" />
                  Launch Dashboard
                </Button>
              </Link>
              <Link href="/dashboard?view=catalog">
                <Button>
                  <Database className="h-4 w-4" />
                  Explore Dataset
                </Button>
              </Link>
              <Link href="/dashboard?view=simulator">
                <Button>
                  <Satellite className="h-4 w-4" />
                  View Simulation
                </Button>
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15, duration: 0.8 }}
            className="relative mx-auto aspect-square w-full max-w-[560px]"
          >
            <div className="absolute inset-6 rounded-full border border-cyan-300/20" />
            <div className="absolute inset-20 rounded-full border border-sky-300/20" />
            <div className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300/15 blur-xl" />
            <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/50 bg-cyan-400/20 shadow-glow">
              <div className="absolute left-1/2 top-1/2 h-2 w-52 origin-left -translate-y-1/2 bg-gradient-to-r from-cyan-200 to-transparent" />
              <div className="absolute left-1/2 top-1/2 h-2 w-52 origin-left -translate-y-1/2 rotate-90 bg-gradient-to-r from-cyan-200 to-transparent" />
            </div>
            <div className="absolute left-1/2 top-1/2 h-5 w-5 animate-orbit rounded bg-white shadow-glow" />
            <div className="absolute bottom-10 right-10 rounded-lg border border-cyan-300/25 bg-slate-950/70 px-4 py-3 text-xs text-cyan-100">
              Spacecraft orbit solution locked
            </div>
          </motion.div>
        </div>
      </section>

      <section className="relative mx-auto grid max-w-7xl gap-4 px-5 pb-12 md:grid-cols-2 lg:grid-cols-3">
        {features.map((feature, index) => {
          const Icon = featureIcons[index];
          return (
            <Panel key={feature} className="min-h-36">
              <Icon className="mb-4 h-6 w-6 text-primary" />
              <h2 className="text-lg font-semibold">{feature}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Research-grade module for autonomous pulsar navigation, mission analytics, and reproducible simulation.
              </p>
            </Panel>
          );
        })}
      </section>

      <section className="relative mx-auto max-w-7xl px-5 pb-20">
        <Panel>
          <h2 className="text-2xl font-semibold">Project Workflow</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-6">
            {workflow.map((step, index) => (
              <div key={step} className="relative rounded-md border border-slate-700/70 bg-slate-950/40 p-4">
                <span className="text-xs text-primary">0{index + 1}</span>
                <p className="mt-2 text-sm font-medium text-slate-100">{step}</p>
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </main>
  );
}
