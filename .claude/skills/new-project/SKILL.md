---
name: new-project
description: >-
  Bootstrap a new branded project from this template base by running a short brand-intake
  quiz and reconfiguring the design system from the answers — product name, description,
  domain, primary/secondary colors (chosen from the DS palette, not generic), radius
  personality, and any custom color exceptions. Use when a designer starts a new project on
  this codebase, wants to rebrand it, re-skin it, or "set up / configure" it without hunting
  through config files — and whenever a grep turns up unreplaced {{PROJECT_NAME}}-style
  placeholder tokens, which mean the template is still unconfigured. Writes the answers to
  src/data/brand.ts, fills every {{TOKEN}} in index.html / storybook.html / package.json /
  README.md / CLAUDE.md, and applies the colors to vuetify.ts and the radius to settings.scss.
  Defers to vuetify-ds for all conventions.
---

# /new-project — brand intake & reconfigure

This skill turns a short quiz into a rebranded app. A designer answers ~6 questions; you
write their answers into the brand preset and propagate them into the two design-system
control files. No file hunting.

**Before anything, load `vuetify-ds`** — it is the authority on every DS convention this
skill touches (tokens-only, where colors vs radius live, dataset-driven screens). This
skill never contradicts it.

## What you reconfigure, and where it lands

| Answer | Lands in | Reload |
|---|---|---|
| Name, short name, description, tagline | `src/data/brand.ts` → `identity` (live; screens read it) | hot |
| Name, description, slug, domain | the `{{TOKEN}}` placeholders outside `src/` (see below) | varies |
| Primary / secondary / semantic colors | `src/plugins/vuetify.ts` → `theme.themes.light` **and** `dark` `.colors` | hot |
| Radius personality | `src/styles/settings.scss` → `$rounded` map + `$border-radius-root` | **restart** |
| A record of every choice | `src/data/brand.ts` → `colors` / `radius` (the re-runnable preset) | — |

`src/data/brand.ts` is the single source of truth for identity and the inspectable record
of the color/radius choices. Read its header before editing — it explains which fields are
live vs. a record.

### Two kinds of template scaffolding — REPLACE vs DELETE

Configuring is not just find-and-replace. The repo carries scaffolding in **two** forms, and
they need opposite treatment. Getting this wrong is the classic failure: the tokens all get
filled in, and the project ships forever describing itself as an unconfigured template.

**1. `{{TOKENS}}` — REPLACE with the answer.**

- **Inside `src/`** — nothing spells the product name. Code reads `brand.identity` and
  interpolates it (`` `${brand.identity.shortName} Settings` ``). Rewriting `brand.ts` renames
  the whole app.
- **Outside `src/`** — files that can't import a TS module carry a literal token:

  | Token | Files |
  |---|---|
  | `{{PROJECT_NAME}}` | `index.html`, `storybook.html`, `README.md`, `CLAUDE.md` |
  | `{{PROJECT_DESCRIPTION}}` | `README.md`, `CLAUDE.md` |
  | `{{PROJECT_SLUG}}` | `package.json` (`name` — must be npm-safe: lowercase, hyphens) |
  | `{{PROJECT_DOMAIN}}` | `CLAUDE.md` (what the product *is* — drives its domain rules) |
  | `{{PROJECT_SHORT_NAME}}`, `{{PROJECT_TAGLINE}}` | `src/data/brand.ts` only |

**2. `TEMPLATE-ONLY` blocks — DELETE outright.**

Prose that describes the *unconfigured* state: "this repo is an unconfigured template", the
token tables, "src/screens/ holds only Storybook.vue", "a blank RouterView is expected, not a
bug", "no logo ships". Every one of these is **false or misleading** the moment the project is
real. They're wrapped in markers so you never have to hunt them:

```
<!-- TEMPLATE-ONLY:start … -->  …block…  <!-- TEMPLATE-ONLY:end -->   ← markdown
 * TEMPLATE-ONLY:start          …block…   * TEMPLATE-ONLY:end          ← TS/JS comments
```

**Delete the marker and everything between the pair.** Don't rewrite the block, don't just strip
the markers. One exception, called out inline in `CLAUDE.md`: the **Domain rules** block says
"write the real rules here" — there, replace the block with the domain rules from the quiz.

Files carrying them today: `CLAUDE.md` (4 blocks), `README.md` (1 large block), `src/data/brand.ts`
(3 blocks). Confirm against the live repo rather than trusting this count.

### Verifying — two greps, both must come back empty

```bash
grep -rn '{{[A-Z_]*}}'  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.claude .
grep -rn 'TEMPLATE-ONLY' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.claude .
```

⚠️ **`--exclude-dir=.claude` is not optional.** This skill and `frontend-design` *document* the
tokens in prose, so without that flag the first grep returns ~20 hits forever and the check is
worthless. The skills are the instruction manual — they are never configured.

**No logo ships with the template** — deliberately, since vector wordmarks can't be
find-and-replaced. Mention at wrap-up that a lockup is still needed: it goes in
`src/components/` and should bind `:aria-label="brand.identity.name"` so the accessible name
tracks the preset.

## ⚠️ Guardrails (read before you run)

- **Confirm the target first.** This rewrites brand colors app-wide. If you're running on an
  existing/live app (not a fresh clone), state that plainly and get a go-ahead before editing
  `vuetify.ts` / `settings.scss`. Colors and identity are reversible; still, confirm.
- **Colors come from the DS palette, never a generic wheel.** Before the color questions,
  **read the current `vuetify.ts` `theme.themes.light.colors`** and offer those real hues as
  the options (with their hex). "Custom hex" is always available via the quiz's "Other" field,
  but the defaults must be the project's actual palette.
- **Tokens only, both themes.** Write hexes to named theme tokens (`primary`, `secondary`,
  `on-surface`, …) in **both** `light` and `dark`. Never introduce a raw hex into a component or
  screen. For dark, derive a legible variant (lift primary for contrast on navy) rather than
  copying the light hex blindly — match the pattern already in the dark theme block.
- **Preserve the control-panel comments.** `vuetify.ts` documents each hex inline. Edit the
  value in place; keep (and update) the trailing comment. Do not restructure the file.
- **Don't touch what wasn't asked.** Surfaces, emphasis/state opacities, spacing, and type
  stay as-is unless a quiz branch explicitly covers them.
- **Restart note.** Radius changes are Sass → tell the designer to restart `corepack pnpm dev`
  (colors and identity hot-reload; radius does not).

## The quiz

Two free-text questions, then a **guided walkthrough of every color and every radius** — one
token at a time, each with a short plain-language explanation of what it controls and a
**Keep / Change** choice. "Keep" leaves the current value untouched; "Change" (the "Other"
field) takes a new hex or px. Nothing is skipped silently — the designer sees each token and
decides. **Read the current values live from `vuetify.ts` and `settings.scss` first** so every
"Keep" option shows the real current value.

### Part 1 — identity (free text)

1. **Project name** → `identity.name` + `{{PROJECT_NAME}}` (also ask a short/wordmark form →
   `identity.shortName` + `{{PROJECT_SHORT_NAME}}`; default it to the name).
2. **Project description** → `identity.description` + `{{PROJECT_DESCRIPTION}}` (optionally a
   tagline → `identity.tagline` + `{{PROJECT_TAGLINE}}`).
3. **What is this product?** — one line naming the domain → `{{PROJECT_DOMAIN}}` in `CLAUDE.md`.
   Ask what it *is* (a healthcare platform, an internal admin tool, a consumer finance app…) and
   whether that domain carries rules — regulated data, safety-critical figures, financial
   accuracy, minors, accessibility mandates. Write those rules into `CLAUDE.md`'s **Domain rules**
   section, which currently holds only the domain-agnostic ones. This is the answer that most
   changes how every later screen gets built; don't let it go unanswered.
4. **Package slug** → `{{PROJECT_SLUG}}` in `package.json`. Derive it from the name
   (lowercase, hyphens, npm-safe) and offer it as the default rather than asking cold.

### Part 2 — colors, one token at a time

Walk through the tokens **in this order**, each as a question whose options are
`Keep <current hex> (<role name>)` and `Change…`. Batch them a few per **AskUserQuestion** call
(up to 4 questions per call) so it isn't 11 separate round-trips. Give each the one-line
"what it's for" below as the question text. Every answer is recorded in `brand.ts` and, if
changed, written to **both** the light and dark theme in `vuetify.ts` (derive a legible dark
counterpart — don't copy the light hex onto navy).

| # | Token | What it controls (say this) |
|---|---|---|
| 1 | `primary` | The main brand color — primary buttons, links, active/selected states, and the branded checkbox/radio/switch. |
| 2 | `secondary` | The supporting accent — secondary emphasis and lighter brand moments. |
| 3 | `on-surface` | The default text and icon color for the whole app — every label, heading and body line that isn't given its own color. Light theme wants a near-black brand ink; dark wants its near-white counterpart. |
| 4 | `success` | Positive confirmation — "saved", success states, healthy indicators. |
| 5 | `error` | Errors and destructive actions — failed validation, delete, danger. |
| 6 | `warning` | Caution and alerts — something needs attention but isn't an error. |
| 7 | `info` | Neutral informational accents — tips, info banners. |
| 8 | `surface-wash-1` | Decorative gradient tint A — the sign-in mesh and messaging backdrop (background only, never text). |
| 9 | `surface-wash-2` | Decorative gradient tint B — the second hue in that same gradient. |

Then **one gate** for the app's surfaces (advanced): "Want to adjust the neutral surfaces —
app background, card surface, the deep navy-slate `surface-variant` — or keep them?" Only if
**yes**, walk `background`, `surface`, `surface-variant` the same Keep/Change way. Default is
keep; most rebrands leave surfaces alone.

The paired `*-darken-1` hover/pressed shades are **auto-derived** from their base (a true
darker shade) — mention this, don't ask a separate question for them.

### Part 3 — radii, one step at a time

Walk through the `$rounded` scale, each as a `Keep <current px>` / `Change…` question, batched
a few per AskUserQuestion call. `pill` (9999px) and `circle` (50%) are structural — state that
they stay and don't ask. Read current values from `settings.scss` first.

| Step | Current | What it controls (say this) |
|---|---|---|
| `$border-radius-root` | 4px | The base radius everything derives from; the bare `rounded` fallback. |
| `sm` | 12px | Small elements — compact rows, small chips, tight controls. |
| `md` | 16px | **The default content-card radius** (any card with no explicit `rounded`). |
| `lg` | 24px | Larger surfaces and section panels. |
| `xl` | 48px | Extra-round large panels. |
| `2xl` | 52px | The roundest tier — big panels, chat bubbles, alerts. |

**Always start with the preset shortcut:** before the per-step walk, offer a one-tap starting
point — "Apply a Sharp / Soft / Round preset to all six, then fine-tune?" — using the presets
below. If they pick a preset, pre-fill the six steps from it and still walk each for tuning; if
they choose "tune each", go step by step from the current values.

| Preset | root | `sm` | `md` | `lg` | `xl` | `2xl` | Feel |
|---|---|---|---|---|---|---|---|
| **Sharp** | 2px | 4px | 6px | 8px | 12px | 16px | crisp, technical |
| **Soft** | 4px | 8px | 10px | 12px | 16px | 20px | gentle, Material-ish |
| **Round** | 4px | 12px | 16px | 24px | 48px | 52px | pillowy — the template's stock feel |

### Wrap up

After the walkthrough, **echo a summary** — name, and every token/step with its final value,
flagging which changed vs. kept — and confirm before writing anything.

## Applying the answers (order matters)

1. **`src/data/brand.ts`** — rewrite `brand.identity` (replacing its tokens) and the
   `brand.colors` / `brand.radius` records to match every answer (this is the preset; keep it
   truthful to what you write to the control files).
2. **Replace every `{{TOKEN}}`:**
   - `index.html`, `storybook.html` → the name, in the `<title>`
   - `package.json` → the slug, in `name`
   - `README.md` → name + description in the heading/blockquote
   - `CLAUDE.md` → name, description, and domain in the **What this is** blockquote
3. **Delete every `TEMPLATE-ONLY` block** — marker pair and all content between. Run the grep
   below to find them; don't work from a memorized list, since the blocks move as the repo
   evolves. Handle each one:
   - `CLAUDE.md` → delete all blocks **except** the **Domain rules** one, which you *replace*
     with the real domain rules from Part 1 question 3. If the domain carries no special rules,
     say so in one line rather than leaving the block.
   - `README.md` → delete the block (unconfigured intro, token table, verification greps, the
     no-logo note).
   - `src/data/brand.ts` → delete the blocks; the surrounding header comment explaining
     live-vs-record fields **stays** — it's true forever.
4. **`src/plugins/vuetify.ts`** — set `primary` (and `secondary`/exceptions if chosen) in the
   **light** colors, updating each inline comment; then set the legible **dark** counterparts.
5. **`src/styles/settings.scss`** — apply the radius preset to `$border-radius-root` + `$rounded`.
6. **Verify — both greps must come back empty:**
   ```bash
   grep -rn '{{[A-Z_]*}}'  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.claude .
   grep -rn 'TEMPLATE-ONLY' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.claude .
   ```
   A hit in the second grep means scaffolding survived — the project would ship describing
   itself as an unconfigured template. Fix before moving on.
7. **Type-check**: `node_modules/.bin/vue-tsc --build` (from the repo root).
8. **Tell the designer**, in this order:
   - colors + name are live on hot-reload; **restart `corepack pnpm dev`** for the radius change
   - **there is still no logo** — the template ships none on purpose. Building the lockup as a
     component in `src/components/` is a follow-up the quiz can't do; say so plainly rather than
     letting them discover it later.
   - **`CLAUDE.md`'s "What the template ships" section is now partly stale** — it described a
     repo with no screens. It gets rewritten naturally as the first screens land; flag it so
     nobody trusts "a blank RouterView is expected" while debugging a real routing problem.

## Re-running / presets

Because every choice is recorded in `src/data/brand.ts`, "apply the brand preset" means: read
that file and re-apply `colors`/`radius` to the two control files — no quiz needed. A future
project can copy a filled-in `brand.ts` in as its starting preset, then run this quiz only for
the fields it wants to change.
