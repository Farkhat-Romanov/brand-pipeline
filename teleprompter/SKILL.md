---
name: teleprompter-dropin
description: Add a ready-made full-featured teleprompter (суфлёр) to any web project by copying one vanilla JS file verbatim — no rewriting.
---

# Teleprompter drop-in

Use this when the user asks to add a teleprompter / суфлёр / prompter / autocue to a web project.

**Do not write a new teleprompter and do not modify the code below.** Copy it byte-for-byte into the project and wire it up. It is self-contained: injects its own scoped CSS (everything under `#tp-root`), builds its own DOM on first open, handles keys, fullscreen, wake lock and settings persistence.

## Steps

1. Create `teleprompter.js` with the exact contents of the code block at the end of this file. Put it where the project serves static files:
   - plain HTML / GitHub Pages → next to `index.html`
   - Vite / React / Vue → `public/teleprompter.js`
   - Next.js → `public/teleprompter.js`
2. Load it once:
   - HTML: `<script src="/teleprompter.js"></script>` (before scripts that call it)
   - Next.js: `<Script src="/teleprompter.js" strategy="afterInteractive" />` in the root layout
   - React/Vite SPA: add the `<script>` tag to `index.html`
   - TypeScript: add `declare global { interface Window { Teleprompter: any } } export {};`
3. Open it from the feature the user wants:
   ```js
   window.Teleprompter.open("text");                                  // single text
   window.Teleprompter.open([{ id: "01", title: "Ролик 1", text: "..." },
                             { id: "02", title: "Ролик 2", text: "..." }], 0);  // list, ← → switches
   ```
   No-JS option: `<button data-teleprompter="#textareaId">Суфлёр</button>` opens the content of that field.
4. Optional hooks: `Teleprompter.configure({ defaults: { speed: 35, size: 48 }, onEnd(item, i){}, onClose(item, i){}, onItem(item, i){}, storageKey: "teleprompter:cfg", fullscreen: true, wakeLock: true })`.
5. Helpers: `Teleprompter.splitLines(text, 7)` breaks prose into 5–7-word lines with a blank line after each sentence; `Teleprompter.estimate(text)` → `{words, seconds}` at 2.3 words/s.
6. Verify: open the page, call `Teleprompter.open("test")`, press Space — text scrolls; Esc closes. Check the browser console for errors.

## What the user gets (do not re-implement any of it)

Start/pause/stop, countdown 0/3/5, speed 10–160 px/s, font size 20–96, column width, side margins, line height, letter spacing, weight, font (sans/mono/serif), alignment, text and background colour, reading line with adjustable height, top/bottom shading, mirror, vertical flip, progress bar, elapsed/total time recalculated from speed, multi-item switching, tap text = pause, hide controls, fullscreen, screen wake lock, settings saved in localStorage.

Keys: Space start/pause · ↑↓ speed · + − size · ← → item · Home restart · M mirror · R flip · H hide panel · S settings · Esc close. Russian layout works too (ь к р ы).

Text format: one phrase per line, blank line = pause. Only what is spoken — no stage directions.

## teleprompter.js — copy verbatim

```js
/*!
 * Teleprompter v1.0 — drop-in суфлёр, один файл, без зависимостей.
 * Подключение:  <script src="teleprompter.js"></script>
 * Запуск:       Teleprompter.open("Текст...")
 *               Teleprompter.open([{id:"01", title:"Ролик 1", text:"..."}, ...], 0)
 * Всё остальное (CSS, разметка, клавиши, настройки) модуль делает сам.
 */
(function (global) {
  "use strict";
  if (global.Teleprompter) return;

  // ---------- CSS (всё под #tp-root, ничего не задевает в проекте) ----------
  var CSS = [
    "#tp-root{position:fixed;inset:0;z-index:2147483000;background:var(--tp-bg,#000);color:var(--tp-fg,#fff);display:flex;flex-direction:column;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;--tp-guide:45%;-webkit-font-smoothing:antialiased}",
    "#tp-root[hidden],#tp-root [hidden]{display:none!important}",
    "#tp-root *{box-sizing:border-box}",
    "#tp-root button,#tp-root select,#tp-root input{font:inherit;color:inherit}",
    "#tp-root .tp-ctl{display:flex;gap:6px;align-items:center;padding:6px 10px;padding-top:calc(6px + env(safe-area-inset-top,0px));background:#141414;color:#eee;flex-wrap:wrap;font-size:12px;border-bottom:1px solid #2a2a2a}",
    "#tp-root .tp-ctl button,#tp-root .tp-set button{background:#242424;border:1px solid #3a3a3a;color:#fff;padding:5px 9px;font-size:12px;border-radius:7px;cursor:pointer;font-weight:600}",
    "#tp-root .tp-ctl button:hover{border-color:#e2772e}",
    "#tp-root .tp-ctl button:disabled{opacity:.4;cursor:default}",
    "#tp-root .tp-ctl button.tp-on{background:#e2772e;border-color:#e2772e;color:#1b120a}",
    "#tp-root .tp-ctl button.tp-play{background:#e2772e;border-color:#e2772e;color:#1b120a}",
    "#tp-root button:focus-visible,#tp-root select:focus-visible,#tp-root input:focus-visible{outline:2px solid #e2772e;outline-offset:1px}",
    "#tp-root label{display:flex;align-items:center;gap:4px;white-space:nowrap}",
    "#tp-root input[type=range]{width:90px;padding:0;background:transparent;border:none;accent-color:#e2772e}",
    "#tp-root input[type=color]{width:28px;height:24px;padding:0;border:1px solid #3a3a3a;border-radius:6px;background:transparent}",
    "#tp-root input[type=checkbox]{accent-color:#e2772e}",
    "#tp-root select{background:#242424;color:#fff;border:1px solid #3a3a3a;border-radius:6px;padding:3px 6px;font-size:12px}",
    "#tp-root .tp-sp{flex:1}",
    "#tp-root .tp-mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}",
    "#tp-root .tp-tm{font-size:13px;min-width:110px;text-align:right}",
    "#tp-root .tp-set{display:none;gap:10px;flex-wrap:wrap;padding:6px 10px;background:#1a1a1a;border-bottom:1px solid #2a2a2a;font-size:12px;color:#ddd}",
    "#tp-root.tp-show-set .tp-set{display:flex}",
    "#tp-root .tp-stage{flex:1;position:relative;min-height:0}",
    "#tp-root .tp-scroll{position:absolute;inset:0;overflow-y:auto;cursor:pointer;transform:scale(var(--tp-mx,1),var(--tp-my,1));-webkit-overflow-scrolling:touch}",
    "#tp-root .tp-txt{max-width:var(--tp-width,900px);margin:0 auto;padding:var(--tp-pad-top,40vh) var(--tp-margin,24px) 70vh;font-size:var(--tp-size,44px);line-height:var(--tp-line,1.35);letter-spacing:var(--tp-ls,0);font-weight:var(--tp-weight,600);white-space:pre-wrap;text-align:var(--tp-align,center);font-family:var(--tp-font,inherit);overflow-wrap:break-word}",
    "#tp-root .tp-guide{position:absolute;left:0;right:0;top:var(--tp-guide);height:0;border-top:2px solid rgba(226,119,46,.75);pointer-events:none}",
    "#tp-root .tp-guide:before,#tp-root .tp-guide:after{content:'';position:absolute;top:-7px;border:7px solid transparent}",
    "#tp-root .tp-guide:before{left:0;border-left-color:#e2772e}",
    "#tp-root .tp-guide:after{right:0;border-right-color:#e2772e}",
    "#tp-root.tp-no-guide .tp-guide{display:none}",
    "#tp-root .tp-shade{position:absolute;left:0;right:0;pointer-events:none}",
    "#tp-root .tp-shade.tp-top{top:0;height:calc(var(--tp-guide) - 60px);background:linear-gradient(to bottom,var(--tp-bg,#000),transparent)}",
    "#tp-root .tp-shade.tp-bot{bottom:0;height:25%;background:linear-gradient(to top,var(--tp-bg,#000),transparent)}",
    "#tp-root.tp-no-shade .tp-shade{display:none}",
    "#tp-root .tp-count{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:30vmin;font-weight:800;background:rgba(0,0,0,.7);color:#fff}",
    "#tp-root .tp-prog{position:absolute;left:0;right:0;bottom:0;height:4px;background:#333}",
    "#tp-root .tp-prog i{display:block;height:100%;width:0;background:#e2772e}",
    "#tp-root .tp-tap{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);font-size:12px;color:#888;pointer-events:none}",
    "#tp-root.tp-ctl-hidden .tp-ctl,#tp-root.tp-ctl-hidden .tp-set{display:none}",
    "#tp-root.tp-running .tp-tap{display:none}"
  ].join("\n");

  // ---------- разметка ----------
  var HTML =
    '<div class="tp-ctl">' +
      '<button data-a="prev" title="← предыдущий">‹</button>' +
      '<span class="tp-mono" data-e="title"></span>' +
      '<button data-a="next" title="→ следующий">›</button>' +
      '<button data-a="play" class="tp-play" title="Пробел">▶ Старт</button>' +
      '<button data-a="stop" title="Home — в начало">■</button>' +
      '<label>Скорость <input type="range" data-k="speed" min="10" max="160"><span class="tp-mono" data-e="speedV"></span></label>' +
      '<label>Размер <input type="range" data-k="size" min="20" max="96"><span class="tp-mono" data-e="sizeV"></span></label>' +
      '<button data-a="mirror" title="M">Зеркало</button>' +
      '<button data-a="flip" title="R">Переворот</button>' +
      '<button data-a="settings" title="S">Настройки</button>' +
      '<span class="tp-sp"></span>' +
      '<span class="tp-tm tp-mono"><span data-e="elapsed">0:00</span> / <span data-e="total">0:00</span></span>' +
      '<button data-a="hide" title="H">Скрыть</button>' +
      '<button data-a="close" title="Esc">✕</button>' +
    '</div>' +
    '<div class="tp-set">' +
      '<label>Отсчёт <select data-k="count"><option value="0">нет</option><option value="3">3</option><option value="5">5</option></select></label>' +
      '<label>Ширина <input type="range" data-k="width" min="400" max="1600"></label>' +
      '<label>Поля <input type="range" data-k="margin" min="0" max="120"></label>' +
      '<label>Интервал <input type="range" data-k="line" min="110" max="200"></label>' +
      '<label>Разрядка <input type="range" data-k="ls" min="0" max="8"></label>' +
      '<label>Линия <input type="range" data-k="guide" min="15" max="70"></label>' +
      '<label>Жирность <select data-k="weight"><option value="400">обычная</option><option value="600">полужирная</option><option value="800">жирная</option></select></label>' +
      '<label>Выравнивание <select data-k="align"><option value="center">центр</option><option value="left">слева</option></select></label>' +
      '<label>Шрифт <select data-k="font"><option value="sans">без засечек</option><option value="mono">моно</option><option value="serif">с засечками</option></select></label>' +
      '<label>Текст <input type="color" data-k="fg"></label>' +
      '<label>Фон <input type="color" data-k="bg"></label>' +
      '<label><input type="checkbox" data-k="guideOn"> линия чтения</label>' +
      '<label><input type="checkbox" data-k="shadeOn"> затемнение</label>' +
      '<button data-a="reset">Сбросить</button>' +
    '</div>' +
    '<div class="tp-stage">' +
      '<div class="tp-scroll" data-e="scroll"><div class="tp-txt" data-e="txt"></div></div>' +
      '<div class="tp-shade tp-top"></div><div class="tp-shade tp-bot"></div>' +
      '<div class="tp-guide"></div>' +
      '<div class="tp-count" data-e="count" hidden></div>' +
      '<div class="tp-tap">тап — старт / пауза</div>' +
      '<div class="tp-prog"><i data-e="prog"></i></div>' +
    '</div>';

  // ---------- состояние ----------
  var DEF = { speed: 40, size: 44, count: 3, width: 900, margin: 24, line: 135, ls: 0, guide: 45, weight: 600, align: "center", font: "sans", fg: "#ffffff", bg: "#000000", guideOn: true, shadeOn: true };
  var NUM = { speed: 1, size: 1, count: 1, width: 1, margin: 1, line: 1, ls: 1, guide: 1, weight: 1 };
  var FONTS = { sans: "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", mono: "ui-monospace,Menlo,Consolas,monospace", serif: "Georgia,'Times New Roman',serif" };
  var opts = { storageKey: "teleprompter:cfg", fullscreen: true, wakeLock: true, defaults: {}, onClose: null, onEnd: null, onItem: null };
  var root = null, E = {}, cfg = null, seq = [], idx = 0;
  var running = false, raf = 0, last = 0, elapsed = 0, mirror = false, flip = false, countTimer = 0, wake = null;

  function $(sel) { return root.querySelector(sel); }
  function loadCfg() {
    var base = Object.assign({}, DEF, opts.defaults || {});
    try { var s = localStorage.getItem(opts.storageKey); if (s) return Object.assign(base, JSON.parse(s)); } catch (e) {}
    return base;
  }
  function saveCfg() { try { localStorage.setItem(opts.storageKey, JSON.stringify(cfg)); } catch (e) {} }
  function fmt(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
  function travel() { return Math.max(1, E.scroll.scrollHeight - E.scroll.clientHeight); }

  function build() {
    if (root) return;
    var st = document.createElement("style"); st.id = "tp-style"; st.textContent = CSS; document.head.appendChild(st);
    root = document.createElement("div"); root.id = "tp-root"; root.hidden = true; root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "Суфлёр");
    root.innerHTML = HTML; document.body.appendChild(root);
    root.querySelectorAll("[data-e]").forEach(function (el) { E[el.getAttribute("data-e")] = el; });
    cfg = loadCfg();

    root.querySelectorAll("[data-k]").forEach(function (el) {
      var k = el.getAttribute("data-k");
      var ev = (el.tagName === "SELECT" || el.type === "checkbox") ? "change" : "input";
      el.addEventListener(ev, function () {
        cfg[k] = el.type === "checkbox" ? el.checked : (NUM[k] ? Number(el.value) : el.value);
        apply();
      });
    });
    root.querySelectorAll("[data-a]").forEach(function (el) {
      el.addEventListener("click", function (e) { e.stopPropagation(); act(el.getAttribute("data-a")); });
    });
    E.scroll.addEventListener("click", function () {
      if (root.classList.contains("tp-ctl-hidden")) { root.classList.remove("tp-ctl-hidden"); return; }
      toggle();
    });
    E.scroll.addEventListener("scroll", function () { if (!running) E.prog.style.width = (E.scroll.scrollTop / travel() * 100) + "%"; });
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", updateTotal);
    document.addEventListener("visibilitychange", function () { if (isOpen() && document.visibilityState === "visible" && opts.wakeLock) lockWake(); });
  }

  function apply() {
    var s = root.style, c = cfg;
    s.setProperty("--tp-size", c.size + "px"); s.setProperty("--tp-width", c.width + "px"); s.setProperty("--tp-margin", c.margin + "px");
    s.setProperty("--tp-line", c.line / 100); s.setProperty("--tp-ls", (c.ls / 20) + "em"); s.setProperty("--tp-guide", c.guide + "%");
    s.setProperty("--tp-weight", c.weight); s.setProperty("--tp-align", c.align); s.setProperty("--tp-font", FONTS[c.font] || FONTS.sans);
    s.setProperty("--tp-fg", c.fg); s.setProperty("--tp-bg", c.bg);
    s.setProperty("--tp-mx", mirror ? -1 : 1); s.setProperty("--tp-my", flip ? -1 : 1);
    root.classList.toggle("tp-no-guide", !c.guideOn); root.classList.toggle("tp-no-shade", !c.shadeOn);
    $('[data-a="mirror"]').classList.toggle("tp-on", mirror); $('[data-a="flip"]').classList.toggle("tp-on", flip);
    root.querySelectorAll("[data-k]").forEach(function (el) {
      var k = el.getAttribute("data-k");
      if (el.type === "checkbox") el.checked = !!c[k]; else el.value = c[k];
    });
    E.speedV.textContent = c.speed; E.sizeV.textContent = c.size;
    saveCfg(); updateTotal();
  }

  // первая строка стартует ровно на линии чтения (padding в % считается от ширины, поэтому считаем в px)
  function placeStart() {
    if (!isOpen()) return;
    var line = cfg.size * cfg.line / 100;
    root.style.setProperty("--tp-pad-top", Math.max(0, E.scroll.clientHeight * cfg.guide / 100 - line * 0.75) + "px");
  }
  function updateTotal() { if (!isOpen()) return; placeStart(); E.total.textContent = fmt(travel() / cfg.speed); }

  function loadItem() {
    var v = seq[idx];
    E.txt.textContent = v.text;
    E.title.textContent = (v.title || v.id || "") + (seq.length > 1 ? " · " + (idx + 1) + "/" + seq.length : "");
    stop(true);
    $('[data-a="prev"]').disabled = idx === 0;
    $('[data-a="next"]').disabled = idx >= seq.length - 1;
    requestAnimationFrame(updateTotal);
    if (typeof opts.onItem === "function") try { opts.onItem(v, idx); } catch (e) {}
  }

  function stop(reset) {
    running = false; cancelAnimationFrame(raf); clearTimeout(countTimer); E.count.hidden = true;
    root.classList.remove("tp-running");
    $('[data-a="play"]').textContent = "▶ Старт";
    if (reset) { E.scroll.scrollTop = 0; elapsed = 0; E.elapsed.textContent = "0:00"; E.prog.style.width = "0"; }
  }
  function start() {
    if (running) return;
    var go = function () { running = true; root.classList.add("tp-running"); $('[data-a="play"]').textContent = "⏸ Пауза"; last = performance.now(); raf = requestAnimationFrame(step); };
    var n = E.scroll.scrollTop < 5 ? Number(cfg.count) : 0;
    if (n > 0) countdown(n, go); else go();
  }
  function toggle() { if (running || !E.count.hidden) stop(false); else start(); }
  function step(t) {
    if (!running) return;
    var dt = (t - last) / 1000; last = t; elapsed += dt;
    E.scroll.scrollTop += cfg.speed * dt;
    E.elapsed.textContent = fmt(elapsed);
    E.prog.style.width = (E.scroll.scrollTop / travel() * 100) + "%";
    if (E.scroll.scrollTop >= travel() - 1) {
      stop(false); $('[data-a="play"]').textContent = "✓ Конец";
      if (typeof opts.onEnd === "function") try { opts.onEnd(seq[idx], idx); } catch (e) {}
      return;
    }
    raf = requestAnimationFrame(step);
  }
  function countdown(n, done) {
    E.count.hidden = false; E.count.textContent = n;
    var tick = function () { n--; if (n <= 0) { E.count.hidden = true; done(); } else { E.count.textContent = n; countTimer = setTimeout(tick, 1000); } };
    countTimer = setTimeout(tick, 1000);
  }

  function act(a) {
    if (a === "play") toggle();
    else if (a === "stop") stop(true);
    else if (a === "prev") { if (idx > 0) { idx--; loadItem(); } }
    else if (a === "next") { if (idx < seq.length - 1) { idx++; loadItem(); } }
    else if (a === "mirror") { mirror = !mirror; apply(); }
    else if (a === "flip") { flip = !flip; apply(); }
    else if (a === "settings") root.classList.toggle("tp-show-set");
    else if (a === "hide") root.classList.add("tp-ctl-hidden");
    else if (a === "reset") { cfg = Object.assign({}, DEF, opts.defaults || {}); apply(); }
    else if (a === "close") close();
  }

  function onKey(e) {
    if (!isOpen()) return;
    var t = e.target;
    if (t && t.matches && t.matches("input:not([type=range]):not([type=checkbox]),textarea,select")) return;
    var k = (e.key || "").toLowerCase();
    var map = { " ": "play", "escape": "close", "arrowright": "next", "arrowleft": "prev", "home": "stop",
                "m": "mirror", "ь": "mirror", "r": "flip", "к": "flip", "s": "settings", "ы": "settings" };
    if (k === "arrowup") { e.preventDefault(); cfg.speed = Math.min(160, cfg.speed + 5); apply(); return; }
    if (k === "arrowdown") { e.preventDefault(); cfg.speed = Math.max(10, cfg.speed - 5); apply(); return; }
    if (k === "+" || k === "=") { cfg.size = Math.min(96, cfg.size + 2); apply(); return; }
    if (k === "-" || k === "_") { cfg.size = Math.max(20, cfg.size - 2); apply(); return; }
    if (k === "h" || k === "р") { root.classList.toggle("tp-ctl-hidden"); return; }
    if (map[k]) { e.preventDefault(); act(map[k]); }
  }

  function lockWake() {
    try { if (navigator.wakeLock && !wake) navigator.wakeLock.request("screen").then(function (w) { wake = w; w.addEventListener("release", function () { wake = null; }); }).catch(function () {}); } catch (e) {}
  }
  function unlockWake() { try { if (wake) wake.release(); } catch (e) {} wake = null; }

  function normalize(input) {
    if (typeof input === "string") return [{ id: "", title: "", text: input }];
    if (!Array.isArray(input)) input = [input];
    return input.map(function (v, i) {
      if (typeof v === "string") return { id: String(i + 1), title: "", text: v };
      return { id: v.id != null ? String(v.id) : String(i + 1), title: v.title || "", text: String(v.text != null ? v.text : (v.prompter || "")) };
    }).filter(function (v) { return v.text.trim(); });
  }

  // ---------- публичный API ----------
  function open(input, startIndex) {
    build();
    seq = normalize(input);
    if (!seq.length) { console.warn("[Teleprompter] пустой текст"); return false; }
    idx = Math.max(0, Math.min(Number(startIndex) || 0, seq.length - 1));
    root.hidden = false; root.classList.remove("tp-ctl-hidden");
    document.documentElement.style.overflow = "hidden";
    apply(); loadItem();
    if (opts.fullscreen && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {});
    if (opts.wakeLock) lockWake();
    return true;
  }
  function close() {
    if (!root || root.hidden) return;
    stop(false); root.hidden = true; root.classList.remove("tp-show-set", "tp-ctl-hidden");
    document.documentElement.style.overflow = "";
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
    unlockWake();
    if (typeof opts.onClose === "function") try { opts.onClose(seq[idx], idx); } catch (e) {}
  }
  function isOpen() { return !!root && !root.hidden; }
  function configure(o) { Object.assign(opts, o || {}); if (root) { cfg = loadCfg(); apply(); } }
  function estimate(text, wps) { var w = String(text || "").trim().split(/\s+/).filter(Boolean).length; return { words: w, seconds: Math.round(w / (wps || 2.3)) }; }
  // Разбивает сплошной текст на строки по 5–7 слов, пустая строка после конца предложения
  function splitLines(text, maxWords) {
    maxWords = maxWords || 7;
    var words = String(text || "").replace(/\s+/g, " ").trim().split(" "), out = [], cur = [];
    words.forEach(function (w) {
      if (!w) return; cur.push(w);
      var end = /[.!?…]$/.test(w);
      if (cur.length >= maxWords || end) { out.push(cur.join(" ")); if (end) out.push(""); cur = []; }
    });
    if (cur.length) out.push(cur.join(" "));
    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  global.Teleprompter = { open: open, close: close, isOpen: isOpen, configure: configure, splitLines: splitLines, estimate: estimate, version: "1.0" };

  // Авто-кнопки: <button data-teleprompter="#id-текстового-поля">  или  data-teleprompter-text="..."
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest && e.target.closest("[data-teleprompter],[data-teleprompter-text]");
    if (!b) return;
    var sel = b.getAttribute("data-teleprompter"), text = b.getAttribute("data-teleprompter-text");
    if (sel) { var src = document.querySelector(sel); text = src ? (src.value != null ? src.value : src.textContent) : ""; }
    if (text) { e.preventDefault(); open(text); }
  });
})(window);
```
