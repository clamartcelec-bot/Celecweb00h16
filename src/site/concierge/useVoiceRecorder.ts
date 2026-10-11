import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderError = 'denied' | 'unsupported' | 'no-device' | 'failed';
export interface Recording { blob: Blob; mime: string; durationMs: number }

const MAX_MS = 60_000;
const MIC_OK_KEY = 'celec-mic-ok';

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}

export function micAlreadyExplained() {
  try { return localStorage.getItem(MIC_OK_KEY) === '1'; } catch { return false; }
}

export function rememberMicExplained() {
  try { localStorage.setItem(MIC_OK_KEY, '1'); } catch { /* storage unavailable */ }
}

export function useVoiceRecorder(onAutoStop: (rec: Recording | null) => void) {
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const raf = useRef(0);
  const limit = useRef<number | undefined>(undefined);
  const resolver = useRef<((rec: Recording | null) => void) | null>(null);
  const autoStop = useRef(onAutoStop);
  autoStop.current = onAutoStop;

  const release = useCallback(() => {
    cancelAnimationFrame(raf.current);
    window.clearTimeout(limit.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    recorder.current = null;
    setRecording(false);
    setLevel(0);
  }, []);

  const finish = useCallback((keep: boolean): Promise<Recording | null> => {
    const rec = recorder.current;
    if (!rec || rec.state === 'inactive') { release(); return Promise.resolve(null); }
    return new Promise((resolve) => {
      resolver.current = keep ? resolve : () => resolve(null);
      rec.stop();
    });
  }, [release]);

  const start = useCallback(async (): Promise<RecorderError | null> => {
    if (recorder.current) return null;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return 'unsupported';
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      const name = (err as DOMException)?.name;
      return name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotFoundError' ? 'no-device' : 'failed';
    }
    rememberMicExplained();
    const mime = pickMime();
    const rec = new MediaRecorder(media, mime ? { mimeType: mime } : undefined);
    stream.current = media;
    recorder.current = rec;
    chunks.current = [];
    startedAt.current = performance.now();
    rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    rec.onstop = () => {
      const type = rec.mimeType || mime || 'audio/webm';
      const result = { blob: new Blob(chunks.current, { type }), mime: type, durationMs: performance.now() - startedAt.current };
      release();
      const done = resolver.current;
      resolver.current = null;
      if (done) done(result); else autoStop.current(result);
    };
    rec.start(250);
    setRecording(true);

    try {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(media).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!stream.current) { void ctx.close(); return; }
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(Math.min(1, peak / 64));
        raf.current = requestAnimationFrame(tick);
      };
      tick();
    } catch { /* level meter is optional */ }

    limit.current = window.setTimeout(() => { if (recorder.current?.state === 'recording') recorder.current.stop(); }, MAX_MS);
    return null;
  }, [release]);

  useEffect(() => () => {
    if (recorder.current?.state === 'recording') {
      resolver.current = () => {};
      recorder.current.stop();
    }
    release();
  }, [release]);

  return { recording, level, start, stop: () => finish(true), cancel: () => { void finish(false); } };
}
