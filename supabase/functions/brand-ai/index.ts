// BRAND PIPELINE — AI proxy. Ключ хранится в brand_settings (anthropic_key / openai_key), в браузер не попадает.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const SB_URL = Deno.env.get("SUPABASE_URL")!, SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-pipeline-key", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", ...CORS } });
async function setting(key: string) {
  const r = await fetch(`${SB_URL}/rest/v1/brand_settings?key=eq.${key}&select=value`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
  return (await r.json())?.[0]?.value ?? null;
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ ok: true, fn: "brand-ai" });
  const key = req.headers.get("x-pipeline-key");
  if (!key || key !== (await setting("pipeline_key"))) return json({ code: "no_key", error: "forbidden" }, 403);
  const { prompt, tier = "default" } = await req.json().catch(() => ({}));
  if (!prompt) return json({ code: "bad_request", error: "prompt required" }, 400);

  const anth = Deno.env.get("ANTHROPIC_API_KEY") || await setting("anthropic_key");
  const oai = Deno.env.get("OPENAI_API_KEY") || await setting("openai_key");
  try {
    if (anth) {
      const model = tier === "quick" ? (await setting("ai_model_quick")) || "claude-haiku-5-5" : (await setting("ai_model")) || "claude-sonnet-5-5";
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "x-api-key": anth, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
      });
      const j = await r.json();
      if (!r.ok) return json({ code: "upstream_error", error: j?.error?.message || r.statusText }, 502);
      return json({ text: (j.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n"), model });
    }
    if (oai) {
      const model = tier === "quick" ? (await setting("openai_model_quick")) || "gpt-4o-mini" : (await setting("openai_model")) || "gpt-4o";
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST", headers: { Authorization: `Bearer ${oai}`, "content-type": "application/json" },
        body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
      });
      const j = await r.json();
      if (!r.ok) return json({ code: "upstream_error", error: j?.error?.message || r.statusText }, 502);
      return json({ text: j.choices?.[0]?.message?.content ?? "", model });
    }
    return json({ code: "no_ai_key", error: "Нет ключа: добавь anthropic_key или openai_key в brand_settings" }, 400);
  } catch (e) {
    return json({ code: "upstream_error", error: String(e) }, 502);
  }
});
