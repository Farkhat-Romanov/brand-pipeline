# Teleprompter — drop-in суфлёр

Один файл `teleprompter.js`, без зависимостей и сборки. Сам добавляет CSS (всё под `#tp-root`), разметку, горячие клавиши, сохранение настроек.

## Подключить (3 шага)

1. Скопируй `teleprompter.js` в проект **без изменений** (например в `public/`).
2. Подключи: `<script src="/teleprompter.js"></script>`
3. Вызови:

```js
Teleprompter.open("Текст для суфлёра");                         // один текст
Teleprompter.open([{ id: "01", title: "Ролик 1", text: "..." },  // несколько, листаются ← →
                   { id: "02", title: "Ролик 2", text: "..." }], 0);
```

Без JS: `<button data-teleprompter="#my-textarea">Суфлёр</button>` — откроет текст из поля.

## React / Next.js / Vue

```js
// один раз, например в layout / main
useEffect(() => { import("/teleprompter.js"); }, []);           // или <Script src="/teleprompter.js" /> в Next.js
// где нужно
window.Teleprompter.open(text);
```
TypeScript: `declare global { interface Window { Teleprompter: any } }`

## API

| Метод | Что делает |
|---|---|
| `open(input, startIndex?)` | `input` — строка, массив строк или массив `{id, title, text}` (поле `prompter` тоже принимается) |
| `close()` | закрыть |
| `isOpen()` | открыт ли |
| `configure(opts)` | `{ storageKey, fullscreen, wakeLock, defaults, onClose, onEnd, onItem }` |
| `splitLines(text, maxWords=7)` | разбить сплошной текст на строки для суфлёра |
| `estimate(text, wps=2.3)` | `{words, seconds}` — хронометраж |

`defaults` — стартовые настройки: `{ speed: 40, size: 44, count: 3, width: 900, margin: 24, line: 135, ls: 0, guide: 45, weight: 600, align: "center", font: "sans", fg: "#ffffff", bg: "#000000", guideOn: true, shadeOn: true }`. После первого изменения пользователем настройки берутся из `localStorage[storageKey]`.

## Функции

Старт/пауза/стоп · отсчёт 3/5 · скорость 10–160 px/с · размер 20–96 · ширина колонки · поля · интервал · разрядка · жирность · шрифт · выравнивание · цвет текста и фона · линия чтения (позиция регулируется) · затемнение сверху/снизу · зеркало · переворот · прогресс-бар · прошло/всего (пересчёт от скорости) · переключение роликов · тап по тексту = пауза · скрытие панели · полный экран · экран не гаснет (Wake Lock) · настройки сохраняются.

Клавиши: `Пробел` старт/пауза · `↑↓` скорость · `+ −` размер · `← →` ролик · `Home` в начало · `M` зеркало · `R` переворот · `H` панель · `S` настройки · `Esc` выход. Работают и в русской раскладке.

## Готовая страница

`index.html` в этой папке — самостоятельный суфлёр: вставил текст → открыл. Ролики разделяются строкой `---`.
