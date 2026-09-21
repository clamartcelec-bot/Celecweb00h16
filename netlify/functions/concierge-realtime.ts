import OpenAI from 'openai';
import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import {
  createConciergeRealtimeSession,
  DEFAULT_CONCIERGE_VOICE,
  type ConciergeSettings,
} from '../supabase/functions/realtime-session/conciergeRealtimeConfig';

const REALTIME_MODEL = process.env.REALTIME_MODEL || 'gpt-realtime-2.1-mini';
const REALTIME_VOICE = process.env.REALTIME_VOICE || DEFAULT_CONCIERGE_VOICE;

async function loadConciergeSettings(): Promise<ConciergeSettings | null> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  try {
    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from('concierge_settings')
      .select('greeting, tone, prompt, site_info, focus_message, max_cards, show_brand_cards, voice, enabled')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      console.error('CONCIERGE_SETTINGS_ERROR', error.message);
      return null;
    }
    return (data as ConciergeSettings | null) ?? null;
  } catch (error) {
    console.error('CONCIERGE_SETTINGS_FAILED', (error as Error).message);
    return null;
  }
}

const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_KEY_PRESENT: false');
    return { statusCode: 500, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'OPENAI_API_KEY missing' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const sdp = body?.sdp;

    if (!sdp || typeof sdp !== 'string') {
      return { statusCode: 400, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Missing SDP offer' }) };
    }

    const settings = await loadConciergeSettings();
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await client.realtime.calls.create({
      sdp,
      session: createConciergeRealtimeSession(REALTIME_MODEL, REALTIME_VOICE, settings),
    });

    const answerSdp = await response.text();

    if (!answerSdp || !answerSdp.startsWith('v=0')) {
      console.error('OPENAI_CALL_FAILED: invalid SDP answer');
      return {
        statusCode: 502,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'OpenAI did not return a valid SDP answer' }),
      };
    }

    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/sdp' },
      body: answerSdp,
    };
  } catch (error: unknown) {
    const err = error as { name?: string; message?: string; status?: number };
    console.error('OPENAI_CALL_FAILED', {
      name: err?.name,
      message: err?.message,
      status: err?.status,
    });

    return {
      statusCode: err?.status || 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Realtime call creation failed',
        message: err?.message ?? String(error),
        status: err?.status ?? null,
      }),
    };
  }
};

export { handler };
