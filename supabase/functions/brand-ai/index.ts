// BRAND PIPELINE — AI proxy. Ключи в brand_settings (anthropic_key, anthropic_workspace, openai_key), в браузер не попадают.
// POST {prompt, tier, provider?}  → {text, model, provider}
// POST /transcribe {file_url | tg_file_id, lang?} → {text}
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const SB_URL = Deno.env.get("SUPABASE_URL")!, SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-pipeline-key", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", ...CORS } });
let cfg: Record<string, string> = {}, cfgAt = 0;
async function settings() {
  if (Date.now() - cfgAt < 60_000 && Object.keys(cfg).length) return cfg;
  const r = await fetch(`${SB_URL}/rest/v1/brand_settings?select=key,value`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
  cfg = Object.fromEntries(((await r.json()) as any[]).map(x => [x.key, x.value])); cfgAt = Date.now(); return cfg;
}

async function askAnthropic(s: Record<string, string>, prompt: string, tier: string) {
  const model = tier === "quick" ? s.ai_model_quick || "claude-haiku-5-5" : s.ai_model || "claude-sonnet-5-5";
  const headers: Record<string, string> = { "x-api-key": s.anthropic_key, "anthropic-version": "2023-06-01", "content-type": "application/json" };
  if (s.anthropic_workspace) headers["anthropic-workspace-id"] = s.anthropic_workspace;
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers, body: JSON.stringify({ model, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || r.statusText);
  return { text: (j.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n"), model, provider: "anthropic" };
}
async function askOpenAI(s: Record<string, string>, prompt: string, tier: string) {
  const model = tier === "quick" ? s.openai_model_quick || "gpt-4o-mini" : s.openai_model || "gpt-4o";
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${s.openai_key}`, "content-type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || r.statusText);
  return { text: j.choices?.[0]?.message?.content ?? "", model, provider: "openai" };
}

async function transcribe(s: Record<string, string>, body: any) {
  if (!s.openai_key) throw new Error("no openai_key");
  let url = body.file_url as string;
  if (!url && body.tg_file_id) {
    const f = await (await fetch(`https://api.telegram.org/bot${s.tg_token}/getFile?file_id=${body.tg_file_id}`)).json();
    url = `https://api.telegram.org/file/bot${s.tg_token}/${f.result.file_path}`;
  }
  if (!url) throw new Error("file_url or tg_file_id required");
  const blob = await (await fetch(url)).blob();
  const fd = new FormData();
  fd.append("file", blob, "audio" + (url.match(/\.\w+$/)?.[0] || ".ogg"));
  fd.append("model", s.whisper_model || "whisper-1");
  if (body.lang) fd.append("language", body.lang);
  fd.append("prompt", "Фархат, Алматы, Казахстан, AI Trend, Trend Lenta, BrandTrend, Starlink, Kaspi, Instagram, Telegram, ChatGPT, Claude");
  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${s.openai_key}` }, body: fd });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || r.statusText);
  return { text: j.text as string };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ ok: true, fn: "brand-ai" });
  const s = await settings();
  const key = req.headers.get("x-pipeline-key");
  if (!key || key !== s.pipeline_key) return json({ code: "no_key", error: "forbidden" }, 403);
  const url = new URL(req.url);
  const body = await req.json().catch(() => ({}));
  try {
    if (url.pathname.endsWith("/transcribe")) return json(await transcribe(s, body));
    const { prompt, tier = "default", provider } = body;
    if (!prompt) return json({ code: "bad_request", error: "prompt required" }, 400);
    const order = provider === "openai" ? ["openai", "anthropic"] : ["anthropic", "openai"];
    const errors: string[] = [];
    for (const p of order) {
      try {
        if (p === "anthropic" && s.anthropic_key) return json(await askAnthropic(s, prompt, tier));
        if (p === "openai" && s.openai_key) return json(await askOpenAI(s, prompt, tier));
      } catch (e) { errors.push(`${p}: ${String((e as Error).message || e)}`); }
    }
    if (!s.anthropic_key && !s.openai_key) return json({ code: "no_ai_key", error: "Нет ключей в brand_settings" }, 400);
    return json({ code: "upstream_error", error: errors.join(" | ") }, 502);
  } catch (e) {
    return json({ code: "upstream_error", error: String((e as Error).message || e) }, 502);
  }
});
