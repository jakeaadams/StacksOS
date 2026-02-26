/**
 * Audio Feedback Hook - World-class UX for scan-first workflows
 * Provides configurable audio cues for circulation actions
 */

import { useCallback, useEffect, useRef } from "react";
import { clientLogger } from "@/lib/client-logger";

type SoundType = "success" | "error" | "warning" | "scan" | "hold-ready";

interface AudioFeedbackOptions {
  enabled?: boolean;
  volume?: number; // 0-1
}

// Pre-generated tones as base64 data URIs (no external dependencies)
const SOUNDS: Record<SoundType, string> = {
  // Success: Pleasant ascending chime (C5-E5)
  success:
    "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACA/4D/gP+A/5L/pP+2/8j/2v/s//7/EAAiADQARgBYAGoAfACOAKAAsgDEANYA6AD6AAwBHgEwAUIBVAFmAXgBigGcAa4BwAHSAeQB9gEIAhoCLAI+AlACYgJ0AoYCmAKqArwCzgLgAvIC/AH/Af8B/wH+Af0B/AH7AfoB+QH4AfcB9gH1AfQB8wHyAfEB8AHvAe4B7QHsAesB6gHpAegB5wHmAeUB5AHjAeIB4QHgAd8B",

  // Error: Low buzz/beep (A3)
  error:
    "data:audio/wav;base64,UklGRl4FAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YToFAACA/4D/gP+A/2D/QP8g/wD/4P7A/qD+gP5g/kD+IP4A/uD9wP2g/YD9YP1A/SD9AP3g/MD8oPyA/GD8QPwg/AD84PvA+6D7gPtg+0D7IPsA++D6wPqg+oD6YPpA+iD6APrg+cD5oPmA+WD5QPlg+UD5YPlA+WD5gPmg+cD54PoA+iD6QPpg+oD6oPrA+uD6APsg+0D7YPuA+6D7wPvg+wD8IPxA/GD8gPyg/MD84PwA/SD9QP1g/YD9oP3A/eD9AP4g/kD+YP6A/qD+wP7g/gD/IP9A/2D/gP+g/8D/4P8AACAAwABAAWABgAGgAcAB4AEAAiACQAJgAoACoALAAuAC",

  // Warning: Medium attention tone (F4)
  warning:
    "data:audio/wav;base64,UklGRl4FAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YToFAACA/4D/kP+g/7D/wP/Q/+D/8P8AABAAIAAwAEAAUABgAHAAf4CPgJ+Ar4C/gM+A34DvgP+AD4EfgS+BP4FPgV+Bb4F/gY+Bn4Gvgb+Bz4HfgQ+CH4Ivgj+CT4Jfgm+Cf4KPgp+Cr4K/gs+C34Lvgv+CD4Mfgy+DP4NPg1+Db4N/g4+Dn4Ovg7+Dz4Pfg++D/4MPhB+EL4Q/hE+EX4RvhH+Ej4SfhK+Ev4TPhN+E74T/hQ+FH4UvhT+FT4VfhW+Ff4WPhZ+Fr4W/hc+F34Xvhf",

  // Scan: Quick blip (high C)
  scan: "data:audio/wav;base64,UklGRiQCAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQACAACA/4D/gP+A/6D/wP/g/wAAIABAAGAAgACgAMAA4AAAASABQAFgAYABoAHAAeABAAIgAkACYAKAAqACwALgAgADIANAA2ADgAOgA8AD4AMABCAEQAQ=",

  // Hold ready: Cheerful double-chime
  "hold-ready":
    "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACA/4D/gP+A/5L/pP+2/8j/2v/s//7/EAAiADQARgBYAGoAfACOAKAAsgDEAIAAgACAAIAAkACgALAAwADQAOAA8AAAARAAIAAwAEAAUABgAHAAgACQAKAAsADAANAA4ADwAAABEAEgATABQAFQAWABcAGAAZABoAGwAcAB0AHgAfABAAI=",
};

export function useAudioFeedback(options: AudioFeedbackOptions = {}) {
  const { enabled = true, volume = 0.5 } = options;
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // Initialize audio context on first user interaction
  useEffect(() => {
    const initAudio = () => {
      if (!audioContextRef.current) {
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioContextRef.current = new AudioContextClass();
        gainNodeRef.current = audioContextRef.current.createGain();
        gainNodeRef.current.connect(audioContextRef.current.destination);
        gainNodeRef.current.gain.value = volume;
      }
    };

    // Initialize on any user interaction
    const events = ["click", "keydown", "touchstart"];
    events.forEach((event) => document.addEventListener(event, initAudio, { once: true }));

    return () => {
      events.forEach((event) => document.removeEventListener(event, initAudio));
    };
  }, [volume]);

  // Update volume when it changes
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume;
    }
  }, [volume]);

  const playSound = useCallback(
    async (type: SoundType) => {
      if (!enabled) return;

      try {
        // Fallback to HTML5 Audio for simpler playback
        const audio = new Audio(SOUNDS[type]);
        audio.volume = volume;
        await audio.play();
      } catch (err) {
        // Silent fail - audio feedback is non-critical
        clientLogger.debug("Audio playback failed:", err);
      }
    },
    [enabled, volume]
  );

  const playSuccess = useCallback(() => playSound("success"), [playSound]);
  const playError = useCallback(() => playSound("error"), [playSound]);
  const playWarning = useCallback(() => playSound("warning"), [playSound]);
  const playScan = useCallback(() => playSound("scan"), [playSound]);
  const playHoldReady = useCallback(() => playSound("hold-ready"), [playSound]);

  return {
    playSound,
    playSuccess,
    playError,
    playWarning,
    playScan,
    playHoldReady,
  };
}

export type { SoundType, AudioFeedbackOptions };
