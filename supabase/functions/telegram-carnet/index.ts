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

    if (!botToken || !supabaseUrl || !serviceKey) {
      return new Response(
        JSON.stringify({ error: "Missing secrets (bot token or supabase)" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const chatId = update.chat.id;
    const caption = update.caption || update.text || "";
    const photos = update.photo;

    const lines = caption.split("\n").map((l: string) => l.trim()).filter(Boolean);
    const title = lines[0] || "Sans titre";
    const description = lines.slice(1).join("\n") || null;

    // Parse optional metadata: #ville and @auteur in the caption
    let city = "";
    let author = "";
    const cityMatch = caption.match(/#(\S+)/);
    if (cityMatch) city = cityMatch[1].replace(/_/g, " ");
    const authorMatch = caption.match(/@(\S+)/);
    if (authorMatch) author = authorMatch[1].replace(/_/g, " ");
    if (!author && update.from) {
      author = update.from.first_name + (update.from.last_name ? ` ${update.from.last_name}` : "");
    }

    // Create the carnet entry
    const { data: entry, error: insertErr } = await supabase
      .from("photos")
      .insert({
        title,
        description,
        city,
        author,
        published: true,
        image_url: "",
      })
      .select("id")
      .single();

    if (insertErr) {
      await sendTelegram(botToken, chatId, `Erreur: ${insertErr.message}`);
      return new Response(
        JSON.stringify({ error: insertErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const entryId = entry.id;
    let imageCount = 0;

    // If the message has photos, download and upload them
    if (photos && photos.length > 0) {
      // Telegram sends multiple sizes; pick the largest
      const bestPhoto = photos[photos.length - 1];
      const fileUrl = await getTelegramFileUrl(botToken, bestPhoto.file_id);
      if (fileUrl) {
        const imgUrl = await downloadAndUpload(supabase, fileUrl, entryId, 0);
        if (imgUrl) {
          await supabase.from("photo_images").insert({
            photo_id: entryId,
            image_url: imgUrl,
            position: 0,
          });
          // Also set as main image_url for backward compat
          await supabase.from("photos").update({ image_url: imgUrl }).eq("id", entryId);
          imageCount = 1;
        }
      }
    }

    // Handle media groups (multiple photos sent together) via document
    if (update.document && update.document.mime_type?.startsWith("image/")) {
      const fileUrl = await getTelegramFileUrl(botToken, update.document.file_id);
      if (fileUrl) {
        const imgUrl = await downloadAndUpload(supabase, fileUrl, entryId, 0);
        if (imgUrl) {
          await supabase.from("photo_images").insert({
            photo_id: entryId,
            image_url: imgUrl,
            position: 0,
          });
          if (!imageCount) {
            await supabase.from("photos").update({ image_url: imgUrl }).eq("id", entryId);
          }
          imageCount++;
        }
      }
    }

    const reply = [
      "Carnet mis a jour !",
      `Titre: ${title}`,
      city ? `Ville: ${city}` : null,
      author ? `Auteur: ${author}` : null,
      `${imageCount} photo(s) ajoutee(s)`,
    ].filter(Boolean).join("\n");

    await sendTelegram(botToken, chatId, reply);

    return new Response(
      JSON.stringify({ success: true, id: entryId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

async function getTelegramFileUrl(botToken: string, fileId: string): Promise<string | null> {
  const resp = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data.ok || !data.result?.file_path) return null;
  return `https://api.telegram.org/file/bot${botToken}/${data.result.file_path}`;
}

async function downloadAndUpload(
  supabase: ReturnType<typeof createClient>,
  fileUrl: string,
  entryId: string,
  position: number,
): Promise<string | null> {
  const resp = await fetch(fileUrl);
  if (!resp.ok) return null;
  const blob = await resp.blob();
  const ext = fileUrl.split(".").pop()?.split("?")[0] || "jpg";
  const path = `telegram/${entryId}-${position}-${Date.now()}.${ext}`;
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
