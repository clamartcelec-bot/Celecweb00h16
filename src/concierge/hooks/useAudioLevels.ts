import { useEffect, useRef, useState } from 'react';

export const AUDIO_BAR_COUNT = 7;

function restLevels() {
  return Array.from({ length: AUDIO_BAR_COUNT }, () => 0.08);
}

export function useAudioLevels(input: MediaStream | null, output: MediaStream | null) {
  const [inputLevels, setInputLevels] = useState<number[]>(restLevels);
  const [outputLevels, setOutputLevels] = useState<number[]>(restLevels);
  const inputRef = useRef(input);
  const outputRef = useRef(output);
  inputRef.current = input;
  outputRef.current = output;

  useEffect(() => {
    if (!input && !output) {
      setInputLevels(restLevels());
      setOutputLevels(restLevels());
      return;
    }

    const AudioCtx = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const contexts: AudioContext[] = [];
    const meters: Array<{ analyser: AnalyserNode; apply: (values: number[]) => void }> = [];

    const attach = (stream: MediaStream | null, apply: (values: number[]) => void) => {
      if (!stream || !stream.getAudioTracks().length) return;
      try {
        const ctx = new AudioCtx();
        void ctx.resume();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.72;
        ctx.createMediaStreamSource(stream).connect(analyser);
        contexts.push(ctx);
        meters.push({ analyser, apply });
      } catch {
        // navigateur sans Web Audio : on garde les barres au repos
      }
    };

    attach(input, setInputLevels);
    attach(output, setOutputLevels);

    if (!meters.length) return;

    const buffer = new Uint8Array(256);
    const step = Math.floor(buffer.length / AUDIO_BAR_COUNT) || 1;
    let frame = 0;

    const tick = () => {
      for (const meter of meters) {
        meter.analyser.getByteFrequencyData(buffer);
        const next: number[] = [];
        for (let i = 0; i < AUDIO_BAR_COUNT; i += 1) {
          let sum = 0;
          for (let j = 0; j < step; j += 1) sum += buffer[i * step + j] ?? 0;
          const average = sum / step / 255;
          next.push(Math.min(1, Math.max(0.08, Math.pow(average * 2.6, 0.75))));
        }
        meter.apply(next);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      meters.length = 0;
      contexts.forEach((ctx) => { void ctx.close(); });
      setInputLevels(restLevels());
      setOutputLevels(restLevels());
    };
  }, [input, output]);

  return { inputLevels, outputLevels };
}
