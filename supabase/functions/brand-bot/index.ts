// BRAND PIPELINE — Telegram bot (Supabase Edge Function)
// Вход идей/референсов → brand_inbox; утверждение сценариев кнопками; /batch отдаёт тексты суфлёра.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
let TG_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
let TG_SECRET = Deno.env.get("TG_WEBHOOK_SECRET") ?? "";
let TG = "";
async function initTg() {
  if (!TG_TOKEN) TG_TOKEN = (await setting("tg_token")) ?? "";
  if (!TG_SECRET) TG_SECRET = (await setting("tg_secret")) ?? "";
  TG = `https://api.telegram.org/bot${TG_TOKEN}`;
}

const STATUS_RU: Record<string, string> = {
  inbox: "📥 Вход", script: "✍️ Сценарий", ready: "✅ Готов к съёмке", shot: "🎥 Снят",
  edit: "✂️ Монтаж", done: "🎬 Готово", published: "🚀 Опубликован", dropped: "🗑 Отменён",
};

// ---------- Supabase REST ----------
async function db(path: string, init: RequestInit = {}, prefer = "return=representation") {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json", Prefer: prefer, ...(init.headers ?? {}),
    },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${path}: ${r.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
const setting = async (key: string) =>
  (await db(`brand_settings?key=eq.${key}&select=value`))?.[0]?.value ?? null;
const setSetting = (key: string, value: string) =>
  db("brand_settings", { method: "POST", body: JSON.stringify({ key, value }) }, "resolution=merge-duplicates,return=minimal");

// ---------- Telegram ----------
async function tg(method: string, body: Record<string, unknown>) {
  const r = await fetch(`${TG}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return r.json();
}
const send = (chat_id: number | string, text: string, extra: Record<string, unknown> = {}) =>
  tg("sendMessage", { chat_id, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function filePath(file_id: string) {
  const j = await tg("getFile", { file_id });
  return j?.result?.file_path ?? null;
}

// ---------- кнопки под сценарием ----------
function approveKeyboard(id: string) {
  return { inline_keyboard: [[
    { text: "✅ Ок", callback_data: `ok:${id}` },
    { text: "🔁 Переписать", callback_data: `rw:${id}` },
    { text: "🗑 В мусор", callback_data: `drop:${id}` },
  ]] };
}

async function sendScript(chat_id: number | string, id: string) {
  const v = (await db(`brand_videos?id=eq.${id}&select=*`))?.[0];
  if (!v) return send(chat_id, `Ролик ${id} не найден`);
  const hooks = (v.hook_variants ?? []).map((h: string, i: number) => `${i + 1}. ${esc(h)}`).join("\n");
  const body =
    `<b>${esc(v.id)} · ${esc(v.title || "")}</b>\n` +
    `${esc(v.lang)} · ${(v.tags ?? []).map((t: string) => "#" + t).join(" ")}\n\n` +
    `<b>Мысль:</b> ${esc(v.main_idea || "—")}\n\n` +
    (hooks ? `<b>Начало — варианты:</b>\n${hooks}\n\n` : "") +
    `<b>Сценарий (v${v.script_version}):</b>\n${esc(v.script || "—")}\n\n` +
    `⏱ ~${v.duration_sec ?? "?"} сек`;
  return send(chat_id, body.slice(0, 4000), { reply_markup: approveKeyboard(id) });
}

async function sendBatch(chat_id: number | string) {
  const batch = (await db(`brand_batches?status=in.(planned,shooting)&order=created_at.desc&limit=1`))?.[0];
  if (!batch) return send(chat_id, "Нет открытой партии");
  const vids = await db(`brand_videos?batch_id=eq.${batch.id}&status=eq.ready&order=shoot_order.asc.nullslast,id.asc&select=id,title,duration_sec,lang`);
  if (!vids.length) return send(chat_id, `Партия ${batch.id}: нет роликов со статусом ✅ Готов`);
  const list = vids.map((v: any, i: number) => `${i + 1}. <b>${v.id}</b> — ${esc(v.title)} (${v.lang}, ~${v.duration_sec ?? "?"}с)`).join("\n");
  await send(chat_id, `🎬 <b>Партия ${batch.id}</b>\n\n${list}\n\nТекст суфлёра: /p ${vids[0].id}\nОтметить снятым: /shot ${vids[0].id}`);
}

async function sendPrompter(chat_id: number | string, id: string) {
  const v = (await db(`brand_videos?id=eq.${id}&select=id,title,prompter,status`))?.[0];
  if (!v) return send(chat_id, `Ролик ${id} не найден`);
  if (v.status !== "ready" && v.status !== "shot") return send(chat_id, `⚠️ ${id} не утверждён (${STATUS_RU[v.status]}). В суфлёр не отдаю.`);
  if (!v.prompter) return send(chat_id, `У ${id} нет текста суфлёра`);
  // отдельным сообщением — чистый текст, удобно скопировать целиком
  await send(chat_id, `🎙 <b>${v.id}</b> · ${esc(v.title)}`);
  return tg("sendMessage", { chat_id, text: v.prompter.slice(0, 4000) });
}

async function setStatus(id: string, status: string) {
  await db(`brand_videos?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status }) }, "return=minimal");
}

// ---------- приём входящих ----------
async function intake(msg: any) {
  const chat_id = msg.chat.id;
  const user = msg.from?.username ?? String(msg.from?.id ?? "");
  let kind = "text", text: string | null = msg.text ?? msg.caption ?? null, url: string | null = null;
  let file_id: string | null = null, file_unique_id: string | null = null;

  if (msg.voice) { kind = "voice"; file_id = msg.voice.file_id; file_unique_id = msg.voice.file_unique_id; }
  else if (msg.audio) { kind = "audio"; file_id = msg.audio.file_id; file_unique_id = msg.audio.file_unique_id; }
  else if (msg.video) { kind = "video"; file_id = msg.video.file_id; file_unique_id = msg.video.file_unique_id; }
  else if (msg.video_note) { kind = "video"; file_id = msg.video_note.file_id; file_unique_id = msg.video_note.file_unique_id; }
  else if (msg.photo) { const p = msg.photo.at(-1); kind = "photo"; file_id = p.file_id; file_unique_id = p.file_unique_id; }
  else if (msg.document) { kind = "document"; file_id = msg.document.file_id; file_unique_id = msg.document.file_unique_id; }
  else if (msg.forward_origin || msg.forward_from || msg.forward_from_chat) { kind = "forward"; }

  if (text) {
    const m = text.match(/https?:\/\/\S+/);
    if (m) { url = m[0]; if (kind === "text") kind = "link"; }
  }
  if (!text && !file_id) return;

  const file_path = file_id ? await filePath(file_id) : null;
  try {
    await db("brand_inbox", {
      method: "POST",
      body: JSON.stringify({ tg_chat_id: chat_id, tg_message_id: msg.message_id, tg_user: user, kind, text, url, file_id, file_unique_id, file_path }),
    }, "return=minimal");
  } catch (e) {
    if (String(e).includes("23505")) return send(chat_id, "Это уже во входящих");
    throw e;
  }
  const n = (await db(`brand_inbox?processed=eq.false&select=id`))?.length ?? 0;
  const label: Record<string, string> = { text: "идея", voice: "голосовое", audio: "аудио", link: "референс", photo: "скрин", video: "видео", document: "файл", forward: "пересланное" };
  await send(chat_id, `📥 Принято: ${label[kind] ?? kind}. Во входящих: ${n}`);
}

// ---------- команды ----------
async function command(msg: any) {
  const chat_id = msg.chat.id;
  const [cmd, ...rest] = (msg.text as string).trim().split(/\s+/);
  const arg = rest.join(" ");
  switch (cmd.split("@")[0]) {
    case "/start":
      await setSetting("tg_chat_id", String(chat_id));
      return send(chat_id,
        "Привет, Фархат. Это вход в конвейер.\n\n" +
        "Кидай сюда идеи, голосовые, ссылки на референсы, скрины — всё попадает во «Вход».\n\n" +
        "/queue — очередь по статусам\n/batch — текущая партия на съёмку\n/p ID — текст суфлёра\n/shot ID — отметить снятым\n/script ID — показать сценарий с кнопками");
    case "/queue": {
      const rows = await db(`brand_videos?status=not.in.(published,dropped)&select=id,title,status&order=status,id`);
      if (!rows.length) return send(chat_id, "Очередь пуста");
      const by: Record<string, string[]> = {};
      for (const r of rows) (by[r.status] ??= []).push(`  ${r.id} ${esc(r.title)}`);
      const inbox = (await db(`brand_inbox?processed=eq.false&select=id`)).length;
      const out = Object.entries(by).map(([s, l]) => `<b>${STATUS_RU[s]}</b>\n${l.join("\n")}`).join("\n\n");
      return send(chat_id, `📥 Вход (не разобрано): ${inbox}\n\n${out}`);
    }
    case "/batch": return sendBatch(chat_id);
    case "/p": return arg ? sendPrompter(chat_id, arg) : send(chat_id, "Укажи ID: /p 2610-01");
    case "/script": return arg ? sendScript(chat_id, arg) : send(chat_id, "Укажи ID: /script 2610-01");
    case "/shot":
      if (!arg) return send(chat_id, "Укажи ID: /shot 2610-01");
      await setStatus(arg, "shot");
      return send(chat_id, `🎥 ${arg} — снят`);
    case "/id": return send(chat_id, `chat_id: <code>${chat_id}</code>`);
    default: return send(chat_id, "Не знаю такую команду. /start — список");
  }
}

async function callback(cb: any) {
  const [action, id] = (cb.data as string).split(":");
  const chat_id = cb.message.chat.id;
  const map: Record<string, [string, string]> = {
    ok: ["ready", `✅ ${id} утверждён → готов к съёмке`],
    rw: ["script", `🔁 ${id} — переписываю. Напиши, что не так, или просто «переделай»`],
    drop: ["dropped", `🗑 ${id} — в мусор`],
  };
  const m = map[action];
  if (!m) return;
  await setStatus(id, m[0]);
  if (action === "rw") await db("brand_log", { method: "POST", body: JSON.stringify({ video_id: id, event: "rewrite_requested" }) }, "return=minimal");
  await tg("answerCallbackQuery", { callback_query_id: cb.id });
  await tg("editMessageReplyMarkup", { chat_id, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } });
  await send(chat_id, m[1]);
}

// ---------- HTTP ----------
Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (!TG) await initTg();

  // внутренний вызов с сайта/Claude: {action:"send_script", video_id} — с заголовком x-pipeline-key
  if (url.pathname.endsWith("/notify")) {
    const key = req.headers.get("x-pipeline-key");
    if (!key || key !== (await setting("pipeline_key"))) return new Response("forbidden", { status: 403 });
    const body = await req.json();
    const chat_id = await setting("tg_chat_id");
    if (!chat_id) return new Response("no chat: send /start to bot", { status: 400 });
    if (body.action === "send_script") await sendScript(chat_id, body.video_id);
    else if (body.action === "send_batch") await sendBatch(chat_id);
    else if (body.action === "message") await send(chat_id, esc(body.text ?? ""));
    return new Response("ok");
  }

  // GET /setup?key=PIPELINE_KEY — один раз: регистрирует webhook у Telegram
  if (url.pathname.endsWith("/setup")) {
    if (url.searchParams.get("key") !== (await setting("pipeline_key"))) return new Response("forbidden", { status: 403 });
    if (!TG_TOKEN) return new Response("TELEGRAM_BOT_TOKEN не задан", { status: 500 });
    const hook = `https://jxzswkwlfslcovmiiblv.supabase.co/functions/v1/brand-bot`;
    const r = await tg("setWebhook", { url: hook, secret_token: TG_SECRET || undefined, allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
    const me = await tg("getMe", {});
    await tg("setMyCommands", { commands: [
      { command: "queue", description: "Очередь по статусам" },
      { command: "batch", description: "Партия на съёмку" },
      { command: "p", description: "Текст суфлёра: /p ID" },
      { command: "shot", description: "Отметить снятым: /shot ID" },
      { command: "script", description: "Сценарий с кнопками: /script ID" },
    ]});
    return new Response(JSON.stringify({ webhook: hook, setWebhook: r, bot: me?.result?.username }, null, 2), { headers: { "content-type": "application/json" } });
  }

  if (req.method !== "POST") return new Response("brand-bot alive");
  if (TG_SECRET && req.headers.get("x-telegram-bot-api-secret-token") !== TG_SECRET)
    return new Response("forbidden", { status: 403 });
  if (!TG_TOKEN) return new Response("TELEGRAM_BOT_TOKEN not set", { status: 500 });

  try {
    const upd = await req.json();
    if (upd.callback_query) await callback(upd.callback_query);
    else if (upd.message) {
      const msg = upd.message;
      if (typeof msg.text === "string" && msg.text.startsWith("/")) await command(msg);
      else await intake(msg);
    }
  } catch (e) {
    console.error(e);
  }
  return new Response("ok"); // Telegram всегда должен получить 200
});
