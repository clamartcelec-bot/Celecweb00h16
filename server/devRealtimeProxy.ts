import type { Plugin } from 'vite';

export function realtimeDevProxy(): Plugin {
  return {
    name: 'realtime-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/.netlify/functions/realtime-session', async (req, res) => {
        if (req.method === 'OPTIONS') {
          res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          });
          res.end();
          return;
        }

        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          console.error('OPENAI_KEY_PRESENT: false');
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'OPENAI_API_KEY not set in .env' }));
          return;
        }

        const model = process.env.REALTIME_MODEL || 'gpt-realtime-2.1-mini';
        const voice = process.env.REALTIME_VOICE || 'coral';

        console.log('OPENAI_KEY_PRESENT: true');
        console.log('REALTIME_MODEL:', model);

        let rawBody = '';
        for await (const chunk of req) {
          rawBody += chunk;
        }

        let sdp: string;
        try {
          const parsed = JSON.parse(rawBody);
          sdp = parsed?.sdp;
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON body' }));
          return;
        }

        if (!sdp || typeof sdp !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing SDP offer' }));
          return;
        }

        console.log('SDP_RECEIVED: true, SDP_LENGTH:', sdp.length);

        try {
          const { default: OpenAI } = await import('openai');
          const client = new OpenAI({ apiKey });

          console.log('OPENAI_CALL_STARTED');

          const response = await client.realtime.calls.create({
            sdp,
            session: {
              type: 'realtime',
              model,
              instructions: 'Tu es le concierge numérique de CELEC. Parle en français. Sois bref et naturel.',
              voice,
            },
          });

          const answerSdp = await response.text();

          console.log('SDP_ANSWER_RECEIVED:', !!answerSdp);
          console.log('SDP_ANSWER_LENGTH:', answerSdp?.length);

          if (!answerSdp || !answerSdp.startsWith('v=0')) {
            console.error('OPENAI_CALL_FAILED: invalid SDP answer');
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'OpenAI did not return a valid SDP answer' }));
            return;
          }

          console.log('OPENAI_CALL_SUCCESS');

          res.writeHead(200, {
            'Content-Type': 'application/sdp',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(answerSdp);
        } catch (err: unknown) {
          const e = err as { name?: string; message?: string; status?: number };
          console.error('OPENAI_CALL_FAILED', { name: e?.name, message: e?.message, status: e?.status });
          res.writeHead(e?.status || 500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'Realtime call creation failed',
            message: e?.message ?? String(err),
            status: e?.status ?? null,
          }));
        }
      });
    },
  };
}
