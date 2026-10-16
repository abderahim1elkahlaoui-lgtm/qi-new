import { createServerFn } from "@tanstack/react-start";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

const SYSTEM = `You are "QI New", a free AI assistant inside a WhatsApp-like chat.
LANGUAGE: Always reply in the exact language (and dialect) the user wrote in, with high linguistic accuracy.
FIQH: For Islamic/sharia/fiqh questions answer accurately and concisely, rely on trusted sources (Quran, authentic Sunnah, ijma, recognized scholars) and, when relevant, briefly state the positions of the four schools (Hanafi, Maliki, Shafi'i, Hanbali). Cite sources briefly. If there is real disagreement say so; for personal fatwa-sensitive cases advise consulting a local qualified scholar.
GENERAL: You also answer any other topic helpfully and concisely. Use emojis naturally like a friend on WhatsApp when appropriate.
SAFETY: Never help with harmful, illegal, sinful or dangerous requests. Instead, kindly give sincere advice related to what the user was about to do, and suggest a better path.
STICKERS: If the message is trivial (e.g. "1+1", "hi", "thanks", "ok", a joke, obvious facts) start your reply with [[STICKER:<one emoji>]] then optionally a very short text. Example: "[[STICKER:😂]] 2 طبعاً".
IMAGES: If the user asks for an image/illustration/diagram, or a complex fiqh topic would clearly benefit from a visual, add on its own line [[IMAGE:<detailed English prompt for an educational illustration, no text in image>]].
SUGGESTIONS: End every reply with [[SUGGEST:reply 1|reply 2|reply 3]] — three short follow-ups the USER might send next, in the user's language.
Use light markdown (bold, lists). Keep it short.`;

type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type Msg = { role: "user" | "assistant" | "system"; content: string | Part[] };

function headers() {
  const key = process.env['LOVABLE_API_KEY'];
  if (!key) throw new Error("AI key missing");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    "Lovable-API-Key": key,
    "X-Lovable-AIG-SDK": "fetch",
  };
}

async function failMsg(res: Response) {
  if (res.status === 429) return "Too many requests, try again in a moment.";
  if (res.status === 402) return "AI credits are exhausted for this workspace.";
  const t = await res.text().catch(() => "");
  return `AI error ${res.status}: ${t.slice(0, 200)}`;
}

export const askAI = createServerFn({ method: "POST" })
  .inputValidator((d: { messages: Msg[]; extraSystem?: string }) => d)
  .handler(async ({ data }) => {
    const res = await fetch(`${GATEWAY}/chat/completions`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        reasoning_effort: "low",
        stream: true,
        messages: [
          { role: "system", content: SYSTEM + (data.extraSystem ? "\n" + data.extraSystem : "") },
          ...data.messages.slice(-30),
        ],
      }),
    });
    if (!res.ok || !res.body) return { error: await failMsg(res), text: "" };
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const l of lines) {
        const s = l.trim();
        if (!s.startsWith("data:")) continue;
        const p = s.slice(5).trim();
        if (p === "[DONE]") continue;
        try {
          const j = JSON.parse(p);
          text += j.choices?.[0]?.delta?.content ?? "";
        } catch {
          /* ignore */
        }
      }
    }
    return { text, error: null as string | null };
  });

export const genImage = createServerFn({ method: "POST" })
  .inputValidator((d: { prompt: string }) => d)
  .handler(async ({ data }) => {
    const res = await fetch(`${GATEWAY}/images/generations`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        model: "openai/gpt-image-2.5-sunburst",
        prompt: data.prompt,
        size: "1024x1024",
        n: 1,
      }),
    });
    if (!res.ok) return { error: await failMsg(res), url: "" };
    const j = await res.json();
    const d = j.data?.[0];
    const url = d?.b64_json ? `data:image/png;base64,${d.b64_json}` : d?.url ?? "";
    return { url, error: url ? null : "No image returned" };
  });
