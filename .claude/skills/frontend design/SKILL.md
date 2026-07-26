---
name: frontend-design
description: >-
  Design-TIME composition and UX-copy judgment for building or reshaping a screen so it reads as
  deliberate, not templated. Use when designing a NEW screen, reworking a layout, improving
  hierarchy / visual rhythm / structure, deciding what leads a screen, making a screen "less
  generic," or writing interface copy (labels, empty states, error messages). Works WITHIN the
  design system: defers to vuetify-ds for every color/type/radius/spacing/component and never
  invents a palette, font pairing, or hand-rolled CSS. NOT the styling/token config (that's
  vuetify-ds) and NOT the accessibility/correctness audit of finished code (that's
  web-design-guidelines).
---

# Frontend Design

Guidance for making a screen feel **intentional and specific to its job**, not like the generic
answer you'd produce for any dashboard. This is taste and composition — the *arrangement* of the
DS's parts — not the parts themselves.

## ⛔ This skill works inside the design system

Before any of the judgment below, the non-negotiable constraint:

- **Color, type, radius, spacing, and component choice come from `vuetify-ds`** — theme tokens in
  `vuetify.ts`, the Onest MD3 type scale, the shared radius/spacing scales, and Vuetify components.
  **Never invent a hex palette, pair custom fonts, or hand-roll CSS** for something the DS or a
  Vuetify component already provides. If a screen needs a new color or shape, that's a DS change
  (via `new-project` / `vuetify.ts`), not a per-screen decision.
- Your freedom is in **composition** — what leads, how information is structured, what the one
  memorable element is, and how the copy reads. Spend it there, not on restyling tokens.
- Consistency, clarity, and calm beat novelty. Distinctiveness must never cost legibility,
  accessible states, or predictable behavior. Don't fabricate domain data to make a layout look
  good — use clearly-synthetic placeholders (all figures in this app are synthetic).
- **Check the domain before you design.** This codebase is a template; `CLAUDE.md` names the
  product's domain and any rules that come with it. If it still reads `{{PROJECT_DOMAIN}}`, the
  project is unconfigured — ask what the product is rather than inventing a subject.

## Ground it in the subject

If the brief doesn't pin down what the screen is for, pin it yourself before designing: name the one
job this screen does, who's using it (which audience or role), and what the single most important
thing on it is — then state that choice. Use anything in memory about the user's preferences or
prior work as a hint. Distinctive, appropriate choices come from the subject's own world — the
product's actual nouns and workflows — not from decoration bolted on top.

## Composition principles

**Lead with the most important thing, in the form that fits it.** A screen has one job; make the
element that serves that job the anchor, and let everything else support it. The template answer — a
big number with a small label and a gradient accent — is only right when it's genuinely the best
answer, not the default.

**Structure is information.** Structural devices — numbering, eyebrows, dividers, section labels —
should encode something *true* about the content, not decorate it. Numbered markers (01 / 02 / 03)
only make sense when the content really is a sequence (an onboarding flow, a typed timeline). Question
whether a device carries meaning before adding it.

**Motion, deliberately and sparingly.** Consider whether animation serves the subject — a reveal
that clarifies, a state change that reassures. On a high-trust surface, less motion reads as more
trustworthy; scattered effects read as AI-generated filler. One considered moment beats many. Always
honor `prefers-reduced-motion` (the `web-design-guidelines` audit enforces this).

**Match effort to the vision.** A dense screen needs precise spacing and hierarchy; a spare screen
needs precision in the few elements it has. Elegance is executing the chosen vision well within the
DS — not adding ornament.

**Copy is design material.** Placeholder copy makes a screen feel as templated as its layout. Write
it with the same care as the layout — see "Writing" below.

## Avoid the generic default

AI-generated UI clusters around a few recognizable looks (warm-cream + high-contrast serif +
terracotta; near-black + one acid accent; broadsheet hairline rules with dense columns). In this
app the *visual* language is already fixed by the DS, so this risk shows up instead as **generic
composition**: the same hero-stat-row + three-cards + CTA every screen, regardless of what the
screen is actually for. Where the layout is free, don't spend that freedom on the default
arrangement — arrange for *this* screen's job.

## Process: plan, self-critique, then build

Work in two passes, mostly in your own thinking — only show the user ideas once you're confident
they'll land.

1. **Plan the composition.** Sketch the layout concept in one or two sentences (ASCII wireframes are
   fine for comparing options), name what leads, what the supporting structure is, and the one
   element this screen is remembered by. Colors/type/components are **not** part of this plan —
   they're already decided by the DS.
2. **Critique the plan against the brief.** If any part reads like the arrangement you'd produce for
   any similar screen rather than a choice made for *this* one, revise it and say what changed and
   why. Only then build — composing DS components and tokens per vuetify-ds.

## Restraint and self-critique

Spend your boldness in one place — let one element be the memorable thing and keep everything around
it quiet and disciplined; cut any decoration that doesn't serve the screen's job. Build to a quality
floor without announcing it: responsive to mobile, visible keyboard focus, reduced motion respected
(the `web-design-guidelines` audit is how you verify these). Critique your own work as you go — take
a screenshot if the environment supports it. Chanel's rule applies: before you ship, remove one
thing.

## Writing

Words exist in a UI to make it easier to understand and use — design material, not decoration. Bring
the same intentionality to copy as to layout. (These rules are also enforced at review time by
`web-design-guidelines`' copy checks.)

- **Write from the user's side of the screen.** Name things by what people control and recognize,
  never by how the system is built ("your saved items," not "records payload"). Specific beats clever.
- **Active voice, action-consistent labels.** A control says exactly what it does — "Save draft," not
  "Submit" — and keeps that name through the whole flow (the button "Save draft" produces a toast
  "Draft saved").
- **Failure and emptiness are direction, not mood.** An error says what went wrong *and how to fix
  it*, in the interface's voice — never vague, never apologizing. An empty screen is an invitation
  to act.
- **Sentence case, conversational, no filler.** Plain verbs, tone matched to the product's audience.
  (Per vuetify-ds: never uppercase unless the user explicitly asks.) Each element does one job — a
  label labels, an example demonstrates; nothing does double duty.
