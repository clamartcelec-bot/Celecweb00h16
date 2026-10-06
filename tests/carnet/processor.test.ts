import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { analyzeWithAi, buildPrompt, calculateDraftFields, extractJsonObject, fallbackTitle, getAnalysisText, resolveProvider } from '../../supabase/functions/_shared/carnetProcessor.ts';
import { transcribeAudio } from '../../supabase/functions/_shared/carnetTranscription.ts';

// Compare against the actual audited Telegram implementation, not another copy of the new code.
const source = execFileSync('git', ['show', 'c765e8cc8312929d84ae9f440a9d38e87d46b683:supabase/functions/telegram-carnet/index.ts'], { encoding: 'utf8' });
const js = ts.transpile(source.replace(/^import .*;\n/m, ''), { target: ts.ScriptTarget.ES2022 });
function original(fetcher: typeof fetch) {
  return new Function('Deno', 'fetch', `${js}\nreturn {buildPrompt,resolveProvider,extractJsonObject,analyzeWithAi,fallbackTitle};`)({ serve() {}, env: { get() { return undefined; } } }, fetcher);
}
const settings = { ai_prompt: '', ai_style: 'professionnel', ai_model: 'gpt-4o-mini', activity_context: 'electricite', detect_brands: true, auto_transcribe: true, minimax_api_key: '', minimax_base_url: '', batch_window_seconds: 120, ai_language: 'fr' };

test('Telegram: prompt, provider and fallback identical to audited source in all languages', () => {
  const old = original(fetch);
  for (const lang of ['fr', 'en', 'es', 'de', 'ar', 'zz']) {
    const config = { ...settings, ai_language: lang, detect_brands: false };
    assert.equal(buildPrompt(config), old.buildPrompt(config));
    assert.deepEqual(resolveProvider(config, 'fake-key', ''), old.resolveProvider(config, 'fake-key', ''));
    assert.equal(fallbackTitle(lang, 'diagnostic', 'Clamart'), old.fallbackTitle(lang, 'diagnostic', 'Clamart'));
  }
});
test('Telegram: multimodal payload and parsed result unchanged, only six images sent', async () => {
  const bodies: unknown[] = [];
  const fetcher = (async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return Response.json({ choices: [{ message: { content: 'Reflexion\n```json\n{"title":"Tableau","summary":"Installation.","brands":["Legrand",3],"category":"installation"}\n```' } }] }); }) as typeof fetch;
  const images = Array.from({ length: 9 }, (_, i) => `https://test.invalid/${i}.jpg`);
  const old = await original(fetcher).analyzeWithAi(images, 'Pose', 'Clamart', settings, 'fake-key', '');
  const current = await analyzeWithAi(images, 'Pose', 'Clamart', settings, 'fake-key', '', { fetch: fetcher });
  assert.deepEqual(current, old); assert.deepEqual(bodies[0], bodies[1]);
  assert.equal((bodies[1] as any).messages[1].content.filter((x: any) => x.type === 'image_url').length, 6);
  assert.deepEqual(calculateDraftFields(current, 'Titre utilisateur\nDetails', 'Clamart', 'fr'), { title: 'Tableau', description: 'Installation.', ai_summary: 'Installation.', detected_brands: ['Legrand'] });
});
test('Telegram: invalid response never becomes a description; caption priority preserved', async () => {
  const fetcher = (async () => Response.json({ choices: [{ message: { content: 'Je pense que cette photo...' } }] })) as typeof fetch;
  const result = await analyzeWithAi(['https://test.invalid/x.jpg'], '', '', settings, 'fake-key', '', { fetch: fetcher });
  assert.ok(result.error); assert.equal(result.summary, null);
  assert.equal(calculateDraftFields(result, 'Titre\nDescription humaine', '', 'fr').description, 'Description humaine');
  assert.equal(getAnalysisText('#Clamart', 'Le vocal', true), '');
  assert.equal(getAnalysisText('', 'Le vocal', false), 'Le vocal');
  assert.equal(extractJsonObject('texte {"x":"}\\\"","nested":{"x":2}} apres'), '{"x":"}\\\"","nested":{"x":2}}');
});
test('Transcription: same Whisper model/language, errors remain distinguishable for mobile', async () => {
  let body: FormData | undefined;
  const fetcher = (async (_url, init) => { body = init?.body as FormData; return Response.json({ text: 'Pose du tableau' }); }) as typeof fetch;
  assert.deepEqual(await transcribeAudio(new Blob(['fake']), 'voice.m4a', 'fake-key', 'FR', { fetch: fetcher }), { text: 'Pose du tableau', error: null });
  assert.equal(body?.get('model'), 'whisper-1'); assert.equal(body?.get('language'), 'fr');
  const fail = (async () => new Response('', { status: 503 })) as typeof fetch;
  assert.deepEqual(await transcribeAudio(new Blob(), 'voice.ogg', 'fake-key', 'fr', { fetch: fail }), { text: null, error: 'transcription_http_503' });
});
