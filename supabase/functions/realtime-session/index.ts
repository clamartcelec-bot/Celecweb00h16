import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import {
  createConciergeRealtimeSession,
  DEFAULT_CONCIERGE_VOICE,
  type ConciergeSettings,
} from "./conciergeRealtimeConfig.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const REALTIME_MODEL = Deno.env.get("REALTIME_MODEL") ?? "gpt-realtime-2.1-mini";
const REALTIME_VOICE = Deno.env.get("REALTIME_VOICE") ?? DEFAULT_CONCIERGE_VOICE;

async function loadConciergeSettings(): Promise<ConciergeSettings | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase
      .from("concierge_settings")
      .select("greeting, tone, prompt, site_info, focus_message, max_cards, show_brand_cards, voice, enabled")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      console.error("CONCIERGE_SETTINGS_ERROR", error.message);
      return null;
    }
    return (data as ConciergeSettings | null) ?? null;
  } catch (err) {
    console.error("CONCIERGE_SETTINGS_FAILED", (err as Error).message);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const sdp = body?.sdp;

    if (!sdp || typeof sdp !== "string") {
      return new Response(JSON.stringify({ error: "Missing SDP offer" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const settings = await loadConciergeSettings();

    const sessionConfig = JSON.stringify(
      createConciergeRealtimeSession(REALTIME_MODEL, REALTIME_VOICE, settings),
    );

    const fd = new FormData();
    fd.set("sdp", sdp);
    fd.set("session", sessionConfig);

    const res = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: fd,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return new Response(
        JSON.stringify({
          error: "OpenAI call creation failed",
          message: errText.slice(0, 500),
          status: res.status,
        }),
        {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const answerSdp = await res.text();

    if (!answerSdp.startsWith("v=0")) {
      return new Response(
        JSON.stringify({
          error: "OpenAI did not return a valid SDP answer",
          body: answerSdp.slice(0, 300),
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(answerSdp, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/sdp" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Realtime call failed", message: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
