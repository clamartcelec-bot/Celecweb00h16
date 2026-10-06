import { test, expect, type Page } from '@playwright/test';

// Full-page regression with real Web Audio, synthetic tracks, and no external calls.
async function mockVoice(page: Page, projects: object[] = []) {
  await page.route('http://127.0.0.1:54321/**', route => {
    if (route.request().url().includes('/functions/v1/realtime-session')) {
      return route.fulfill({ status: 200, contentType: 'application/sdp', body: 'v=0\r\n' });
    }
    if (route.request().url().includes('/rest/v1/photos')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(projects) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.addInitScript(() => {
    const ctx = new AudioContext();
    const makeAudio = () => {
      const destination = ctx.createMediaStreamDestination();
      const tone = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      tone.connect(gain).connect(destination);
      tone.start();
      return { stream: destination.stream, gain };
    };
    const local = makeAudio();
    const remote = makeAudio();
    const channel = new EventTarget() as EventTarget & {
      readyState: string; send: (data: string) => void; close: () => void;
    };
    const sent: object[] = [];
    channel.readyState = 'open';
    channel.send = data => sent.push(JSON.parse(data));
    channel.close = () => { channel.readyState = 'closed'; };
    let deliverTrack: (withStream?: boolean) => void = () => {};
    let disconnect = () => {};
    class Peer extends EventTarget {
      connectionState = 'connected';
      ontrack: ((event: object) => void) | null = null;
      addTrack() {}
      createDataChannel() { return channel; }
      async createOffer() { return { type: 'offer', sdp: 'v=0\r\n' }; }
      async setLocalDescription() {}
      async setRemoteDescription() {
        deliverTrack = (withStream = true) => this.ontrack?.({ track: remote.stream.getAudioTracks()[0], streams: withStream ? [remote.stream] : [] });
        disconnect = () => { this.connectionState = 'disconnected'; this.dispatchEvent(new Event('connectionstatechange')); };
      }
      close() { this.connectionState = 'closed'; }
    }
    Object.defineProperty(window, 'RTCPeerConnection', { value: Peer });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
      await ctx.resume();
      return local.stream;
    } });
    Object.assign(window, { voiceTest: {
      sent,
      emit: (event: object) => channel.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(event) })),
      deliverTrack: (withStream = true) => deliverTrack(withStream),
      disconnect: () => disconnect(),
      remoteVolume: (value: number) => { remote.gain.gain.value = value; },
      localVolume: (value: number) => { local.gain.gain.value = value; },
      localStopped: () => local.stream.getTracks().every(track => track.readyState === 'ended'),
    } });
  });
}

async function emit(page: Page, type: string, extra: Record<string, unknown> = {}) {
  await page.evaluate(({ type, extra }) => {
    (window as unknown as {voiceTest: {emit: (event: object) => void}}).voiceTest.emit({ type, ...extra });
  }, { type, extra });
}
async function audio(page: Page, operation: 'deliverTrack' | 'remoteVolume' | 'localVolume', value = 0) {
  await page.evaluate(({ operation, value }) => {
    const voice = (window as unknown as {voiceTest: Record<string, (value: number) => void>}).voiceTest;
    voice[operation](value);
  }, { operation, value });
}
async function pose(page: Page) {
  return page.locator('robot-majordome').evaluate(el =>
    (el as HTMLElement & { getState: () => { state: string; pose: Record<string, number> } }).getState());
}
async function connect(page: Page) {
  await mockVoice(page);
  await page.goto('/concierge');
  await page.getByRole('button', { name: 'Parler à CELEC' }).click();
  await expect(page.getByRole('button', { name: 'Raccrocher' })).toBeVisible();
}

test('transparent companion, pink cap, two brows, and responsive layout', async ({ page }) => {
  await mockVoice(page);
  await page.goto('/concierge');
  const robot = page.locator('robot-majordome');
  await expect(robot).toBeVisible();
  expect(await robot.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  expect(await robot.evaluate(el => getComputedStyle(el).boxShadow)).toBe('none');
  expect(await robot.evaluate(el => {
    const shadow = el.shadowRoot!;
    return [...shadow.querySelectorAll('image')].map(image => image.getAttribute('href') ?? image.getAttribute('xlink:href'));
  })).toEqual(expect.arrayContaining([expect.stringContaining('accessories-pink'), expect.stringContaining('character')]));
  expect(await robot.evaluate(el => el.shadowRoot!.querySelectorAll('[data-part="brow-left"], [data-part="brow-right"]').length)).toBe(2);
  await expect(page.locator('.concierge-avatar')).toHaveCount(0);
  const bounds = await robot.boundingBox();
  expect(bounds!.x).toBeLessThan(150);
  expect(bounds!.y).toBeLessThan(300);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.screenshot({ path: 'test-results/robot-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/robot-mobile.png', fullPage: true });
});

test('greeting and mouth use remote sound, survive response.done, and stop on interruption', async ({ page }) => {
  await connect(page);
  // Late arrival with event.streams present: both cases previously lost the animation stream.
  await audio(page, 'deliverTrack');
  await emit(page, 'response.created');
  await emit(page, 'output_audio_buffer.started', { response_id: 'hello' });
  await audio(page, 'remoteVolume', 0.25);
  await expect.poll(async () => (await pose(page)).pose.mouthOpen).toBeGreaterThan(0.3);
  await expect.poll(async () => (await pose(page)).pose.hatLift).toBeGreaterThan(10);
  await emit(page, 'response.done', { response: { output: [] } });
  await expect(page.locator('robot-majordome')).toHaveAttribute('data-mode', 'speaking');
  await expect.poll(async () => (await pose(page)).pose.mouthOpen).toBeGreaterThan(0.3);
  await audio(page, 'remoteVolume', 0);
  await expect.poll(async () => (await pose(page)).pose.mouthOpen).toBeLessThan(0.02);
  await audio(page, 'localVolume', 0.5);
  await expect.poll(async () => (await pose(page)).pose.mouthOpen).toBeLessThan(0.02);
  await audio(page, 'remoteVolume', 0.25);
  await emit(page, 'input_audio_buffer.speech_started');
  await expect(page.locator('robot-majordome')).toHaveAttribute('data-mode', 'listening');
  await expect.poll(async () => (await pose(page)).pose.mouthOpen).toBe(0);
  await emit(page, 'output_audio_buffer.cleared', { response_id: 'hello' });
  await page.getByRole('button', { name: 'Raccrocher' }).click();
  await expect(page.locator('robot-majordome')).toHaveAttribute('data-mode', 'idle');
  expect(await page.evaluate(() =>
    (window as unknown as {voiceTest: {localStopped: () => boolean}}).voiceTest.localStopped())).toBe(true);
});

test('function calls animate success/error and do not interrupt a talking mouth', async ({ page }) => {
  await connect(page);
  await audio(page, 'deliverTrack');
  await emit(page, 'response.function_call_arguments.done', {
    name: 'update_client_panel', call_id: 'update-1', arguments: '{"first_name":"William"}',
  });
  await expect(page.locator('robot-majordome')).toHaveAttribute('data-mode', 'success');
  await expect.poll(async () => (await pose(page)).pose.headPitch).toBeGreaterThan(0.5);
  // Duplicate events must not execute the tool a second time.
  await emit(page, 'response.done', { response: { output: [{
    type: 'function_call', name: 'update_client_panel', call_id: 'update-1', arguments: '{}',
  }] } });
  expect(await page.evaluate(() => (window as unknown as {voiceTest: {sent: Array<{item?: {call_id?: string}}>}})
    .voiceTest.sent.filter(event => event.item?.call_id === 'update-1').length)).toBe(1);
  await emit(page, 'output_audio_buffer.started', { response_id: 'tool-reply' });
  await audio(page, 'remoteVolume', 0.25);
  await emit(page, 'response.function_call_arguments.done', {
    name: 'show_carnet_entries', call_id: 'cards-1', arguments: '{"entry_ids":[]}',
  });
  await expect(page.locator('robot-majordome')).toHaveAttribute('data-mode', 'speaking');
  await expect.poll(async () => (await pose(page)).pose.mouthOpen).toBeGreaterThan(0.3);
  await emit(page, 'output_audio_buffer.stopped', { response_id: 'old-response' });
  await expect(page.locator('robot-majordome')).toHaveAttribute('data-mode', 'speaking');
  await emit(page, 'output_audio_buffer.stopped', { response_id: 'tool-reply' });
  await emit(page, 'response.function_call_arguments.done', {
    name: 'submit_request', call_id: 'submit-empty', arguments: '{}',
  });
  await expect(page.locator('robot-majordome')).toHaveAttribute('data-mode', 'error');
  await expect(page.locator('robot-majordome')).toHaveAttribute('data-mode', 'listening', { timeout: 4000 });
});

test('reduced motion disables ambient gestures while voice remains understandable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await connect(page);
  await audio(page, 'deliverTrack');
  await emit(page, 'output_audio_buffer.started', { response_id: 'accessible' });
  await audio(page, 'remoteVolume', 0.25);
  await expect.poll(async () => (await pose(page)).pose.mouthOpen).toBeGreaterThan(0.3);
  expect((await pose(page)).pose.hatLift).toBe(0);
  await page.getByRole('button', { name: 'Raccrocher' }).click();
  await expect.poll(async () => (await pose(page)).pose.mouthOpen).toBe(0);
});


test('muting the microphone preserves remote lip sync; disconnection releases the microphone', async ({ page }) => {
  await connect(page);
  await page.evaluate(() => (window as unknown as {voiceTest: {deliverTrack: (withStream: boolean) => void}}).voiceTest.deliverTrack(false));
  await emit(page, 'output_audio_buffer.started', { response_id: 'muted' });
  await audio(page, 'remoteVolume', 0.25);
  await page.getByRole('button', { name: 'Couper le micro' }).click();
  await expect.poll(async () => (await pose(page)).pose.mouthOpen).toBeGreaterThan(0.3);
  await page.evaluate(() => (window as unknown as {voiceTest: {disconnect: () => void}}).voiceTest.disconnect());
  await expect(page.locator('robot-majordome')).toHaveAttribute('data-mode', 'idle');
  await expect.poll(async () => (await pose(page)).pose.mouthOpen).toBe(0);
  expect(await page.evaluate(() => (window as unknown as {voiceTest: {localStopped: () => boolean}}).voiceTest.localStopped())).toBe(true);
});

test('invalid and unknown tools fail gracefully and old audio-delta events still work', async ({ page }) => {
  await connect(page);
  await audio(page, 'deliverTrack');
  await emit(page, 'response.function_call_arguments.done', {
    name: 'update_client_panel', call_id: 'bad-json', arguments: 'not-json',
  });
  await expect(page.locator('robot-majordome')).toHaveAttribute('data-mode', 'error');
  await emit(page, 'response.function_call_arguments.done', {
    name: 'unknown_action', call_id: 'unknown', arguments: '{}',
  });
  await expect(page.locator('robot-majordome')).toHaveAttribute('data-mode', 'error');
  await emit(page, 'response.audio.delta');
  await audio(page, 'remoteVolume', 0.25);
  await expect.poll(async () => (await pose(page)).pose.mouthOpen).toBeGreaterThan(0.3);
  await emit(page, 'response.audio.done');
  await expect.poll(async () => (await pose(page)).pose.mouthOpen).toBe(0);
});


test('voice session survives internal navigation and reading a page does not solicit speech', async ({ page }) => {
  await connect(page);
  const before = await page.evaluate(() => (window as unknown as {voiceTest: {sent: object[]}}).voiceTest.sent.length);
  await page.getByRole('link', { name: 'Continuer la visite' }).click();
  await expect(page).toHaveURL(/decouvrir/);
  await expect(page.getByRole('link', { name: 'Revenir à la conversation avec le concierge' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as {voiceTest: {localStopped: () => boolean}}).voiceTest.localStopped())).toBe(false);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('celec:guide-context', { detail: { title: 'Un projet consulté', description: 'Une maison.' } })));
  const events = await page.evaluate(() => (window as unknown as {voiceTest: {sent: {type: string}[]}}).voiceTest.sent.slice());
  expect(events.slice(before).some(event => event.type === 'response.create')).toBe(false);
  await page.getByRole('button', { name: 'Une installation connectée' }).click();
  await expect.poll(async () => page.evaluate(() => (window as unknown as {voiceTest: {sent: {type: string}[]}}).voiceTest.sent.slice().filter(event => event.type === 'response.create').length)).toBeGreaterThan(events.filter(event => event.type === 'response.create').length);
  await page.getByRole('link', { name: 'Revenir à la conversation avec le concierge' }).click();
  await expect(page.getByRole('button', { name: 'Raccrocher' })).toBeVisible();
  await page.getByRole('button', { name: 'Raccrocher' }).click();
  expect(await page.evaluate(() => (window as unknown as {voiceTest: {localStopped: () => boolean}}).voiceTest.localStopped())).toBe(true);
});

test('appointment tab is read-only and validation waits for required fields', async ({ page }) => {
  await connect(page);
  await emit(page, 'response.function_call_arguments.done', { name: 'begin_appointment_flow', call_id: 'appointment-ui', arguments: '{}' });
  await expect(page.getByRole('button', { name: 'Valider', exact: true })).toBeDisabled();
  await emit(page, 'response.function_call_arguments.done', { name: 'update_client_panel', call_id: 'client-ui', arguments: '{"first_name":"Camille","phone":"0612345678","summary":"Rénovation électrique"}' });
  await expect(page.getByRole('button', { name: 'Valider', exact: true })).toBeEnabled();
  await expect(page.locator('.concierge-request-panel input:not([type=file])')).toHaveCount(0);
});

const PROJECTS = [
  { id: 'project-clamart', title: 'Une maison repensée', city: 'Clamart', lat: 48.8005, lng: 2.2634, description: 'Rénovation électrique et éclairage.', image_url: '/pink-van.webp', detected_brands: ['Legrand'], photo_images: [], published: true, author: 'CELEC', created_at: '2026-10-01' },
  { id: 'project-meudon', title: 'Une installation connectée', city: 'Meudon', lat: 48.812, lng: 2.235, description: 'Un réseau et de la domotique.', image_url: '/pink-van.webp', detected_brands: ['UniFi'], photo_images: [], published: true, author: 'CELEC', created_at: '2026-10-01' },
];

test('the large homepage guide starts a call in place and keeps its identity while travelling', async ({ page }) => {
  await mockVoice(page, PROJECTS);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.locator('robot-majordome')).toHaveCount(1);
  await expect(page.locator('.ce-guide-free')).toHaveAttribute('data-placement', 'hero');
  await expect.poll(async () => (await page.locator('robot-majordome').boundingBox())!.width).toBeGreaterThan(230);
  await page.locator('robot-majordome').evaluate(el => Object.assign(window, { originalGuide: el }));
  await page.getByRole('button', { name: 'Parler au concierge numérique CELEC', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: 'Raccrocher', exact: true })).toBeVisible();
  await emit(page, 'response.audio_transcript.done', { transcript: 'Je peux vous montrer cette maison.' });
  await expect(page.locator('.ce-guide-bubble')).toContainText('Je peux vous montrer cette maison.');
  await page.locator('.hdr').getByRole('button', { name: 'Le Carnet', exact: true }).click();
  await expect(page).toHaveURL(/\/carnet$/);
  await expect(page.locator('.ce-guide-free')).toHaveAttribute('data-placement', 'docked');
  expect(await page.locator('robot-majordome').evaluate(el => el === (window as unknown as { originalGuide: Element }).originalGuide)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as {voiceTest: {localStopped: () => boolean}}).voiceTest.localStopped())).toBe(false);
  await page.getByRole('button', { name: 'Raccrocher', exact: true }).click();
});

test('project map markers expose a preview and open the corresponding carnet sheet', async ({ page }) => {
  await mockVoice(page, PROJECTS);
  await page.goto('/');
  const atlas = page.getByRole('region', { name: 'Carte interactive des projets' });
  await atlas.getByRole('button', { name: 'Voir les projets à Clamart' }).focus();
  await expect(atlas.locator('.ce-atlas-project')).toContainText('Une maison repensée');
  await atlas.locator('.ce-atlas-project').click();
  await expect(page.locator('.carnet-modal h2')).toContainText('Une maison repensée');
  await expect(page).toHaveURL(/\/$/);
});

test('the concierge presents projects inside the homepage and can fold the presentation without ending the call', async ({ page }) => {
  await mockVoice(page, PROJECTS);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Parler au concierge numérique CELEC', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Raccrocher', exact: true })).toBeVisible();
  await emit(page, 'response.function_call_arguments.done', { name: 'show_carnet_entries', call_id: 'inline-projects', arguments: '{"entry_ids":["project-clamart"]}' });
  const stage = page.getByRole('region', { name: 'Présentation du concierge' });
  await expect(stage).toBeVisible();
  await expect(stage).toContainText('Une maison repensée');
  await expect(page.locator('.ce-guide-free')).toHaveAttribute('data-placement', 'presenting');
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('button', { name: 'Replier la présentation' }).click();
  await expect(stage).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Raccrocher', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as {voiceTest: {localStopped: () => boolean}}).voiceTest.localStopped())).toBe(false);
  await page.getByRole('button', { name: 'Raccrocher', exact: true }).click();
});
