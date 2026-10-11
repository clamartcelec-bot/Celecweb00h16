const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/realtime-session`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export type RealtimeEvent = { type: string } & Record<string, unknown>;
export type MicError = 'denied' | 'unsupported' | 'no-device' | 'failed';

export interface RealtimeLink {
  send(event: Record<string, unknown>): void;
  attachMic(): Promise<MicError | null>;
  setMicOpen(open: boolean): void;
  releaseMic(): void;
  hasMic(): boolean;
  setMuted(muted: boolean): void;
  outputLevel(): number;
  inputLevel(): number;
  close(): void;
}

function analyser(ctx: AudioContext, stream: MediaStream) {
  const node = ctx.createAnalyser();
  node.fftSize = 256;
  ctx.createMediaStreamSource(stream).connect(node);
  const data = new Uint8Array(node.frequencyBinCount);
  return () => {
    node.getByteTimeDomainData(data);
    let peak = 0;
    for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
    return Math.min(1, peak / 48);
  };
}

/** Opens a WebRTC session with the voice model. The mic is attached later, on the first press. */
export async function openRealtimeLink(onEvent: (event: RealtimeEvent) => void, onDrop: () => void, muted: boolean): Promise<RealtimeLink> {
  const pc = new RTCPeerConnection();
  const audio = new Audio();
  audio.autoplay = true;
  audio.muted = muted;
  let ctx: AudioContext | null = null;
  let readOut = () => 0;
  let readIn = () => 0;
  let mic: MediaStreamTrack | null = null;
  let closed = false;

  pc.ontrack = (e) => {
    audio.srcObject = e.streams[0];
    try {
      ctx = ctx ?? new AudioContext();
      readOut = analyser(ctx, e.streams[0]);
    } catch { /* mouth animation is optional */ }
  };
  const transceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
  const channel = pc.createDataChannel('oai-events');
  channel.onmessage = (e) => {
    try { onEvent(JSON.parse(e.data) as RealtimeEvent); } catch { /* ignore malformed event */ }
  };
  pc.onconnectionstatechange = () => {
    if (!closed && (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed')) onDrop();
  };

  const opened = new Promise<void>((resolve, reject) => {
    channel.onopen = () => resolve();
    window.setTimeout(() => reject(new Error('timeout')), 15_000);
  });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({ sdp: offer.sdp }),
  });
  const answer = await res.text();
  if (!res.ok || !answer.startsWith('v=0')) {
    pc.close();
    throw new Error('session_failed');
  }
  await pc.setRemoteDescription({ type: 'answer', sdp: answer });
  try {
    await opened;
  } catch (err) {
    pc.close();
    throw err;
  }

  const releaseMic = () => {
    mic?.stop();
    mic = null;
    readIn = () => 0;
    void transceiver.sender.replaceTrack(null);
  };

  return {
    send(event) {
      if (channel.readyState === 'open') channel.send(JSON.stringify(event));
    },
    async attachMic() {
      if (mic) return null;
      if (!navigator.mediaDevices?.getUserMedia) return 'unsupported';
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        mic = stream.getAudioTracks()[0];
        mic.enabled = false;
        await transceiver.sender.replaceTrack(mic);
        try {
          ctx = ctx ?? new AudioContext();
          readIn = analyser(ctx, stream);
        } catch { /* level meter is optional */ }
        return null;
      } catch (err) {
        const name = (err as DOMException)?.name;
        return name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotFoundError' ? 'no-device' : 'failed';
      }
    },
    setMicOpen(open) {
      if (mic) mic.enabled = open;
    },
    releaseMic,
    hasMic: () => Boolean(mic),
    setMuted(value) {
      audio.muted = value;
    },
    outputLevel: () => readOut(),
    inputLevel: () => (mic?.enabled ? readIn() : 0),
    close() {
      closed = true;
      releaseMic();
      channel.close();
      pc.close();
      audio.srcObject = null;
      void ctx?.close();
    },
  };
}
