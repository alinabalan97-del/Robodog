---
name: new-project
description: >-
  Bootstrap a new branded project from this template base with a five-step setup: (1) identity —
  ask only for project name, description and a logo, deriving everything else; (2) a pointer to the
  color control panels (theme + component defaults + chart palette) for the designer to edit
  directly; (3) the same for the radius scale, including whether to keep or retune the extra radii;
  (4) the font family — the designer types a typeface name and the skill swaps it across the
  Fontsource dependency, the Vite font loader and the Sass body-font var; (5) a verification pass
  over every configured file, a reminder of anything still missing, plus an invitation to build the
  first screen. Use when a designer
  starts a new project on this codebase, wants to rebrand it, re-skin it, or "set up /
  configure" it without hunting through config files — and whenever a grep turns up unreplaced
  {{PROJECT_NAME}}-style placeholder tokens, which mean the template is still unconfigured.
  Writes identity to src/data/brand.ts, fills every {{TOKEN}} in index.html / storybook.html /
  package.json / README.md / CLAUDE.md, and deletes the TEMPLATE-ONLY scaffolding.
  Defers to vuetify-ds for all conventions.
---

# /new-project — brand intake & reconfigure

Five steps: **1** identity · **2** colors · **3** radius · **4** font · **5** verify & first screen.

## ⛔ How to write every step

**What the designer sees at each step is short: what this step is, the few things they can do, and
how to move on. Nothing else.** Everything below a step's quoted block is *for you* — file paths,
invariants, edit sequences, failure modes. Do not recite it. Do not paste a step's reference table
unless the designer is actually choosing from it. If your message can't be skimmed in ten seconds,
it's too long — cut it, don't restructure it.

Rules of thumb, all steps:
- Lead with the ask, not the context. Explain a file only when they have to open it.
- One decision per step. Never preview steps 2–5 while running step 1.
- No `AskUserQuestion` in steps 2–4 — say the short block, end the turn, wait for a reply.
- Warnings are earned, not front-loaded: raise an invariant *when they edit the thing it guards*.

**Before anything, load `vuetify-ds`** — it is the authority on every DS convention this skill
touches (tokens-only, where colors vs radius vs chart palette live, dataset-driven screens). This
skill never contradicts it.

**Confirm the target first.** This rewrites brand identity app-wide. If you're running on an
existing/live app rather than a fresh clone, say so plainly and get a go-ahead before editing.

---

## Step 1 — Identity

**Three things, that's the whole step.** Say this and nothing more:

> **Step 1 of 5 — what is this project?**
>
> 1. **Name** — what the product is called.
> 2. **Description** — a sentence or two on what it does and who it's for.
> 3. **Logo** *(optional)* — drop the file into `src/assets/`; the folder ships empty for it.
>    Skip it and we carry on — I'll remind you at the end.
>
> Everything else — short name, tagline, package slug, domain — I derive from those and show you
> at the end to correct.

**Anything they already told you, don't ask for again.** If invoking the skill already came with a
name and a description, fill those two lines in yourself and show the list with 1 and 2 answered —
all that's left is the logo. If the description is thin but usable, take it; step 5 is where a
wrong guess gets fixed.

**Then:**
- **Name and description in hand** → write step 1 immediately (see *Applying* below) and go
  straight to step 2. No confirmation round-trip, and the logo never blocks.
- **Either one missing** → end the turn and wait for the reply.

### Only if the description can't carry the setup — then quiz

The bar is concrete: can you write a real domain line and real domain rules from what they said?
A one-liner like *"a booking app"* can't. If it's that thin, ask again in **one `AskUserQuestion`
call, two or three questions max** — free-text via the "Other" field:

- Who uses it — end consumers, internal staff, clinicians, admins?
- What's the main thing someone does in it?
- Does it handle anything sensitive or regulated — health data, payments, minors, legal records,
  safety-critical figures?

The sensitive/regulated question is the one that earns the quiz: it turns `CLAUDE.md`'s **Domain
rules** from a placeholder into real constraints, and it shapes every screen built afterward. Ask
it whenever you're quizzing at all. If the **name** is missing too, add it as one more free-text
question in that same call — never a second round-trip, and never a name you invented.

### What gets derived from the name + description

| Derived | From | Rule |
|---|---|---|
| `identity.shortName` / `{{PROJECT_SHORT_NAME}}` | name | The wordmark form. Default = the full name; shorten only if the name is long or has a legal suffix. |
| `identity.tagline` / `{{PROJECT_TAGLINE}}` | description | One short line. If nothing good falls out, omit it — `tagline` is optional. |
| `{{PROJECT_SLUG}}` | name | npm-safe: lowercase, hyphens, no spaces. |
| `{{PROJECT_DOMAIN}}` | description (+ quiz, if one ran) | One line naming what the product *is* ("a clinical intake platform", "an internal ops console"). |
| **Domain rules** in `CLAUDE.md` | description (+ quiz, if one ran) | The real constraints. If the domain carries none, write one line saying so — never leave the placeholder block. |

⚠️ **Derive, don't invent.** Every derived value is shown back for approval in **step 5**. If the
answers genuinely don't support a domain rule, say that rather than authoring a plausible-sounding
regulation the designer never mentioned.

Once you have a name and description, **write step 1 before opening step 2** — `brand.ts`, the
`{{TOKEN}}` files, and the `TEMPLATE-ONLY` deletions (see *Applying* below) — so the rest of the
setup runs on an already-named app.

---

## Step 2 — Colors

Say this — three lines and an exit. Don't walk tokens one at a time, don't list every color token,
don't ask a question per color. The files document themselves (every hex in `vuetify.ts` is
commented inline with what it controls), so your job is routing, not transcribing.

> **Step 2 of 5 — colors.** Edit these yourself, or tell me what you want and I'll set it. All
> three hot-reload.
>
> 1. **Brand palette** — [`src/plugins/vuetify.ts`](src/plugins/vuetify.ts) → the `light` and
>    `dark` `colors` blocks. Edit both.
> 2. **Component look** — same file, the `defaults` block: uncomment a line to make it an app-wide
>    default.
> 3. **Chart colors** — [`src/data/chartTheme.ts`](src/data/chartTheme.ts).
>
> Preview: `corepack pnpm dev:storybook` → http://localhost:3001.
>
> Type **next** when you're done.

Then **end your turn and wait.** Any reply meaning "done" — next, done, ok, finished — moves to
step 3.

Reference, for when they ask or hand you the work — don't volunteer it:

- **Theme colors** → `theme.themes.light.colors` / `.dark.colors`. Brand tokens, text/surface ink,
  reserved state colors. Dark is not a copy of light — derive a legible counterpart.
- **Component defaults** → the `defaults` block: variant, shape, size, density, elevation, one
  block per component. Anything a prop can't express is a build-time Sass var in
  [`src/styles/settings.scss`](src/styles/settings.scss) (**restart**); the full ~764-var catalog
  is [`src/styles/sass-variables-reference.md`](src/styles/sass-variables-reference.md).
- **Chart palette** → `categorical` / `sequential` / `diverging`. Ink, surfaces and status colors
  are read live from the theme, so they're not duplicated there. ⚠️ Raise this **only if they
  retune it**: the hexes *and their order* were validated for colorblind separation against both
  surfaces — read the file header, load `dataviz`, don't eyeball it.
- Preserve the inline comments in every file you edit.

---

## Step 3 — Radius

Read the live values out of `_tokens.scss` first, then say this — the table *is* the decision, so
it stays, but nothing else does:

> **Step 3 of 5 — corner radius.** Five values in
> [`src/styles/_tokens.scss`](src/styles/_tokens.scss); everything else follows them.
>
> | Var | Now | Controls |
> |---|---|---|
> | `$radius-sm` | 4px | opt-in only |
> | `$radius-md` | 8px | ⭐ the default — cards, buttons, inputs, dialogs, menus |
> | `$radius-lg` | 12px | select / autocomplete popups |
> | `$radius-xl` | 16px | opt-in only |
> | `$radius-2xl` | 24px | section panels, large surfaces |
>
> Bigger = softer, smaller = crisper. This one is Sass, so **restart `corepack pnpm dev`** after
> editing.
>
> Type **next** to keep them, or describe the feel you want and I'll set it.

Then **end your turn and wait**, same as step 2.

Reference, for when they ask or hand you the work — don't volunteer it:

- The five steps drive the `rounded-*` utilities, every `rounded` prop, `$border-radius-root`, the
  `--radius-*` CSS vars, and the dialogs/menus/snackbars/tooltips that have no `rounded` prop.
- **Derived radii** — vars that aren't a plain step. Today there's exactly one: `--section-radius`
  in [`src/styles/overrides.css`](src/styles/overrides.css) (the outer `.section-panel` tier),
  pointed at `--radius-2xl` so it tracks the scale automatically. Check the file rather than
  trusting that count. Mention it **only if** they ask for the outer tier to read differently from
  the rest — then repoint it, or add a step.
- A *new* named radius: new step in `_tokens.scss` → forward it in `css-tokens.scss` → consume the
  `--radius-*` var. Never a px literal outside `_tokens.scss` — not in `settings.scss`,
  `css-tokens.scss`, or `overrides.css`, not even to "fix" a radius.
- `_tokens.scss`'s header documents two invariants enforced in `settings.scss`; don't hand-edit
  around them.

---

## Step 4 — Font family (they name it, **you** swap it)

The one step that isn't self-serve: a swap touches several files that must agree, and missing one
fails *silently*. So they name a typeface, you do the wiring.

Read the live value from [`src/styles/settings.scss`](src/styles/settings.scss)
(`$body-font-family`) before quoting it. Then say:

> **Step 4 of 5 — the font.** Currently `<live family>`. One family covers the whole app.
>
> **Type a typeface name** — "Onest", "Geist", "Instrument Sans" — and I'll wire it up. It needs to
> be on [Fontsource](https://fontsource.org) (most of Google Fonts and more); I'll say so and
> suggest a match if it isn't.
>
> Type **next** to keep `<live family>`.

Then **end your turn and wait.** "next" / "keep it" moves to step 5.

One line to keep out of that block unless asked: headings inherit the body font and charts read it
off the rendered page, so nothing has to be set twice. The two follow-ons below (heading font,
self-hosted font) are the same — answer them, never offer them.

### The swap — miss one of these and it silently doesn't work

Given a family name, derive the Fontsource slug: lowercase, spaces → hyphens (`Instrument Sans` →
`instrument-sans`). Then:

1. **Install it** — `corepack pnpm add @fontsource/<slug>` from the repo root. **This is also the
   existence check.** If it 404s, try `@fontsource-variable/<slug>` — some families ship only as a
   variable font, and `unplugin-fonts` resolves either. If both 404, the font isn't on Fontsource:
   don't guess a near-miss slug and don't proceed — tell the designer, name one or two real
   alternatives, and wait.
2. **Register it with the loader** — [`vite.config.mts`](vite.config.mts) → the `Fonts({ fontsource:
   { families: [...] } })` block. Add an entry with the family's **display name** (not the slug)
   and its weights:
   ```ts
   { name: 'Instrument Sans', weights: [400, 500, 600, 700], styles: ['normal'] },
   ```
   ⚠️ **Only list weights the family actually ships** — check the installed package's directory
   (`node_modules/@fontsource/<slug>/`, whose filenames carry the weights) rather than copying
   another entry's list. A requested weight that doesn't exist just doesn't load.
   Keep `[400, 500, 600, 700]` as the floor when the family has them: MD3's utility classes use
   400/500 and the type scale reaches 700, and a missing weight renders as faux-bold.
3. **Point the Sass var at it** — [`src/styles/settings.scss`](src/styles/settings.scss) →
   `$body-font-family: ('Instrument Sans', sans-serif),`. Keep the `sans-serif` fallback (use
   `serif` / `monospace` if that's the genre). The quoted name must match the loader entry
   **exactly**, spelling and case — this is the join, and a typo here is the silent-fallback bug.
4. **Prune what it replaced** — drop the old family's entry from `vite.config.mts` and its
   `@fontsource/*` dep from `package.json` (`corepack pnpm remove @fontsource/<old-slug>`) once
   nothing references it. Every registered family ships `@font-face` rules into `unfonts.css`,
   which both apps load, so leaving a dead one costs real bytes. **Keep `Roboto`** — it's
   Vuetify's own default and the last-resort fallback.
5. **Record it** — `src/data/brand.ts` → `brand.typography` (`family` / `fontsourceSlug` /
   `weights`), so the preset stays truthful. That field is a record, like `colors` and `radius`;
   editing it alone changes nothing.

**Then restart `corepack pnpm dev` (and `dev:storybook`)** — `settings.scss` is build-time Sass.
Confirm on the Storybook's *Typography* section, which renders the whole scale in the live font.

**Two follow-ons, only if they come up:**

- **A separate heading font.** `$heading-font-family` is its own Sass var (it just defaults to the
  body font). Setting it means registering a second family in `vite.config.mts` — the same edits
  again, double the font payload. Fine if asked for; don't volunteer it.
- **A self-hosted / licensed font.** Not on Fontsource: put the files in `src/assets/fonts/`, write
  the `@font-face` rules in [`src/styles/overrides.css`](src/styles/overrides.css) (loaded by both
  entries), skip edits 1–2 above, and still do edit 3 — `$body-font-family` is what makes it apply.

**Close the step with a stale-label sweep.** The family name is written out by hand in a few spots
that nothing derives — `src/screens/Storybook.vue` alone has two (the *Typography* section blurb
and the *Type* row of the reference table). Grep the **old** family name repo-wide and update every
prose hit:

```bash
grep -rn '<old family>' --exclude-dir=node_modules --exclude-dir=.git .
```

`src/components/charts/useChartTheme.ts` also carries the old name as a last-resort fallback string
(it normally reads the live computed font off `document.body`) — update it for consistency.

⚠️ **Unlike the `{{TOKEN}}` grep in step 5, this one must NOT exclude `.claude`.** The `vuetify-ds`
and `frontend-design` skills state the live font by name as a *fact about this project*, not as
documentation of a placeholder — so they go stale on a swap and have to be updated too.

---

## Step 5 — Verify, confirm, and start the first screen

**a. Run both greps. Both must come back empty:**

```bash
grep -rn '{{[A-Z_]*}}'  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.claude .
grep -rn 'TEMPLATE-ONLY' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.claude .
```

⚠️ **`--exclude-dir=.claude` is not optional.** This skill and `frontend-design` *document* the
tokens in prose, so without that flag the first grep returns ~20 hits forever and the check is
worthless. The skills are the instruction manual — they are never configured.

A hit in the **second** grep is the classic failure: tokens all filled in, but the repo still
describes itself as an unconfigured template forever.

**b. Type-check:** `node_modules/.bin/vue-tsc --build` from the repo root.

**c. Echo a confirmation table** — every value and the file it landed in, marking derived ones so
they get a real look. This table is the one long thing the designer *should* see; it's what they
check. Everything after it stays short:

| | Value | Written to |
|---|---|---|
| Name | … | `brand.ts`, `index.html`, `storybook.html`, `README.md`, `CLAUDE.md` |
| Short name *(derived)* | … | `brand.ts` |
| Description | … | `brand.ts`, `README.md`, `CLAUDE.md` |
| Tagline *(derived)* | … | `brand.ts` |
| Slug *(derived)* | … | `package.json` |
| Domain *(derived)* | … | `CLAUDE.md` |
| Domain rules *(derived)* | … | `CLAUDE.md` → Domain rules |
| Theme colors | changed / kept stock | `vuetify.ts` (both themes) |
| Component defaults | changed / kept stock | `vuetify.ts` → `defaults` |
| Chart palette | changed / kept stock | `src/data/chartTheme.ts` |
| Radius scale | changed / kept stock | `_tokens.scss` |
| Extra radii (`--section-radius`) | kept tracking the scale / repointed | `overrides.css` |
| Font family | changed / kept stock | `settings.scss` + `vite.config.mts` + `package.json` |

Ask them to correct anything wrong before moving on. **The derived rows are the ones to look at** —
they're inferences from prose, not answers they typed, so say that.

Keep it scannable: collapse every style row still at *kept stock* into a single closing line
("Colors, radius and font: kept stock") instead of five near-identical rows. The identity rows
always show individually — those are the ones being checked.

**d. Name what's still open — one short list, one line each.** Check each against the actual repo
state and report only the ones genuinely outstanding. No paragraphs; a designer scanning this needs
to see the count, not read an essay.

- **Logo** — read `src/assets/`, don't assume. Empty → "no logo yet, drop one in whenever." A file
  there → offer to build the component (`src/components/`, binding
  `:aria-label="brand.identity.name"`); the template ships none on purpose, since a vector wordmark
  can't be find-and-replaced.
- **Anything left at stock** — name the rows marked *kept stock*; each is still wearing the
  template's look and is changed by editing the file in the table.
- **Domain rules** — if you wrote "none apply", that's an open item, not a finished one.
- **No screens yet** — `src/router/index.ts` ships an empty `routes` array (hand-off to **f**).

**e. Two closing notes, if they apply:**
- **Restart `corepack pnpm dev`** if radius or the font changed (both Sass); everything else
  hot-reloads. A font swap also touched `package.json` — others on the repo need
  `corepack pnpm install`.
- `CLAUDE.md`'s "What the template ships" section is now partly stale — it describes a repo with no
  screens, and it rewrites itself as screens land. Worth a line so nobody trusts "a blank
  RouterView is expected" while debugging a real routing problem.

**f. Invite the first screen.** Close by asking for it directly:

> The design system is configured and there are no screens yet — `src/router/index.ts` ships an
> empty `routes` array, so the first screen you add is also the first route.
>
> **Paste a screenshot or mockup of the screen you want, or just describe it**, and I'll build it.

When they answer, that's ordinary screen work: `vuetify-ds` → `frontend-design` → build →
`web-design-guidelines`, with the screen's data in a typed `src/data/<screen>.ts` dataset.

---

## Applying the answers — what lands where

`src/data/brand.ts` is the single source of truth for identity and the inspectable record of the
color/radius choices. Read its header before editing — it explains which fields are live vs. a
record.

| Answer | Lands in | Reload |
|---|---|---|
| Name, short name, description, tagline | `src/data/brand.ts` → `identity` (live; screens read it) | hot |
| Name, description, slug, domain | the `{{TOKEN}}` placeholders outside `src/` | varies |
| Theme colors (if you set them) | `src/plugins/vuetify.ts` → `theme.themes.light` **and** `dark` `.colors` | hot |
| Component defaults (if you set them) | `src/plugins/vuetify.ts` → `defaults` (Sass-only dimensions → `settings.scss`, **restart**) | hot |
| Chart palette (if you set it) | `src/data/chartTheme.ts` → `categorical` / `sequential` / `diverging` | hot |
| Radius (if you set it) | `src/styles/_tokens.scss` → the five `$radius-*` values | **restart** |
| Extra radii (if repointed) | `src/styles/overrides.css` → `--section-radius`, pointed at a `--radius-*` step | hot (plain CSS — but the step it points at is Sass → **restart**) |
| Font family (if swapped) | `package.json` (`@fontsource/<slug>`) + `vite.config.mts` (`Fonts` families) + `src/styles/settings.scss` (`$body-font-family`) — all three | **restart** |
| A record of every choice | `src/data/brand.ts` → `colors` / `radius` / `typography` (the re-runnable preset) | — |

### Two kinds of scaffolding — REPLACE vs DELETE

**1. `{{TOKENS}}` — REPLACE with the value.**

- **Inside `src/`** — nothing spells the product name. Code reads `brand.identity` and
  interpolates it (`` `${brand.identity.shortName} Settings` ``). Rewriting `brand.ts` renames
  the whole app.
- **Outside `src/`** — files that can't import a TS module carry a literal token:

  | Token | Files |
  |---|---|
  | `{{PROJECT_NAME}}` | `index.html`, `storybook.html`, `README.md`, `CLAUDE.md` |
  | `{{PROJECT_DESCRIPTION}}` | `README.md`, `CLAUDE.md` |
  | `{{PROJECT_SLUG}}` | `package.json` (`name` — must be npm-safe) |
  | `{{PROJECT_DOMAIN}}` | `CLAUDE.md` (what the product *is* — drives its domain rules) |
  | `{{PROJECT_SHORT_NAME}}`, `{{PROJECT_TAGLINE}}` | `src/data/brand.ts` only |

**2. `TEMPLATE-ONLY` blocks — DELETE outright.**

Prose describing the *unconfigured* state: "this repo is an unconfigured template", the token
tables, "src/screens/ holds only Storybook.vue", "a blank RouterView is expected, not a bug", "no
logo ships". Every one is **false or misleading** the moment the project is real. They're wrapped
in markers so you never have to hunt them:

```
<!-- TEMPLATE-ONLY:start … -->  …block…  <!-- TEMPLATE-ONLY:end -->   ← markdown
 * TEMPLATE-ONLY:start          …block…   * TEMPLATE-ONLY:end          ← TS/JS comments
```

**Delete the marker and everything between the pair.** Don't rewrite the block, don't just strip
the markers. One exception, called out inline in `CLAUDE.md`: the **Domain rules** block says
"write the real rules here" — there, replace the block with the domain rules derived in step 1.

Files carrying them today: `CLAUDE.md`, `README.md`, `src/data/brand.ts`. Work from the grep, not
from a memorized list — the blocks move as the repo evolves.

### Order of writes

1. **`src/data/brand.ts`** — rewrite `brand.identity` (replacing its tokens); keep
   `brand.colors` / `brand.radius` / `brand.typography` truthful to whatever ends up in the control
   files.
2. **Replace every `{{TOKEN}}`** — `index.html` / `storybook.html` (`<title>`), `package.json`
   (`name`), `README.md` (heading/blockquote), `CLAUDE.md` (**What this is** blockquote).
3. **Delete every `TEMPLATE-ONLY` block**, per the exception above. In `src/data/brand.ts` the
   surrounding header comment explaining live-vs-record fields **stays** — it's true forever.
4. **Only if you were asked to set them:** theme colors and component defaults in
   `src/plugins/vuetify.ts` (both themes, inline comments preserved), chart palette in
   `src/data/chartTheme.ts`, radius in `src/styles/_tokens.scss`, `--section-radius` in
   `src/styles/overrides.css`, and the font across all three of `package.json` /
   `vite.config.mts` / `src/styles/settings.scss`.

## Guardrails

- **Colors come from the DS palette, never a generic wheel.** If you're setting colors on the
  designer's behalf, **read the current `vuetify.ts` colors first** and work from those real hues.
- **Tokens only, both themes.** Write hexes to named theme tokens (`primary`, `secondary`,
  `on-surface`, …) in **both** `light` and `dark`. Never introduce a raw hex into a component or
  screen. Derive a legible dark counterpart rather than copying the light hex.
- **Status colors are reserved for state** — `success` / `error` / `warning` / `info` are never a
  decorative or data-series color.
- **Chart colors are validated, not chosen by eye.** `src/data/chartTheme.ts` documents in its
  header why each hex and the categorical *order* are what they are (colorblind separation against
  both surfaces). If you're retuning them, load the `dataviz` skill and re-validate — no repo
  validator ships. Never duplicate ink/surface/status into that file; the composable reads those
  live from the theme.
- **Component defaults are props, not hand-rolled CSS.** Set the look in `vuetify.ts` → `defaults`;
  reach for `settings.scss` only for raw dimensions no prop can express.
- **A font is three edits or it's zero.** The dependency, the `vite.config.mts` loader entry and
  `$body-font-family` must name the same family, spelled identically. Two out of three fails
  *silently* — the app renders in system sans-serif and nothing errors. Never set
  `$body-font-family` to a family that isn't loaded, and never write a `font-family` declaration
  into a component, a screen, or `overrides.css` to work around it.
- **One family, app-wide.** Headings inherit the body font and charts read it off the rendered
  page. Don't add a second family (or a per-screen font) unless the designer asks — each one is
  another download on every page load.
- **Preserve the control-panel comments.** `vuetify.ts` documents each hex inline; edit the value
  in place and update the comment. Do not restructure the file.
- **Don't touch what wasn't asked.** Surfaces, emphasis/state opacities, spacing, and type stay
  as-is unless the designer raises them.
- **Restart note.** Radius and the font family (both `settings.scss` / `_tokens.scss`) are Sass →
  restart `corepack pnpm dev`. Theme colors, component defaults, the chart palette and identity all
  hot-reload.

## Re-running / presets

Because every choice is recorded in `src/data/brand.ts`, "apply the brand preset" means: read that
file and re-apply `colors`/`radius`/`typography` to the control files — no intake needed. A future
project can copy a filled-in `brand.ts` in as its starting preset, then run this skill only for
what changed. Note the font is the one preset field that also needs an **install**
(`corepack pnpm add @fontsource/<slug>`) — re-applying it is step 4's four edits, not a
find-and-replace.
