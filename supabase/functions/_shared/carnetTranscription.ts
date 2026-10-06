export async function transcribeAudio(
  file: Blob,
  filename: string,
  apiKey: string,
  language: string,
  options: { fetch?: typeof fetch; signal?: AbortSignal } = {},
): Promise<{ text: string | null; error: string | null }> {
  try {
    const form = new FormData();
    form.append("file", file, filename);
    form.append("model", "whisper-1");
    form.append("language", (language || "fr").slice(0, 2).toLowerCase());
    const response = await (options.fetch ?? fetch)("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal: options.signal,
    });
    if (!response.ok) return { text: null, error: `transcription_http_${response.status}` };
    const data = await response.json();
    const text = typeof data.text === "string" && data.text ? data.text : null;
    return { text, error: text ? null : "transcription_empty" };
  } catch {
    return { text: null, error: "transcription_unavailable" };
  }
}
