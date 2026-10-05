import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const minimaxKey = Deno.env.get("MINIMAX_API_KEY") || Deno.env.get("MINIMAX_M3_API_KEY") || "";

    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "Missing secrets" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: userData } = await supabase.auth.getUser(token);
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contentType = req.headers.get("Content-Type") || "";
    const isAudio = contentType.startsWith("audio/") || contentType.includes("multipart/form-data");

    let prompt = "";
    let instructions = "";
    let currentDescription = "";
    let language = "fr";

    if (isAudio) {
      let form: FormData;
      try {
        form = await req.formData();
      } catch {
        return new Response(JSON.stringify({ error: "Invalid form data" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const audioFile = form.get("audio");
      if (!(audioFile instanceof File)) {
        return new Response(JSON.stringify({ error: "Audio requis" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (audioFile.size > 25 * 1024 * 1024) {
        return new Response(JSON.stringify({ error: "Audio trop volumineux (max 25 Mo)" }), {
          status: 413,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      instructions = String(form.get("instructions") || "");
      currentDescription = String(form.get("current_description") || "");
      language = String(form.get("language") || "fr");

      if (!openaiKey) {
        return new Response(JSON.stringify({ error: "Transcription indisponible" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const formData = new FormData();
      formData.append("file", audioFile, "voice.webm");
      formData.append("model", "whisper-1");
      formData.append("language", (language || "fr").slice(0, 2).toLowerCase());
      const whisperResp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: formData,
      });
      if (!whisperResp.ok) {
        const detail = await whisperResp.text().catch(() => "");
        return new Response(JSON.stringify({ error: `Transcription impossible: ${detail.slice(0, 150)}` }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const whisperData = await whisperResp.json();
      prompt = String(whisperData.text || "").trim();
      if (!prompt) {
        return new Response(JSON.stringify({ error: "Aucune parole detectee" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      let body: { prompt?: string; instructions?: string; current_description?: string };
      try {
        body = await req.json();
      } catch {
        return new Response(JSON.stringify({ error: "Invalid body" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      prompt = (body.prompt || "").trim().slice(0, 4000);
      instructions = (body.instructions || "").trim().slice(0, 2000);
      currentDescription = (body.current_description || "").trim().slice(0, 4000);
    }

    const { data: settings } = await supabase
      .from("carnet_settings")
      .select("ai_model, minimax_api_key, minimax_base_url, ai_style, ai_language")
      .eq("id", 1)
      .maybeSingle();

    const aiModel = (settings?.ai_model || "gpt-4o-mini").trim();
    let url = "https://api.openai.com/v1/chat/completions";
    let apiKey = openaiKey || "";
    let provider = "openai";

    if (/^minimax/i.test(aiModel)) {
      apiKey = minimaxKey || (settings?.minimax_api_key || "").trim();
      const base = (settings?.minimax_base_url || "https://api.minimax.io/v1").replace(/\/+$/, "");
      url = `${base}/chat/completions`;
      provider = "minimax";
    }

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Aucune cle IA configuree" }), {
        status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const system = [
      "Tu reecris la description d'un billet du carnet de bord de CELEC, electricien en region parisienne.",
      "Tu reponds UNIQUEMENT par la nouvelle description, sans guillemets, sans titre, sans explication.",
      "Tu gardes tous les faits du texte actuel et de la dictee du technicien, tu ameliores la forme, la clarte et la precision.",
      settings?.ai_style ? `Style de redaction demande : ${settings.ai_style}.` : "",
    ].filter(Boolean).join("\n");

    const userPrompt = [
      currentDescription ? `Texte actuel : ${currentDescription}` : "",
      prompt ? `Dictee du technicien : ${prompt}` : "",
      instructions ? `Instructions : ${instructions}` : "",
      "Reecris la description en tenant compte de la dictee et des instructions. Garde les faits, ameliore la forme. Reponds uniquement par la nouvelle description, sans guillemets ni explications.",
    ].filter(Boolean).join("\n\n");

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: aiModel,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 600,
        temperature: 0.3,
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return new Response(JSON.stringify({ error: `${provider} API ${resp.status}: ${detail.slice(0, 200)}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    const text = typeof content === "string" ? content.trim() : "";
    if (!text) {
      return new Response(JSON.stringify({ error: "Reponse IA vide" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleaned = text.replace(/^["'`]+|["'`]+$/g, "").trim();
    return new Response(JSON.stringify({ description: cleaned, transcript: prompt, provider, model: aiModel }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
