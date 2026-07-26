---
name: web-design-guidelines
description: >-
  Review-TIME audit of EXISTING UI code for interface-correctness — accessibility, focus, keyboard,
  forms, states, motion, typography detail, and copy — returning terse file:line findings. Use when
  asked to "review my UI", "check accessibility", "audit the UI/UX", or "check this screen against
  best practices". Self-contained/offline, translated to Vue 3 + Vuetify 4; defers to vuetify-ds for
  anything visual. NOT design generation or layout/composition (that's frontend-design) and NOT
  Vue/TypeScript code idioms (that's vue-best-practices).
metadata:
  author: Adapted from Vercel's Web Interface Guidelines
  source: https://github.com/vercel-labs/web-interface-guidelines
  version: "2.0.0-template"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

A self-contained checklist for reviewing UI **code correctness** in this app. It is intentionally
inlined (no network fetch) so it works offline and in headless runs, and it has been translated to
this stack: **Vue 3 + Vuetify 4 + vue-router 5**, IBM Carbon icons, no Tailwind, no React, no SSR.

**Scope boundaries (read first):**

- **Defer to `vuetify-ds` for anything visual** — colors, radius, spacing, type scale, component
  choice. This skill checks whether the UI *works and is accessible*, not whether it's on-brand.
  If a fix would touch a token, phrase it in token terms and point at vuetify-ds.
- **Vuetify already ships** ripple/focus/hover, label association, and hit targets on `<v-*>`
  components. Only flag these on **hand-rolled** surfaces (`v-sheet` + scoped CSS, plain
  `<div>`/`<span>` with `@click`) — never recommend hand-rolling what a `<v-*>` component provides.
- **Trust rule:** accessibility and unambiguous states are requirements, not polish. Weight
  findings accordingly; never invent domain data to illustrate a finding.

## How to run a review

1. Read the specified files (ask for a file/pattern if none given).
2. Check against the rules below.
3. Output findings grouped **by file**, terse, in `file:line` format (VS Code clickable). Mark a
   clean file `✓ pass`. Omit explanation unless the issue is non-obvious.

---

## Accessibility

- Icon-only buttons need an accessible name (`aria-label`, or `title`). `<v-btn icon>` renders no
  text — it needs one.
- Every form control needs a label — Vuetify `label` prop, `<label>`, or `aria-label`.
- An action is a `<v-btn>`/`<button>`; navigation is an `<a>`/`<router-link>`. Don't put `@click`
  navigation on a plain `<div>`/`<span>`/`v-sheet` without button/link semantics + keyboard.
- Images need `alt` (`alt=""` if purely decorative).
- Decorative Carbon icons need `aria-hidden="true"`; icons that carry meaning need a text
  alternative.
- Async updates (a screen's `<v-snackbar>`/`notify`, inline validation) need a polite live region
  (`aria-live="polite"`) so screen readers announce them.
- Prefer semantic HTML before reaching for ARIA.
- Headings run in order (`<h1>`→`<h6>`); provide a skip link to main content. Give heading anchors
  `scroll-margin-top` so they aren't hidden under `AppHeader`.

## Focus & keyboard

- Every interactive element has a **visible** focus indicator. Vuetify components ship one — keep
  it. Custom surfaces must add their own.
- Never remove an outline without replacing it.
- Use `:focus-visible` (not `:focus`) so a ring doesn't flash on mouse click.
- Compound/custom controls: pair `:hover` with `:focus-within` for keyboard parity (see the
  reveal-on-hover pattern in vuetify-ds "State ownership").

## Forms

- Inputs carry a meaningful `name` and the right `autocomplete` value (and `autocomplete="off"` on
  non-auth fields that shouldn't be remembered).
- Use the correct `type` and `inputmode` (email, tel, numeric…) so the right keyboard appears.
- Never block paste; never block zoom.
- Labels are clickable and tied to their control (Vuetify's `label` prop handles this).
- Turn off spellcheck on emails, codes, usernames (`spellcheck="false"`).
- Checkbox/radio: label + control share one hit target (Vuetify handles this — verify on custom
  ones).
- Submit stays enabled until the request actually starts; show `loading` then.
- Validation errors show **inline** (Vuetify `:rules` / `:error-messages`); move focus to the first
  error on submit.
- Placeholders and truncated hints end with `…`.
- Warn before navigating away from a form with unsaved changes (vue-router `onBeforeRouteLeave`).

## Motion

- Honor `prefers-reduced-motion` — gate non-essential animation behind it.
- Animate `transform` / `opacity` only; never `transition: all`.
- Set a correct `transform-origin`; put SVG transforms on a `<g>` wrapper.
- Animations are interruptible.
- Restraint: on a high-trust surface, less motion reads as more trustworthy — don't decorate.

## Typography detail

- `…` not `...`; curly quotes (`" "` `' '`) not straight; non-breaking spaces in numbers, units,
  and brand names so they don't wrap awkwardly (e.g. `10 mg`, the product name).
- Loading states end with `…`.
- `font-variant-numeric: tabular-nums` for any column of numbers — data tables, metrics, counts —
  so digits align.
- `text-wrap: balance` on multi-line headings.
- (Sizing/scale itself is governed by vuetify-ds — use the MD3 `text-*` classes, not raw sizes.)

## Content handling

- Text containers handle long/overflowing content (truncate or wrap deliberately).
- A flex child that should truncate needs `min-width: 0` — otherwise it refuses to shrink.
- Every list/data view has a designed **empty state**.
- Anticipate variable input lengths (long names, long medication labels) — don't assume short.

## Images & media

- `<img>` carries explicit `width`/`height` (or an aspect-ratio box) to prevent layout shift.
- Below-the-fold images: `loading="lazy"`. Critical hero images: `fetchpriority="high"`.

## Performance

- Virtualize large lists — use Vuetify's `v-virtual-scroll` / `v-data-table-virtual` rather than
  rendering thousands of nodes. If you cap or paginate instead, say so.
- Don't read layout (`offsetWidth`, `getBoundingClientRect`) during render; batch DOM work.
- `preconnect` to third-party origins; `preload` critical fonts (fonts load via `unplugin-fonts`).

## Navigation & state

- The URL reflects meaningful state; stateful views are deep-linkable (vue-router query/params).
- Links are `<a>`/`<router-link>`, not `@click` handlers.
- **Destructive or irreversible actions require explicit confirmation in the UI** (also a house
  rule in CLAUDE.md).

## Touch & interaction

- `touch-action: manipulation` on tappable controls to kill the 300ms delay.
- Intentional `-webkit-tap-highlight-color`.
- `overscroll-behavior: contain` inside dialogs/scrollable modals so the page behind doesn't scroll.
- Disable text selection during drag interactions.
- Use `autofocus` sparingly and only when it genuinely helps.

## Layout & safe areas

- Full-bleed / edge-to-edge layouts respect `env(safe-area-inset-*)` on notched devices.
- Avoid unwanted scrollbars.
- Reach for flexbox/grid utilities over measuring in JS (copy the flex patterns from `Storybook.vue`).

## Dark mode & theming

- Vuetify's theme handles most of this — verify both light and dark in the Storybook.
- `color-scheme` set so native form controls match the theme; `<meta name="theme-color">` matches
  the background.

## Locale & i18n

- Format dates with `Intl.DateTimeFormat` and numbers with `Intl.NumberFormat` — never hardcode a
  format. Important wherever dates and figures carry weight.
- Wrap non-translatable identifiers (codes, IDs) with `translate="no"`.

## Copy — house voice

Reinforces `frontend-design`'s writing section; these two overrides diverge from the upstream
Vercel rules on purpose:

- **Sentence case**, not Title Case — matches the vuetify-ds hard rule (never uppercase unless the
  user explicitly asks). This overrides the upstream "Title Case headings/buttons."
- **Spell out "and"** — don't substitute `&`. Plain and unambiguous beats stylized.
- Active voice; a control names exactly what it does ("Save draft", then a "Draft saved" toast).
- Numerals for counts; specific button labels (not "Submit"/"OK").
- Error messages state what went wrong **and how to fix it**, in the interface's voice.
- Second person ("your account"), conversational but plain.

---

## Anti-patterns — flag these on sight

- Zoom-disabling `<meta viewport>` (`user-scalable=no` / `maximum-scale=1`).
- `@paste.prevent` / blocking paste.
- `transition: all`.
- Removing `outline` with no focus replacement.
- `@click` navigation on a `<div>`/`<span>`/`v-sheet` with no button/link role + keyboard.
- Images with no dimensions.
- Rendering large arrays unvirtualized.
- Unlabeled form inputs or icon-only buttons.
- Hardcoded date/number formats.
- Unjustified `autofocus`.

## Intentionally omitted from the upstream list

- **Hydration-safety rules** (controlled-input `onChange`, SSR date guards, `suppressHydration
  Warning`) — this is a client-only Vue SPA with no server rendering; they don't apply.
- **React/Next & Tailwind specifics** (`<Link>`, `nuqs`, `virtua`, `focus-visible:ring-*` class
  syntax) — translated above to the Vue/Vuetify equivalents.
