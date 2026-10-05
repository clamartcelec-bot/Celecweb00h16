import { useEffect, useRef, useState } from 'react';

export const AUDIO_BAR_COUNT = 7;
const restLevels = () => Array.from({ length: AUDIO_BAR_COUNT }, () => 0.08);

/** Remote RMS drives the mouth. The visual bars' decorative floor is never used. */
export function useAudioLevels(
  input: MediaStream | null,
  output: MediaStream | null,
  onOutputAmplitude?: (value: number) => void,
) {
  const [inputLevels, setInputLevels] = useState<number[]>(restLevels);
  const [outputLevels, setOutputLevels] = useState<number[]>(restLevels);
  const callback = useRef(onOutputAmplitude);
  callback.current = onOutputAmplitude;

  useEffect(() => {
    setInputLevels(restLevels());
    setOutputLevels(restLevels());
    callback.current?.(0);
    const AudioCtx = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx || (!input && !output)) return;

    let context: AudioContext;
    try { context = new AudioCtx(); } catch { return; }
    void context.resume().catch(() => {});
    const meters: Array<{
      analyser: AnalyserNode;
      source: MediaStreamAudioSourceNode;
      frequency: Uint8Array<ArrayBuffer>;
      samples: Float32Array<ArrayBuffer>;
      remote: boolean;
      apply: (values: number[]) => void;
    }> = [];
    const cleanups: Array<() => void> = [];

    const watch = (stream: MediaStream | null, remote: boolean, apply: (values: number[]) => void) => {
      if (!stream) return;
      let meter: typeof meters[number] | undefined;
      const rebuild = () => {
        if (meter) {
          meter.source.disconnect();
          meter.analyser.disconnect();
          meters.splice(meters.indexOf(meter), 1);
          meter = undefined;
        }
        apply(restLevels());
        if (remote) callback.current?.(0);
        if (!stream.getAudioTracks().some(track => track.readyState === 'live')) return;
        try {
          const analyser = context.createAnalyser();
          analyser.fftSize = 512;
          analyser.smoothingTimeConstant = 0.72;
          const source = context.createMediaStreamSource(stream);
          source.connect(analyser); // No destination: audio already plays through remoteAudioEl.
          meter = { analyser, source, remote, apply,
            frequency: new Uint8Array(analyser.frequencyBinCount),
            samples: new Float32Array(analyser.fftSize) };
          meters.push(meter);
          void context.resume().catch(() => {});
        } catch { /* Keep the avatar at rest on browsers without audio analysis. */ }
      };
      // The RTP track often arrives after the session has been returned.
      stream.addEventListener('addtrack', rebuild);
      stream.addEventListener('removetrack', rebuild);
      rebuild();
      cleanups.push(() => {
        stream.removeEventListener('addtrack', rebuild);
        stream.removeEventListener('removetrack', rebuild);
      });
    };
    watch(input, false, setInputLevels);
    watch(output, true, setOutputLevels);
    let frame = 0;
    let lastBars = 0;
    const tick = (time: number) => {
      const updateBars = time - lastBars >= 50;
      if (updateBars) lastBars = time;
      for (const meter of meters) {
        if (meter.remote) {
          meter.analyser.getFloatTimeDomainData(meter.samples);
          const rms = Math.sqrt(meter.samples.reduce((sum, value) => sum + value * value, 0) / meter.samples.length);
          callback.current?.(Math.min(1, Math.max(0, (rms - 0.008) * 5)));
        }
        if (updateBars) {
          meter.analyser.getByteFrequencyData(meter.frequency);
          const step = Math.floor(meter.frequency.length / AUDIO_BAR_COUNT);
          meter.apply(Array.from({ length: AUDIO_BAR_COUNT }, (_, index) => {
            let sum = 0;
            for (let j = 0; j < step; j++) sum += meter.frequency[index * step + j];
            return Math.min(1, Math.max(0.08, Math.pow(sum / step / 255 * 2.6, 0.75)));
          }));
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      cleanups.forEach(cleanup => cleanup());
      meters.forEach(meter => { meter.source.disconnect(); meter.analyser.disconnect(); });
      void context.close().catch(() => {});
      callback.current?.(0);
    };
  }, [input, output]);

  return { inputLevels, outputLevels };
}
