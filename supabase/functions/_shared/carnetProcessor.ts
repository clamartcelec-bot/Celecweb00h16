import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";

const MAX_IMAGES_TO_ANALYZE = 6;

const DEFAULT_PROMPT =
  "Tu es l'assistant de CELEC, un electricien de terrain en region parisienne. On t'envoie des photos et ou un texte pris sur un chantier. Tu dois decrire l'intervention et produire un JSON avec exactement ces champs.";

const JSON_SCHEMA = `Reponds UNIQUEMENT avec le JSON demande. Aucun raisonnement, aucune explication, aucun texte avant ou apres le JSON, pas de markdown, pas de backticks.
{"title":"...","summary":"...","brands":["..."],"category":"..."}
- "title" : titre court et descriptif pour le carnet de bord (max 60 caracteres). Jamais "Sans titre".
- "summary" : vraie description de l'intervention ou de la situation montree (2-4 phrases). Explique ce qui est montre, le type de travail, le contexte.
- "brands" : tableau des marques visibles ou mentionnees (ex: ["Legrand", "Schneider"]). Si aucune marque, tableau vide.
- "category" : une parmi "depannage", "renovation", "installation", "diagnostic", "autre"
Interdiction absolue d'ecrire tes reflexions, tes doutes, tes hypotheses ou la maniere dont tu examines les images. Le champ "summary" decrit le chantier, pas ta demarche.`;

export interface CarnetSettings {
  ai_prompt: string;
  ai_style: string;
  ai_model: string;
  activity_context: string;
  detect_brands: boolean;
  auto_transcribe: boolean;
  minimax_api_key: string;
  minimax_base_url: string;
  batch_window_seconds: number;
  ai_language: string;
}

interface AiProvider {
  name: string;
  model: string;
  url: string;
  apiKey: string;
}

export async function loadSettings(
  supabase: SupabaseClient
): Promise<CarnetSettings | null> {
  try {
    const { data } = await supabase
      .from("carnet_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    return (data as CarnetSettings) ?? null;
  } catch {
    return null;
  }
}

const LANGUAGES: Record<string, string> = {
  fr: "francais",
  en: "anglais",
  es: "espagnol",
  de: "allemand",
  it: "italien",
  pt: "portugais",
  nl: "neerlandais",
  ar: "arabe",
};

const FALLBACK_LABELS: Record<string, { prefix: string; at: string }> = {
  fr: { prefix: "Intervention", at: "a" },
  en: { prefix: "Job", at: "in" },
  es: { prefix: "Intervencion", at: "en" },
  de: { prefix: "Einsatz", at: "in" },
  it: { prefix: "Intervento", at: "a" },
  pt: { prefix: "Intervencao", at: "em" },
  nl: { prefix: "Opdracht", at: "in" },
};

export function fallbackTitle(language: string, category: string, city: string): string {
  const lang = (language || "fr").slice(0, 2).toLowerCase();
  const labels = FALLBACK_LABELS[lang] || FALLBACK_LABELS.fr;
  const parts = [labels.prefix];
  if (category) parts.push(category);
  if (city) parts.push(`${labels.at} ${city}`);
  return parts.join(" ");
}

export function buildPrompt(settings: CarnetSettings | null): string {
  const base = (settings?.ai_prompt || "").trim() || DEFAULT_PROMPT;
  const language = (settings?.ai_language || "fr").slice(0, 2).toLowerCase();
  const languageName = LANGUAGES[language] || LANGUAGES.fr;
  const parts = [base];
  parts.push(
    `Tu rediges TOUJOURS le titre et le resume en ${languageName}, meme si les messages recus sont dans une autre langue.`
  );
  const style = (settings?.ai_style || "professionnel").trim();
  if (style) {
    parts.push(`Style de redaction demande : ${style}.`);
  }
  const activity = (settings?.activity_context || "").trim();
  if (activity) {
    parts.push(`Contexte de l'activite de l'entreprise : ${activity}`);
  }
  if (settings?.detect_brands === false) {
    parts.push('Aucune recherche de marque : renvoie toujours un tableau "brands" vide.');
  }
  if (!/["']summary["']/.test(base)) {
    parts.push(JSON_SCHEMA);
  }
  return parts.join("\n\n");
}

export function resolveProvider(
  settings: CarnetSettings | null,
  openaiKey: string | undefined,
  minimaxKey: string
): AiProvider | null {
  const model = (settings?.ai_model || "gpt-4o-mini").trim();
  if (/^minimax/i.test(model)) {
    const key = minimaxKey || (settings?.minimax_api_key || "").trim();
    if (!key) return null;
    const base = (settings?.minimax_base_url || "https://api.minimax.io/v1").replace(/\/+$/, "");
    return { name: "minimax", model, url: `${base}/chat/completions`, apiKey: key };
  }
  if (!openaiKey) return null;
  return {
    name: "openai",
    model,
    url: "https://api.openai.com/v1/chat/completions",
    apiKey: openaiKey,
  };
}

// Models often wrap the JSON in reasoning prose or fences. This pulls out the first
// balanced JSON object so the content is never mistaken for a description.
export function extractJsonObject(text: string): string | null {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      if (inString) escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return cleaned.slice(start, i + 1);
    }
  }
  return null;
}

export interface AiResult {
  title: string;
  summary: string | null;
  brands: string[];
  category: string;
  provider: string;
  model: string;
  raw: unknown;
  error: string | null;
}

export async function analyzeWithAi(
  images: string[],
  text: string,
  city: string,
  settings: CarnetSettings | null,
  openaiKey: string | undefined,
  minimaxKey: string,
  options: { fetch?: typeof fetch; signal?: AbortSignal } = {}
): Promise<AiResult> {
  const provider = resolveProvider(settings, openaiKey, minimaxKey);
  const empty: AiResult = {
    title: "",
    summary: null,
    brands: [],
    category: "",
    provider: provider?.name ?? "none",
    model: provider?.model ?? "",
    raw: null,
    error: null,
  };
  if (!provider || (images.length === 0 && !text)) {
    if (!provider) empty.error = "Aucune cle IA configuree";
    return empty;
  }

  try {
    const userContent: Array<Record<string, unknown>> = [];
    for (const url of images.slice(0, MAX_IMAGES_TO_ANALYZE)) {
      userContent.push({ type: "image_url", image_url: { url } });
    }
    if (text) userContent.push({ type: "text", text: `Contexte du technicien : ${text}` });
    if (city) userContent.push({ type: "text", text: `Lieu : ${city}` });
    if (images.length > MAX_IMAGES_TO_ANALYZE) {
      userContent.push({
        type: "text",
        text: `(${images.length - MAX_IMAGES_TO_ANALYZE} photo(s) supplementaire(s) non transmise(s))`,
      });
    }

    const resp = await (options.fetch ?? fetch)(provider.url, {
      signal: options.signal,
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: "system", content: buildPrompt(settings) },
          { role: "user", content: userContent },
        ],
        max_tokens: 800,
        temperature: 0.3,
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      empty.error = `${provider.name} API ${resp.status}: ${detail.slice(0, 200)}`;
      return empty;
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    const textContent = typeof content === "string" ? content.trim() : "";
    if (!textContent) {
      empty.error = "Reponse IA vide";
      return empty;
    }

    const jsonText = extractJsonObject(textContent);
    if (jsonText) {
      try {
        const parsed = JSON.parse(jsonText);
        const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
        return {
          title: typeof parsed.title === "string" ? parsed.title.trim() : "",
          summary: summary || null,
          brands:
            settings?.detect_brands === false
              ? []
              : Array.isArray(parsed.brands)
                ? parsed.brands.filter((b: unknown) => typeof b === "string")
                : [],
          category: typeof parsed.category === "string" ? parsed.category : "",
          provider: provider.name,
          model: provider.model,
          raw: parsed,
          error: null,
        };
      } catch {
        // fall through to the unparsed branch below
      }
    }

    // The model answered but no usable JSON was found. Nothing from the raw answer
    // is used as a description: the technician's own caption and a generated title
    // take over, so no reasoning text can ever reach the carnet.
    return {
      title: "",
      summary: null,
      brands: [],
      category: "",
      provider: provider.name,
      model: provider.model,
      raw: { unparsed_response: textContent.slice(0, 2000) },
      error: "Reponse IA non exploitable",
    };
  } catch (e) {
    empty.error = (e as Error).message;
    return empty;
  }
}


export function getAnalysisText(captionText: string, voiceTranscript: string | null, hasCaptions: boolean): string {
  return hasCaptions ? captionText.replace(/#\S+/g, "").replace(/@\S+/g, "").trim() : voiceTranscript || "";
}

export function calculateDraftFields(ai: AiResult, captionText: string, city: string, language: string) {
  const lines = captionText.replace(/#\S+/g, "").replace(/@\S+/g, "").split("\n").map(l => l.trim()).filter(Boolean);
  return {
    title: (ai.title || lines[0] || fallbackTitle(language, ai.category, city)).slice(0, 120),
    description: ai.summary || lines.slice(1).join("\n") || null,
    ai_summary: ai.summary,
    detected_brands: ai.brands.length ? ai.brands : null,
  };
}
