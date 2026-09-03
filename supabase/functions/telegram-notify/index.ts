import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BOT_TOKEN = "8660052613:AAHJk6xTRUge7EbFHg-YBwobdjrv8DXy6-I";
const CHAT_ID = "1232272455";

interface NotifyBody {
  category?: string;
  description?: string;
  contact_preference?: string;
  callback_requested?: boolean;
  source?: string;
  user_email?: string;
  guest_phone?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body: NotifyBody = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (supabaseUrl && serviceKey) {
      const supabase = createClient(supabaseUrl, serviceKey);
      await supabase.from("requests").insert({
        category: body.category || "question",
        description: body.description || "",
        contact_preference: body.contact_preference || "email",
        callback_requested: body.callback_requested || false,
        status: "new",
        guest_phone: body.guest_phone || null,
      });
    }

    const categoryLabels: Record<string, string> = {
      depannage: "Depannage",
      chantier: "Chantier",
      projet: "Projet",
      question: "Question",
    };
    const label =
      categoryLabels[body.category || ""] ||
      body.category ||
      "Nouvelle demande";

    const lines = [
      "Nouvelle demande CELEC",
      "",
      "Categorie: " + label,
      "Description: " + (body.description || "(vide)"),
    ];
    if (body.source === "voice") lines.push("Source: Message vocal");
    if (body.source === "callback") lines.push("Rappel demande");
    if (body.user_email) lines.push("Compte: " + body.user_email);
    if (body.guest_phone) lines.push("Tel invite: " + body.guest_phone);
    lines.push(
      "Heure: " +
        new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" })
    );

    let telegramOk = false;
    try {
      const tgRes = await fetch(
        "https://api.telegram.org/bot" + BOT_TOKEN + "/sendMessage",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: CHAT_ID,
            text: lines.join("\n"),
          }),
        }
      );
      telegramOk = tgRes.ok;
    } catch {
      // Telegram send failed but request is already saved
    }

    return new Response(
      JSON.stringify({ success: true, telegram: telegramOk }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
