// Не используется для хостинга: Supabase отдаёт text/html как text/plain (анти-фишинг).
// Оставлено как заготовка. Сайт живёт на GitHub Pages (index.html в корне репозитория).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
Deno.serve(() => new Response("see https://farkhat-romanov.github.io/brand-pipeline/", { status: 302, headers: { Location: "https://farkhat-romanov.github.io/brand-pipeline/" } }));
