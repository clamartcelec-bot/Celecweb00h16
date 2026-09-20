import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const update = body.message || body.channel_post;
    if (!update) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const botToken = Deno.env.get("TELEGRAM_CARNET_BOT_TOKEN");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!botToken || !supabaseUrl || !serviceKey) {
      return new Response(
        JSON.stringify({ error: "Missing secrets" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const chatId = update.chat.id;
    const caption = update.caption || update.text || "";

    // --- 1. Collect raw data ---
    const rawData: Record<string, unknown> = {
      message_id: update.message_id,
      from: update.from,
      date: update.date,
      caption,
      has_photo: !!update.photo,
      has_voice: !!update.voice,
      has_audio: !!update.audio,
      has_document: !!update.document,
      location: update.location || null,
    };

    // --- 2. Handle voice messages (speech-to-text) ---
    let voiceTranscript: string | null = null;
    const voiceFile = update.voice || update.audio;
    if (voiceFile && openaiKey) {
      try {
        const fileUrl = await getTelegramFileUrl(botToken, voiceFile.file_id);
        if (fileUrl) {
          const audioResp = await fetch(fileUrl);
          if (audioResp.ok) {
            const audioBlob = await audioResp.blob();
            const formData = new FormData();
            formData.append("file", audioBlob, "voice.ogg");
            formData.append("model", "whisper-1");
            formData.append("language", "fr");

            const whisperResp = await fetch(
              "https://api.openai.com/v1/audio/transcriptions",
              {
                method: "POST",
                headers: { Authorization: `Bearer ${openaiKey}` },
                body: formData,
              }
            );
            if (whisperResp.ok) {
              const whisperData = await whisperResp.json();
              voiceTranscript = whisperData.text || null;
              rawData.voice_transcript = voiceTranscript;
            }
          }
        }
      } catch (e) {
        rawData.voice_error = (e as Error).message;
      }
    }

    // --- 3. Parse hashtags from caption ---
    let city = "";
    let author = "";
    const cityMatch = caption.match(/#(\S+)/);
    if (cityMatch) city = cityMatch[1].replace(/_/g, " ");
    const authorMatch = caption.match(/@(\S+)/);
    if (authorMatch) author = authorMatch[1].replace(/_/g, " ");
    if (!author && update.from) {
      author =
        update.from.first_name +
        (update.from.last_name ? ` ${update.from.last_name}` : "");
    }

    // --- 4. Download and upload photos ---
    const photos = update.photo;
    let mainImageUrl = "";
    const uploadedImages: { url: string; position: number }[] = [];

    if (photos && photos.length > 0) {
      const bestPhoto = photos[photos.length - 1];
      const fileUrl = await getTelegramFileUrl(botToken, bestPhoto.file_id);
      if (fileUrl) {
        const imgUrl = await downloadAndUpload(
          supabase,
          fileUrl,
          `telegram-${Date.now()}`,
          0
        );
        if (imgUrl) {
          mainImageUrl = imgUrl;
          uploadedImages.push({ url: imgUrl, position: 0 });
        }
      }
    }

    if (update.document && update.document.mime_type?.startsWith("image/")) {
      const fileUrl = await getTelegramFileUrl(
        botToken,
        update.document.file_id
      );
      if (fileUrl) {
        const imgUrl = await downloadAndUpload(
          supabase,
          fileUrl,
          `telegram-${Date.now()}`,
          uploadedImages.length
        );
        if (imgUrl) {
          if (!mainImageUrl) mainImageUrl = imgUrl;
          uploadedImages.push({ url: imgUrl, position: uploadedImages.length });
        }
      }
    }

    // --- 5. AI Analysis (vision + summary + brand detection) ---
    let aiSummary: string | null = null;
    let detectedBrands: string[] = [];
    let aiTitle = "";

    const textContext =
      voiceTranscript || caption.replace(/#\S+/g, "").replace(/@\S+/g, "").trim();

    if (openaiKey && (mainImageUrl || textContext)) {
      try {
        const messages: Array<{
          role: string;
          content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
        }> = [
          {
            role: "system",
            content: `Tu es l'assistant de CELEC, un electricien de terrain en region parisienne. On t'envoie une photo et/ou un texte pris sur un chantier. Tu dois analyser et produire un JSON avec exactement ces champs :
- "title": titre court et descriptif pour le carnet de bord (max 60 caracteres)
- "summary": description claire de l'intervention ou de la situation montree (2-4 phrases). Explique ce qui est montre, le type de travail, le contexte.
- "brands": tableau des marques visibles ou mentionnees (ex: ["Legrand", "Schneider"]). Si aucune marque, tableau vide.
- "category": une parmi "depannage", "renovation", "installation", "diagnostic", "autre"

Reponds UNIQUEMENT avec le JSON, sans markdown, sans backticks.`,
          },
        ];

        const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
        if (mainImageUrl) {
          userContent.push({
            type: "image_url",
            image_url: { url: mainImageUrl },
          });
        }
        if (textContext) {
          userContent.push({
            type: "text",
            text: `Contexte du technicien : ${textContext}`,
          });
        }
        if (city) {
          userContent.push({
            type: "text",
            text: `Lieu : ${city}`,
          });
        }

        messages.push({ role: "user", content: userContent });

        const chatResp = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${openaiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages,
              max_tokens: 600,
              temperature: 0.3,
            }),
          }
        );

        if (chatResp.ok) {
          const chatData = await chatResp.json();
          const content = chatData.choices?.[0]?.message?.content?.trim();
          if (content) {
            try {
              const parsed = JSON.parse(content);
              aiTitle = parsed.title || "";
              aiSummary = parsed.summary || null;
              detectedBrands = Array.isArray(parsed.brands)
                ? parsed.brands
                : [];
              rawData.ai_analysis = parsed;
            } catch {
              aiSummary = content;
              rawData.ai_raw_response = content;
            }
          }
        }
      } catch (e) {
        rawData.ai_error = (e as Error).message;
      }
    }

    // --- 6. Build title and description ---
    const lines = caption
      .replace(/#\S+/g, "")
      .replace(/@\S+/g, "")
      .split("\n")
      .map((l: string) => l.trim())
      .filter(Boolean);
    const userTitle = lines[0] || "";
    const userDescription = lines.slice(1).join("\n") || null;

    const finalTitle = userTitle || aiTitle || "Sans titre";
    const finalDescription = aiSummary || userDescription || null;

    // --- 7. Resolve city coordinates ---
    let lat = 0;
    let lng = 0;

    if (update.location) {
      lat = update.location.latitude;
      lng = update.location.longitude;
      rawData.gps = { lat, lng, source: "telegram_location" };
    }

    if (city && lat === 0) {
      const { data: cityRow } = await supabase
        .from("french_cities")
        .select("lat, lng")
        .ilike("name", city)
        .maybeSingle();
      if (cityRow) {
        lat = cityRow.lat;
        lng = cityRow.lng;
        rawData.gps = { lat, lng, source: "city_lookup" };
      }
    }

    // --- 8. Create draft entry (unpublished) ---
    const { data: entry, error: insertErr } = await supabase
      .from("photos")
      .insert({
        title: finalTitle,
        description: finalDescription,
        city,
        author,
        lat,
        lng,
        published: false,
        image_url: mainImageUrl,
        raw_data: rawData,
        detected_brands: detectedBrands.length > 0 ? detectedBrands : null,
        voice_transcript: voiceTranscript,
        ai_summary: aiSummary,
        source: "telegram",
      })
      .select("id")
      .single();

    if (insertErr) {
      await sendTelegram(botToken, chatId, `Erreur: ${insertErr.message}`);
      return new Response(JSON.stringify({ error: insertErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const entryId = entry.id;

    // Link uploaded images to the entry
    for (const img of uploadedImages) {
      await supabase.from("photo_images").insert({
        photo_id: entryId,
        image_url: img.url,
        position: img.position,
      });
    }

    // --- 9. Telegram confirmation ---
    const replyParts = [
      "Carnet : brouillon cree",
      `Titre : ${finalTitle}`,
    ];
    if (city) replyParts.push(`Lieu : ${city}`);
    if (detectedBrands.length > 0)
      replyParts.push(`Marques : ${detectedBrands.join(", ")}`);
    if (voiceTranscript)
      replyParts.push(
        `Transcription : ${voiceTranscript.slice(0, 100)}${voiceTranscript.length > 100 ? "..." : ""}`
      );
    if (aiSummary)
      replyParts.push(
        `Resume IA : ${aiSummary.slice(0, 150)}${aiSummary.length > 150 ? "..." : ""}`
      );
    replyParts.push(`${uploadedImages.length} photo(s)`);
    replyParts.push("A valider dans l'espace admin pour publier.");

    await sendTelegram(botToken, chatId, replyParts.join("\n"));

    return new Response(JSON.stringify({ success: true, id: entryId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function getTelegramFileUrl(
  botToken: string,
  fileId: string
): Promise<string | null> {
  const resp = await fetch(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`
  );
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data.ok || !data.result?.file_path) return null;
  return `https://api.telegram.org/file/bot${botToken}/${data.result.file_path}`;
}

async function downloadAndUpload(
  supabase: ReturnType<typeof createClient>,
  fileUrl: string,
  prefix: string,
  position: number
): Promise<string | null> {
  const resp = await fetch(fileUrl);
  if (!resp.ok) return null;
  const blob = await resp.blob();
  const ext = fileUrl.split(".").pop()?.split("?")[0] || "jpg";
  const path = `telegram/${prefix}-${position}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("photos").upload(path, blob, {
    contentType: blob.type || "image/jpeg",
    upsert: false,
  });
  if (error) return null;
  const { data } = supabase.storage.from("photos").getPublicUrl(path);
  return data.publicUrl;
}

async function sendTelegram(botToken: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}
