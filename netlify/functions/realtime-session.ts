import OpenAI from 'openai';
import type { Handler } from '@netlify/functions';
import { createConciergeRealtimeSession } from '../../server/conciergeRealtimeConfig';

const REALTIME_MODEL = process.env.REALTIME_MODEL || 'gpt-realtime-2.1-mini';
const REALTIME_VOICE = process.env.REALTIME_VOICE || 'coral';

const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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

  console.log('OPENAI_KEY_PRESENT: true');
  console.log('REALTIME_MODEL:', REALTIME_MODEL);

  try {
    const body = JSON.parse(event.body || '{}');
    const sdp = body?.sdp;

    if (!sdp || typeof sdp !== 'string') {
      return { statusCode: 400, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Missing SDP offer' }) };
    }

    console.log('SDP_RECEIVED: true');
    console.log('SDP_LENGTH:', sdp.length);

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    console.log('OPENAI_CALL_STARTED');

    const response = await client.realtime.calls.create({
      sdp,
      session: createConciergeRealtimeSession(REALTIME_MODEL, REALTIME_VOICE),
    });

    const answerSdp = await response.text();

    console.log('SDP_ANSWER_RECEIVED:', !!answerSdp);
    console.log('SDP_ANSWER_LENGTH:', answerSdp?.length);

    if (!answerSdp || !answerSdp.startsWith('v=0')) {
      console.error('OPENAI_CALL_FAILED: invalid SDP answer');
      return {
        statusCode: 502,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'OpenAI did not return a valid SDP answer' }),
      };
    }

    console.log('OPENAI_CALL_SUCCESS');

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
