# Brand Pipeline — контекст для Claude Code

Конвейер контента личного бренда Фархата Романова (Алматы, предприниматель: AI Trend, Trend Lenta, BrandTrend, HyperSky/Starlink KZ, Trend English). Контент про бизнес и практический ИИ для аудитории Казахстана, языки — казахский и русский. Общение с владельцем — по-русски, коротко, без воды.

## Архитектура

```
Telegram @farkhat_trend_bot ──► brand-bot (Supabase Edge Function) ──► Postgres brand_*
                                                                            ▲
GitHub Pages index.html (этот репозиторий) ── PostgREST (anon + x-pipeline-key) ─┘
                        └── brand-ai (Edge Function, ключи Anthropic/OpenAI из brand_settings)
```

- **Supabase project:** `jxzswkwlfslcovmiiblv` (регион eu-central-1, проект «kaizen-farkhat»; таблицы конвейера имеют префикс `brand_`, остальные таблицы проекта — другая система, не трогать).
- **Сайт:** https://farkhat-romanov.github.io/brand-pipeline/ — один файл `index.html`, без сборки. Деплой = push в `main`.
- **Тот же файл** работает и как артефакт внутри Claude (режим `mcp`: данные через коннектор Supabase `execute_sql`, ИИ через `sample`). Вне Claude — режим `rest` (PostgREST + `brand-ai`). Режим выбирается в конце `<script>` по наличию `window.claude`.

## Таблицы (все под RLS, политика `brand_rw` = заголовок `x-pipeline-key` равен `brand_settings.pipeline_key`)

| Таблица | Что |
|---|---|
| `brand_videos` | ролик: id `ГГММ-NN` (`brand_next_id()`), status, title, lang, format, tags[], source_ref, hook_variants jsonb, script, script_version, prompter, duration_sec, edit_plan, broll, ai_prompts, cover_text, caption, batch_id, shoot_order, published_url, metrics jsonb, review |
| `brand_inbox` | входящие из Telegram: kind, text, url, file_id, file_path, transcript, processed, video_id; unique(tg_chat_id, tg_message_id) |
| `brand_batches` | партии съёмки `ГГГГ-ММ-B1`: status planned/shooting/shot/edited/closed |
| `brand_hooks` | библиотека хуков: category, name, formula, example_ru, example_kz, when_to_use |
| `brand_frameworks` | структуры ролика (AIDA-60, PAS-45, …): beats с таймингом, words, when_to_use |
| `brand_voice` | авторский голос: kind rule/fact/avoid/sample, content — попадает в каждый промпт |
| `brand_log` | история смен статусов (триггер) |
| `brand_settings` | **без политик RLS** (читает только service role): pipeline_key, tg_token, tg_secret, tg_chat_id, anthropic_key, anthropic_workspace, openai_key, ai_model, ai_model_quick, openai_model, openai_model_quick, whisper_model |

Статусы: `inbox → script → ready → shot → edit → done → published`, плюс `dropped`.

## Edge Functions (verify_jwt = false)

- `brand-bot` — webhook Telegram. Команды: /start /queue /batch /p ID /shot ID /script ID. Кнопки Ок/Переписать/В мусор меняют статус. Маршруты: `POST /notify` (с `x-pipeline-key`: send_script / send_batch / message), `GET /setup?key=` (регистрирует webhook). Токен берёт из `brand_settings.tg_token`.
- `brand-ai` — прокси к ИИ. `POST {prompt, tier: default|quick, provider?}` с `x-pipeline-key` → `{text, model, provider}`; порядок: Anthropic → OpenAI (если один падает, берёт другой). `POST /transcribe {file_url | tg_file_id, lang?}` → `{text}` (Whisper). Ключи в `brand_settings`. Ключ Anthropic типа `sk-ant-usr-` требует `anthropic_workspace` (ID воркспейса из console.anthropic.com → Workspaces).

Деплой функций: через Supabase MCP `deploy_edge_function` или `supabase functions deploy <name> --project-ref jxzswkwlfslcovmiiblv`.

## Правила работы

- Один источник статусов — база. Ничего не дублировать в других местах.
- Секреты (токены, ключи API) только в `brand_settings` или в секретах функций. В `index.html` допустим только publishable anon key.
- Сценарии: правила в `docs/SYSTEM.md` §8 и в `brand_voice`. Не выдумывать факты и цифры автора.
- Казахский — живая речь, не перевод с русского.
- После изменений `index.html` — проверить `node --check` на вырезанном `<script>` и запушить. GitHub Pages обновляется за ~1 мин.

## Что не сделано / идеи

- Anthropic-ключ сейчас не проходит без `anthropic_workspace` — пока все запросы идут в OpenAI (gpt-4o / gpt-4o-mini).

- Триггер «status=script → отправка в Telegram» через pg_net (миграция отменялась при применении). Пока вручную: `/script ID` в боте.
- Воронка подписки в ChatPlace для @farkhat_romanov (аккаунт ещё не подключён в ChatPlace/Virale).
- Автоотправка `/batch` в день съёмки, сбор метрик публикаций.
