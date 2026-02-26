/**
 * Audio feedback for circulation workflows.
 *
 * Uses the Web Audio API to play short tones on checkout/checkin events.
 * Sounds are generated procedurally (no external files needed).
 */

"use client";

import { useCallback, useRef } from "react";

type ToneType = "success" | "error" | "warning" | "info";

const TONE_CONFIGS: Record<ToneType, { freq: number; duration: number; type: OscillatorType }> = {
  success: { freq: 880, duration: 0.12, type: "sine" },
  error: { freq: 220, duration: 0.3, type: "square" },
  warning: { freq: 440, duration: 0.2, type: "triangle" },
  info: { freq: 660, duration: 0.1, type: "sine" },
};

function playTone(ctx: AudioContext, tone: ToneType) {
  const config = TONE_CONFIGS[tone];
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = config.type;
  osc.frequency.setValueAtTime(config.freq, ctx.currentTime);

  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + config.duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + config.duration);
}

export function useCirculationSound() {
  const ctxRef = useRef<AudioContext | null>(null);

  const getContext = useCallback(() => {
    if (!ctxRef.current || ctxRef.current.state === "closed") {
      if (typeof AudioContext === "undefined") return null;
      ctxRef.current = new AudioContext();
    }
    if (ctxRef.current.state === "suspended") {
      void ctxRef.current.resume();
    }
    return ctxRef.current;
  }, []);

  const play = useCallback(
    (tone: ToneType) => {
      const ctx = getContext();
      if (!ctx) return;
      playTone(ctx, tone);
    },
    [getContext]
  );

  return { play };
}
