export interface WebRTCSession {
  pc: RTCPeerConnection;
  dc: RTCDataChannel;
  localStream: MediaStream;
  remoteAudioEl: HTMLAudioElement;
}

export type DataChannelMessage = {
  type: string;
  [key: string]: unknown;
};

export async function requestMicrophone(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ audio: true });
}

export async function createRealtimeSession(
  localStream: MediaStream,
  onDataMessage: (msg: DataChannelMessage) => void,
  onConnectionStateChange: (state: RTCPeerConnectionState) => void,
): Promise<WebRTCSession> {
  const pc = new RTCPeerConnection();

  pc.addEventListener('connectionstatechange', () => {
    console.log('connectionState:', pc.connectionState);
    onConnectionStateChange(pc.connectionState);
  });
  pc.addEventListener('iceconnectionstatechange', () => {
    console.log('iceConnectionState:', pc.iceConnectionState);
  });
  pc.addEventListener('icegatheringstatechange', () => {
    console.log('iceGatheringState:', pc.iceGatheringState);
  });
  pc.addEventListener('signalingstatechange', () => {
    console.log('signalingState:', pc.signalingState);
  });

  const remoteAudioEl = new Audio();
  remoteAudioEl.autoplay = true;

  pc.ontrack = (event) => {
    console.log('Remote track received:', event.track.kind);
    const remoteStream = event.streams?.[0] || new MediaStream([event.track]);
    remoteAudioEl.srcObject = remoteStream;
  };

  for (const track of localStream.getTracks()) {
    pc.addTrack(track, localStream);
  }

  const dc = pc.createDataChannel('oai-events', { ordered: true });

  dc.addEventListener('open', () => {
    console.log('Realtime data channel open');
  });

  dc.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(event.data);
      console.log('Realtime event:', msg.type);
      onDataMessage(msg);
    } catch {
      // ignore non-JSON
    }
  });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  if (!offer.sdp) {
    throw new Error('No SDP offer generated');
  }

  const response = await fetch('/.netlify/functions/realtime-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sdp: offer.sdp }),
  });

  if (!response.ok) {
    pc.close();
    localStream.getTracks().forEach((t) => t.stop());
    const errText = await response.text();
    throw new Error(`Realtime backend failed (${response.status}): ${errText}`);
  }

  const answerSdp = await response.text();

  if (!answerSdp.startsWith('v=0')) {
    pc.close();
    localStream.getTracks().forEach((t) => t.stop());
    throw new Error(`Backend did not return SDP: ${answerSdp.slice(0, 300)}`);
  }

  await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

  return { pc, dc, localStream, remoteAudioEl };
}

export function closeSession(session: WebRTCSession | null) {
  if (!session) return;
  try { session.dc.close(); } catch { /* already closed */ }
  session.localStream.getTracks().forEach((t) => t.stop());
  session.remoteAudioEl.pause();
  session.remoteAudioEl.srcObject = null;
  try { session.pc.close(); } catch { /* already closed */ }
}

export function sendDataChannelEvent(dc: RTCDataChannel, event: Record<string, unknown>) {
  if (dc.readyState === 'open') {
    dc.send(JSON.stringify(event));
  }
}
