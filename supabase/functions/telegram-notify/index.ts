import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BOT_TOKEN = Deno.env.get("TELEGRAM_NOTIFY_BOT_TOKEN");
const CHAT_ID = Deno.env.get("TELEGRAM_NOTIFY_CHAT_ID");

interface NotifyBody {
  category?: string;
  description?: string;
  contact_preference?: string;
  callback_requested?: boolean;
  source?: string;
  user_email?: string;
  guest_phone?: string;
}

function clean(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body: NotifyBody = await req.json();
    const allowedCategories = new Set(["depannage", "chantier", "projet", "question", "callback"]);
    const requestedCategory = clean(body.category, 40);
    const category = allowedCategories.has(requestedCategory) ? requestedCategory : "question";
    const description = clean(body.description, 1_600);
    const guestPhone = clean(body.guest_phone, 40);
    const userEmail = clean(body.user_email, 200);
    const source = clean(body.source, 40);
    const requestedContactPreference = clean(body.contact_preference, 20);
    const contactPreference = ["email", "phone", "callback"].includes(requestedContactPreference)
      ? requestedContactPreference
      : userEmail ? "email" : "phone";

    if (source === "concierge" && (!description || guestPhone.replace(/\D/g, "").length < 8)) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid concierge contact details" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return new Response(
        JSON.stringify({ error: "Supabase service is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: savedRequest, error: insertError } = await supabase
      .from("requests")
      .insert({
        category,
        description,
        contact_preference: contactPreference,
        callback_requested: body.callback_requested === true,
        status: "new",
        guest_phone: guestPhone || null,
      })
      .select("id")
      .single();

    if (insertError) {
      return new Response(
        JSON.stringify({ error: "Unable to save request" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const categoryLabels: Record<string, string> = {
      depannage: "Depannage",
      chantier: "Chantier",
      projet: "Projet",
      question: "Question",
    };
    const label =
      categoryLabels[category] ||
      category ||
      "Nouvelle demande";

    const lines = [
      "Nouvelle demande CELEC",
      "",
      "Categorie: " + label,
      "Description: " + (description || "(vide)"),
    ];
    if (source === "voice") lines.push("Source: Message vocal");
    if (source === "callback") lines.push("Rappel demande");
    if (source === "concierge") lines.push("Source: Concierge vocal");
    if (userEmail) lines.push("Compte: " + userEmail);
    if (guestPhone) lines.push("Tel invite: " + guestPhone);
    lines.push(
      "Heure: " +
        new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" })
    );

    let telegramOk = false;
    if (BOT_TOKEN && CHAT_ID) {
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
    } else {
      console.error("Missing TELEGRAM_NOTIFY_BOT_TOKEN or TELEGRAM_NOTIFY_CHAT_ID");
    }

    return new Response(
      JSON.stringify({ success: true, telegram: telegramOk, request_id: savedRequest.id }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
