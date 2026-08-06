# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

> **Robodog** — a factory operations management platform for monitoring and coordinating production
> in real time. Operators get a live view of the floor covering autonomous vehicles and their
> missions alongside production lines, equipment health and throughput, from a single dashboard.
>
> Domain: factory operations management — production lines, orders and throughput; equipment
> utilization, health and maintenance; and an autonomous vehicle fleet (mission dispatch, routing,
> battery, traffic) as one subsystem inside that broader picture. Its users are floor operators,
> production teams and plant managers, working on wall displays and ruggedized tablets on the
> floor itself.

The product name lives in `src/data/brand.ts` → `brand.identity`; screens import it, so a rename
inside the app is one edit there. Files that can't import a TS module (`index.html`,
`storybook.html`, `package.json`, `README.md`, this file) spell it out literally.

**No logo component exists yet.** When one is built, put it in `src/components/` and bind
`:aria-label="brand.identity.name"` so the accessible name tracks the brand preset.

### Domain rules

Robodog renders the live state of **a working factory floor — moving machinery and running
production lines, with people among them**. That makes the UI part of an operational safety loop,
not a reporting surface. These are binding:

- **Never present stale telemetry as live.** Vehicle position, battery, mission state, line status,
  equipment health and alert status are all time-sensitive. Every live surface shows its own
  freshness (last-updated / connection state) and visibly degrades — dimmed, badged "stale", or
  explicitly disconnected — the moment the feed lags or drops. A frozen view that still looks live
  is the worst failure this product can have.
- **Commands are physical-world actions.** Dispatching, halting, rerouting, reassigning or
  overriding a vehicle, and starting, pausing, holding or reconfiguring a line or piece of
  equipment, all move real machinery. Each requires explicit confirmation naming the specific
  vehicle, mission, line or asset affected — never a bare "Are you sure?", and never a bulk action
  that fires without listing what it touches.
- **Emergency stop is the one exception, and it is never behind a confirm.** If an e-stop or
  equivalent safety halt is surfaced, it must be reachable in one action, visually distinct from
  every other control, and impossible to trigger by accident (guarded by placement and size, not
  by a dialog that costs seconds).
- **State is never conveyed by color alone.** Alert severity, vehicle status, battery level, line
  and order state, and equipment health each carry an icon, a label, or a shape alongside the color
  — floor displays get glanced at, and a red/green-only view fails both colorblind operators and
  bad lighting.
- **Figures carry their units and their precision.** Battery %, charge time, speed, distance,
  cycle time, units produced, throughput, downtime and utilization are read as decision inputs.
  Label the unit, don't silently round a value someone is dispatching against, and never render a
  computed estimate as a measurement.
- **Separate what is measured from what is derived.** Counts and sensor readings are measurements;
  OEE, availability, projected completion, ETA and "on track / behind" are calculations over a
  window. Say which window, and never let a derived figure occupy the same visual slot as a
  measured one without marking it.
- **Every number, vehicle ID, order, line, floor plan and alert in the app is synthetic until a
  real backend is wired in.** Keep mock data obviously fictional — it must never be mistakable for
  a real facility's live state (see the API seam and `src/mocks/`).
- **Operator ergonomics are a functional requirement.** These screens run on wall displays and
  ruggedized tablets, read at distance and touched with gloves: generous hit targets, high
  contrast, and no interaction that depends on hover alone.

These hold for **every** project built on this template, whatever the domain:

- **Never fabricate data that looks authoritative.** Figures, units, labels, names, prices, and
  statistics in an unbuilt product are placeholders — keep them *clearly* synthetic, and flag
  anything that would need a subject-matter expert to sign off.
- **Clarity and accessibility are requirements, not polish.** Legible type, sufficient contrast,
  unambiguous states (error/success/warning), accessible labels on every interactive element.
- **No destructive or irreversible actions without explicit confirmation** in the UI.

## ⛔ Two mandatory skills

**Any UI change — a screen, component, layout, color, spacing, or style — requires loading
`/vuetify-ds` first.** Every time, not just the first. It is the authority on the design system,
the component-selection order, and the tokens-not-hex rule. If a request involves UI and you
haven't loaded it, stop and load it.

**Any chart, graph, plot, or dashboard visualization goes through the chart kit** in
`src/components/charts` (Apache ECharts + `vue-echarts`) — never a raw `<v-chart>`, and
**never a second charting library** (D3, Observable Plot, Chart.js, Carbon/Ant charts). Adding one
is the failure this rule exists to prevent, so it's stated here rather than only in the skill.

Everything else about charts — the preset list, the selection order, `src/data/chartTheme.ts` as the
only source of chart color/type, status-colors-are-for-state, and the load-bearing `categorical`
palette order — lives in `/vuetify-ds` → *Chart / data-viz selection logic*, which the rule above
already requires you to load. `Storybook.vue`'s **Data viz** section shows correct usage of each
preset.

## Skills

`vuetify-ds` is the **one authority** on this project's design conventions; every other skill
defers to it. Skills auto-activate on their descriptions — this table is the tie-breaker.

| The task is… | Skill | Timing |
|---|---|---|
| Colors, spacing, radius, type, choosing/composing a Vuetify component | **vuetify-ds** | always, first (mandatory) |
| How a screen is *arranged* — composition, hierarchy, structure, UX copy | **frontend-design** | while designing |
| Auditing a finished screen — a11y, forms, focus, states, motion, copy | **web-design-guidelines** | after building |
| Vue/TS *code* — component typing, watchers, Volar/vue-tsc, defineModel | **vue-best-practices** | while coding |
| Starting a new project or rebranding this one | **new-project** | at project start |

When several apply to one screen: **vuetify-ds** (styling, always) → **frontend-design** (arrange)
→ build → **web-design-guidelines** (audit).

- **Reviewer skills must never define a design language.** Any critique skill is a *reviewer only* —
  don't let one generate a competing `design.md`, invent a palette or type scale, or ask the
  designer to define a design language. The DS already exists in `vuetify.ts` + `settings.scss` +
  `src/data/brand.ts`; point every review back at it.
- **The vue-ecosystem reference skills** (vuetify/vue/pinia/router) are for **upstream API facts
  only** — never for project conventions.

## Commands

All commands run from the **repo root** — the app lives at the root, not in a subfolder.

```bash
corepack pnpm install
corepack pnpm dev            # product app — Vite dev server on port 3000; boots MSW mocks first
corepack pnpm dev:storybook  # standalone DS Storybook on port 3001 (no router/MSW)
corepack pnpm dev:all        # both of the above at once (product :3000 + Storybook :3001)
corepack pnpm build          # type-check + vite build (product app only; Storybook has no build)
corepack pnpm preview        # serve dist/
node_modules/.bin/vue-tsc --build   # type-check only
```

- Use **`corepack pnpm`**, not bare `pnpm`.
- For type-check prefer `node_modules/.bin/vue-tsc --build` — the `corepack pnpm run type-check`
  wrapper currently fails a pre-run dep check.
- **There is no test suite and no runnable linter.** `eslint.config.js` references
  `eslint-config-vuetify`, which is not installed and has no npm script. Don't claim tests/lint
  passed; type-check + a dev-server smoke check is the available verification.
- After editing `src/styles/settings.scss` or `src/styles/_tokens.scss`, **restart the dev server**
  (Sass is build-time; theme colors and component defaults in `vuetify.ts` hot-reload).

## Architecture

**Frontend-only engagement.** This codebase owns the UI layer, not the backend/auth/DB. It is built
*against* a backend via typed contracts plus a mock layer, so a real backend drops in by matching
the shapes.

Stack: Vue 3 + Vite + TypeScript, **Vuetify 4**, Pinia, vue-router 5, MSW. Icons: **IBM Carbon**
(`@carbon/icons-vue`), referenced by semantic key from `src/icons/carbon.ts`.
`@/*` aliases to `src/*`. Form validation uses Vuetify's built-in field `:rules` — no extra dep.

### Two components that are infrastructure, not product code

- **`src/components/AppIcon.vue`** is Vuetify's **global icon renderer**, wired in `vuetify.ts`
  (`component: props => h(AppIcon, …)`). Every `<v-icon>` and every component-internal icon routes
  through it. **Deleting it breaks the entire icon layer.** It looks like a product component; it
  isn't.
- **`src/components/AppPictogram.vue`** is imported by the Storybook.

Their key maps are `src/icons/carbon.ts` and `src/icons/pictograms.ts`. Add a key there — never
import a Carbon component straight into a screen.

### The base, and what Robodog hasn't built yet

⚠️ **Keep this section current — it describes the repo's present state, and parts of it go stale
as screens land.** Update it in the same change that invalidates it.

**The stable base:** the design system (`src/plugins/vuetify.ts` + `src/styles/`),
the chart kit (`src/components/charts/` + `src/data/chartTheme.ts` + `src/data/chartSamples.ts`
— note the palette lives in `src/data/`, not in the charts folder), the Storybook, the
brand preset (`src/data/brand.ts`), the two icon components above, and the seams (`src/api/`,
`src/mocks/`, `src/stores/`, `src/router/`).

**Built so far:** one product screen — **`src/screens/FloorOps.vue`**, the live floor operations
console, mounted at `/` as the `home` route. It owns its chrome (top bar, icon rail, snackbar) and
the fleet's animation-frame clock, and composes:

- `src/components/FloorMap.vue` — the 2D SVG floor plan
- `src/components/warehouse/WarehouseViewer.vue` — the 3D scene (GLB warehouse + robot GLBs),
  lazily imported so Three.js is its own chunk
- `src/components/FleetPanel.vue` — the five-unit roster, sharing the 350px rail with
  `src/components/TaskPanel.vue` (the priority queue, the performance metrics and the
  notification feed) and `src/components/MissionPanel.vue`, behind a segmented switch

over two datasets: `src/data/floorOps.ts` (the hall's static plan) and `src/data/fleet.ts` (the
fleet, the road network and the stations). `src/assets/` holds the wordmark.

The 3D view carries a **traffic overlay** (`warehouse/trafficLayer.ts`) behind a toggle in the map
control cluster, 3D only — reservations, junction pressure, per-unit safety rings and destination
marks, drawn from `FleetSim.trafficTelemetry()`. It is **off by default**: it is dense markup and
left on it buries the floor it explains. The 2D map has no equivalent, so the control is hidden
rather than disabled in 2D — a button that silently does nothing in one of two views is worse than
one that is not offered.

⚠️ **The ledger is only published while something is drawing it.** `FleetSim.trafficTelemetry()`
walks every held block and every junction and sorts both lists, and it was being rebuilt and
assigned into reactive state on **every animation frame** — waking every watcher of `fleet.traffic`
60×/s so a hidden layer could ignore the result. `FloorOps` now declares the demand
(`fleet.setTrafficWanted(mapView === '3d' && showTraffic)`) and the store skips the snapshot while
nothing wants it, leaving `traffic` null — which both renderers already treat as *no answer yet*
rather than as *nothing is reserved*. A second consumer turns that flag into a count and changes
nothing else.

⚠️ **The zoom buttons drive BOTH views.** They used to narrow `FloorMap`'s viewBox and nothing
else, so in 3D they were offered and did nothing — the very failure the traffic toggle is hidden in
2D to avoid. `zoom` is now a shared level: the 2D map reads it directly, and `WarehouseViewer`
dollies the camera by the ratio between the old level and the new (`WarehouseScene.zoomBy`, clamped
to the orbit controls' own distance limits). OrbitControls' wheel zoom covers a mouse; it does not
cover a gloved hand on a ruggedized tablet, which is the floor this runs on.

⚠️ **A FLOOR DECAL'S LIFT IS A MULTIPLE OF `unitScale`, NEVER A DISTANCE IN METRES.**
`FloorProjection.worldPerMetre` is **1** (the warehouse GLB is authored in metres), so a "4 mm"
lift is 4 mm of world space — thinner than the model's own floor slab. The traffic overlay was
authored that way and every ribbon, disc and ring rendered *inside* the floor: nothing errored,
nothing warned, the layer reported itself visible, and it drew nothing. It is only visible at all
because it was finally mounted and looked at in a browser. `RouteLayer` had it right all along
(`unitScale * 2`); the overlay's tiers now sit just under that.

⚠️ **A SAFETY RING IS HALF THE BODY LENGTH.** `FleetSim`'s proximity monitor calls two units
touching when the gap closes below the sum of their half-lengths, so an overlay ring drawn at the
full length claims twice the clearance the model keeps — rings overlap constantly and the floor
reads as unsafe when the simulation says it is not.

⚠️ **`floorOps.map.vehicles` and `floorOps.map.routes` are no longer rendered.** The simulation is
the vehicle layer now, and the aisle network drawn on both maps comes from `fleet.corridors` — what
is drawn is what is driven. Those two dataset fields are kept as the static seed and the plan's own
record; a renderer that starts drawing them again will put robots visibly beside the aisles they are
supposedly following.

**Not built yet:** a **sign-in screen** · a reusable **logo component** (the wordmark is currently an
`<img>` inline in `FloorOps.vue`) · the screens behind the nav rail's other icons · a light-theme
logo variant.

⚠️ **There is no authentication in front of the console.** `/` is marked
`meta: { requiresAuth: true }`, but the guard's `hasRoute(SIGNIN_ROUTE)` check means a missing
sign-in route lets navigation through rather than crashing — so the screen is reachable
unauthenticated. That is deliberate mid-build scaffolding, **not** a guard to rely on. Build sign-in
before this is exposed anywhere real.

The guard keys off `meta.requiresAuth` / `meta.public` (not paths), and the catch-all registers now
that a route named `home` exists. Read `src/router/index.ts`'s header before adding routes.

### ⚠️ The warehouse is three layers, and the boundary is enforced

The floor-operations screen renders a **live AMR fleet simulation**. It is built as
three layers, and the separation is the point — not an aspiration:

| Layer | Files | Owns |
|---|---|---|
| **Simulation** | `src/sim/fleetSim.ts` · `navGraph.ts` · `trafficControl.ts` · `capacity.ts` · `asrsSim.ts` · `src/data/fleet.ts` | Robots, tasks, dispatch, routing, traffic, capacity, cranes, battery, warehouse state |
| **Shared state** | `src/stores/fleet.ts` | Owns **one** engine, drives its clock, republishes each tick reactively |
| **Renderers** | `src/components/FloorMap.vue` (2D) · `src/components/warehouse/` (3D) | Drawing. Nothing else. |

⚠️ **ONE engine, and the store constructs exactly one.** `FleetSim` owns the
`TrafficController`, the capacity governor and the `AsrsSim`, and ticks all of
them inside its own `tick()`. A second engine held beside it — which is how the
cranes used to run — is only *usually* in step: any caller that returns early
between the two ticks, or steps one twice, puts two moments of the same building
on one screen. The store's job is the clock, not the model.

Three things are published **beside** `FleetTelemetry` rather than inside it,
because that interface is the contract a real fleet-management backend satisfies
and a fleet backend publishes vehicles: `craneTelemetry()` (fixed plant),
`trafficTelemetry()` (the aisle ledger) and `fleetActivity()` (how many units the
governor is running). A real backend that has none of these simply never calls
them.

**Neither renderer may contain warehouse behaviour.** No robot decides anything
inside a `.vue` file. Both views read the same `fleet.robots` array and the same
`robotRoute`, which is why switching 2D↔3D cannot move a robot, drop a route or
reset a status — there is nothing per-view to reset. A renderer that starts
computing where a robot should go has broken the architecture, not extended it.

The simulation is **plain TypeScript with no Vue and no Three in it**, which is
what lets it be soaked headlessly instead of only watched in a browser. Keep it
that way — and use the soak, it is the only test this repo has:

```bash
node scripts/soak-fleet.mjs 60          # 4 seeds × 60 simulated minutes
node scripts/soak-fleet.mjs 30 991      # one seed, faster
node scripts/diagnose-fleet.mjs 5       # WHY a seed fails: phases, block reasons,
                                        # reservations held, arrivals, standoff dump
node scripts/probe-dock-service.mjs 45  # are the loading bays actually serviced?
                                        # per dock unit: stalls vs the fleet, bays
                                        # worked, tasks run, bay-time held idle
```

⚠️ **`probe-dock-service.mjs` exists because the soak cannot see this.** Two dock
units that quietly park up and never patrol still complete tasks, still charge,
still yield, and pass every assertion in `soak-fleet.mjs` — the bays just stop
being visited, which no aggregate there measures.

It loads the TS through Vite's SSR pipeline (so `@/` resolves as in the app) and
asserts no overlap, no permanent jam, **that each chassis stays inside its duty's
areas**, that every stage of the flow runs, that charging completes and that
units are genuinely seen idle.

⚠️ **Run it at 45 minutes or more.** Charging is asserted, but on a five-unit
roster batteries do not always reach the 28 % reserve inside 20 minutes, so a
short run can fail on `no unit ever reached a charging stall` while the model is
behaving correctly. Seed 991 does exactly that: it fails at 20 min and passes at
45. That is a window artifact, not a regression — check the battery floor before
believing it.

Last run: **4 seeds × 45 min, all seeds passed** — 60–112 tasks per seed, 21–33
ASRS cycles with **both cranes dispatched on every seed**, 5–7 units charging per
seed, longest error spell 12 s (the modelled recovery time, i.e. no stalls),
closest approach 0.53–0.55 m with zero interpenetration. `blocked` runs 5–22 % of
unit-samples. The aisles are one vehicle wide with no passing bays, so queueing
is the expected steady state, not a fault — see the traffic note at the top of
`fleetSim.ts`.

⚠️ **The governor holds most of the roster back, and that is the building.**
`scripts/traffic-report.mjs` puts the recommended active count at **4 of 16**,
limited by route overlap rather than by free floor: the hall has ~23 lane blocks
but only **3 cross-junctions**, so a fifth unit's drives compete for road that is
already spoken for. Measured over 45 minutes the governor's target moves between
3 and 7 and changes 14–48 times a run, so it is genuinely tracking congestion and
not sitting on a constant. More capacity means more ways ACROSS the hall, not
more aisle — and until then the roster must SAY why a dozen units are parked
(`FleetPanel`'s "held back" chip, and `activityOf`'s wording for a standby unit).

⚠️ **The warm-up REBASES the stored instants; it does not merely zero the clock.**
`FleetSim` runs 180 simulated seconds before the first frame so the hall looks like a shift in
progress, then sets `elapsed = 0`. But `elapsed` is the origin every absolute time is measured
against, so zeroing it alone left `createdAt` / `assignedAt` in the old base and two things were
quietly wrong for as long as the warm-up lasted: a job carried over completed with
`elapsed - createdAt` **negative** — clamped to zero, so the opening minutes of every run booked
**0-second deliveries** into `averageDeliverySeconds`, `averageQueueSeconds` and the emergency
response average — and `waitingSeconds` read 0 for work that had genuinely been queued for minutes.
`warmUp` now shifts every stored instant by the same offset, which keeps durations exact and simply
makes pre-shift instants negative. The event feed is **emptied** rather than shifted: `TaskPanel`
labels those times "simulated minutes since the run started", so a warm-up event has no correct
rendering — left alone it timestamped up to `03:00` against a clock reading `00:00`. Expect
`avg delivery` to read a few seconds HIGHER than pre-fix numbers; that is the false zeros leaving.

⚠️ **Per-seed task counts are chaotic; judge changes on a spread, not a seed.** A
two-unit behaviour change re-orders every rng draw and every traffic interaction
downstream, so one seed's count can swing by an order of magnitude on a change
that is neutral overall. A 12-seed A/B of the dock posting ran 74 median / 60
mean with it off against 81 / 68 with it on — and BOTH configurations produced
single-digit outlier seeds. Comparing one seed before and after is how a neutral
change gets reverted and a harmful one gets shipped.

The soak also asserts the **priority scheduler**: the published queue is in
dispatch order, no laden unit is ever interrupted, and emergencies are assigned
faster than ordinary work (10–43 s against 41–143 s). Worst-case emergency wait
is **printed, not asserted** — see the note in `soak-fleet.mjs` for why that
number measures the building rather than the scheduler.

### ⚠️ TASK PRIORITY: a second axis, orthogonal to duty

`TaskPriority` (`emergency` · `high` · `normal` · `low`) says WHEN a job runs.
`TaskKind` says WHAT it is and therefore WHICH chassis may take it. The two never
interact: an emergency pallet job is still a forklift's job.

`taskPriorities` in `src/data/fleet.ts` **is** the scheduler's ordering — the
queue is kept sorted by `rank` then creation time on every insert, so priority is
a property of the container rather than a comparison anyone has to remember. The
same table carries each level's word, icon and two colour tokens (`tone` for
chips, `routeTone` for map routes — they differ on purpose), so the sim and every
surface that draws it read one source.

**Three things an emergency may override, in escalating order** — and each is a
separate mechanism, so read `assignEmergency` before changing any of them:

1. **A robot's idle dwell, and a charge above the reserve level.**
2. **A LOW-priority job that has not yet been picked up** — cancelled safely,
   returned to the queue at its own rank, and resumed by the same unit afterwards
   if nobody beat it to it. `canInterrupt` is the single authority; the rule that
   **a unit already carrying a load is never interrupted** lives there and is not
   a tunable.
3. **A STOP held by a less urgent job** (`preemptStation`). This is the one that
   is easy to miss and it is what actually makes the feature work here: the hall
   has thirteen working stations, so on a busy floor the thing blocking an urgent
   job is not a shortage of robots but that every pick face is spoken for.
   Preemption re-routes the displaced job to another bay — it cancels nothing —
   and only falls back to (2) when the hall has no free stop at all.

⚠️ **An emergency also outranks the congestion governor** (`wakeForEmergency`).
The governor holds part of the fleet out of service when the aisles are over
capacity; without the override the two silently cancelled — 13 emergencies
raised, none completed, one unassigned for 27 simulated minutes beside a pool of
parked robots.

### ⚠️ TWO UNITS CARRY A DOCK POSTING, and it is a posting, not a capability

`AMR-05` and `AMR-06` carry a `dockService` beat in `fleetRobots`
(`src/data/fleet.ts`). It changes **nothing** about what work they may be handed:
same queue, same `container` duty, same dispatch, alongside the other fourteen.
What it changes is what they do when they have NO work — an ordinary unit drives
to a bay and stops, a dock unit works a round of loading bays and waiting
positions so the docks are visibly serviced. Their state vocabulary is five words
of their own (`goingToLoadingDock` · `loadingAtDock` · `transportingCargo` ·
`returningToDock` · `waitingForNextTask`); the charging, fault and priority states
are untouched, because those say whether a unit can work at all and must read the
same on every chassis.

The beat is data — bays, waiting positions, and three numbers in `fleetSimParams`
(`dockServiceSeconds`, `dockPatrolWaitSecondsRange`, `dockLegTimeoutSeconds`).
Adding or moving a posting needs no code change. **Four rules keep it from
costing more than it gives**, and each was paid for:

1. **A patrolling unit is dispatchable on every frame**, mid-drive included
   (`isAvailable`). A bay patrolled while a trailer waits is worse than one not
   patrolled at all.
2. **It is in the congestion governor's pool** — the *last* idle unit taken
   (`standDownCost`), never exempt. Exempting it cost as much as 121 completed
   jobs against 39 on the same seed: two units the governor cannot remove from an
   over-capacity network make it stand down more of the others, and two
   permanently-moving units feed its own blocked-share input.
3. **A beat leg only goes out while the floor is at or under the governor's
   target** (`mayPatrol`). Patrol traffic is discretionary and gives way first.
4. **A beat leg has a deadline** (`dockLegTimeoutSeconds`); a real delivery must
   never have one. A leg that stopped making progress held a loading bay — the
   hall's pinch point — for 35 % of a run, for no job.

⚠️ **A bay held by a round is preemptable by an emergency** (`yieldBeatStop`,
called from `preemptStation` **before** its `holder.task` test). Every one of
`preemptStation`'s four conditions is phrased in terms of the holder's *task*, so
a bay held for a round skipped them all and became the one stop in the building an
emergency could not take — 270 s to assign an emergency against 118 s for ordinary
work, one waiting 33 minutes beside a robot with no job.

### ⚠️ Robots are organised by DUTY, not by dispatch luck

`TaskKind` is a **stage of one goods flow**, not a direction of travel:
`pallet → container → cart → store`. Each chassis serves exactly one stage
(`RobotType.duty`) and each stage declares the `WorkArea`s it may pick up and
drop off in (`duties` in `src/data/fleet.ts`). Every station carries an `area`.

That table *is* the behaviour. A forklift stays near the west and centre racking
because every job it can be handed starts and ends there — there is no rule
telling it to. **Widening a duty's area list changes where robots drive**; it is
not a tidy-up.

Finishing a job **hands the flow on at the station the cargo was left on**
(`handOn` → `Task.preferFrom`), so the AMR collects what the forklift actually
put down. The pin has a deadline (`chainPatienceSeconds`) because a stalled unit
must not freeze a stream for ever.

Two things exist purely to stop the floor looking frantic, and both are load
bearing: the **`standby` phase** (a unit waits a few seconds where it finished,
but only on a spur — idling in an aisle would block a queue) and
**`idleDwellSecondsRange`** (a parked unit refuses work briefly, so bays are
actually used).

**Two invariants hold the traffic model up.** Both are easy to break by accident
and neither fails visibly at the point of the mistake:

1. **A unit on a leg always holds that leg's end node**, reserved before it set
   off. Break it and a unit sits committed mid-aisle with no reservation, which
   no amount of re-planning can resolve.
2. **No through-lane segment may be shorter than `MIN_THROUGH_LEG`** (35 plan
   units). A shorter one is shorter than a unit's stopping distance, so two units
   at neighbouring junctions fall inside each other's clearance permanently.
   `assertConnected` checks this, and strong connectivity, at construction — heed
   the console error rather than working around it.

Station positions in `src/data/fleet.ts` are therefore load-bearing geometry, not
decoration: moving a waiting bay or a dock can split an aisle into a segment too
short to drive. The network stays *connected* and stops being *drivable*, and the
symptom (robots frozen mid-aisle, minutes later and somewhere else) looks nothing
like the cause.

### ⚠️ The layout is MEASURED off the GLB. Never draw a warehouse.

Every aisle, rack face and rack block traces back to the warehouse model, not to
anyone's idea of a plausible floor plan. The chain is:

```bash
node scripts/extract-warehouse-nav.mjs        # GLB → clearance grid   (0.25–1.90 m · ROUTING)
node scripts/extract-plan-structure.mjs       # grid → runs, aisles, crossings  (POLICY)
node scripts/extract-plan-objects.mjs         # GLB → every object     (0.06–3.30 m · DRAWING)
node scripts/verify-schematic.mjs             # does the drawing match the objects?
node scripts/audit-plan-coverage.mjs          # does it match the MODEL? (writes .audit/*.png)
```

⚠️ **THE NAV GRID IS NOT A FLOOR PLAN, AND THE 2D MAP MUST NOT BE DRAWN FROM
ONE.** `extract-warehouse-nav.mjs` keeps only geometry between **0.25 m and
1.90 m** — the band a ground robot strikes. That is exactly right for routing and
wrong for drawing, and the 2D map was built on it. Measured against the model,
**22 % of the building's mass was missing** from the map and none of it looked
missing:

- the **east rack** — 4.6 m of structure whose lowest member is above 1.9 m, the
  largest object in the hall after the four runs, drawn as nothing at all
- **every pallet standing on the floor**, all of them under 0.25 m
- the top few units of **every rack run**, clipped by the band's ceiling

`extract-plan-objects.mjs` rasterises the full interior height instead and emits
`src/data/warehouseObjects.ts`. **Routing still uses the nav grid and must keep
using it** — corridors, station coordinates and the plan scale are all measured
against it. Nothing in the object list feeds the simulation.

`audit-plan-coverage.mjs` is the check that catches this class of bug: it goes
back to the GLB, rasterises it, and reports what fraction of real mass the
drawing covers (currently **96.8 %**) plus how much drawn area stands on empty
floor (**9.9 %** — a schematic simplifies, so this is never zero). It writes two
PNGs to `.audit/`, and the pictures are the point: a percentage says how bad it
is, the images say where.

`extract-warehouse-nav.mjs` rasterises everything standing between 0.25 m and
1.9 m — the band a ground robot strikes — and distance-transforms the free cells.
The **ridges of that clearance field are the aisles** and the zeros are the
racking, which is how a model that names nothing still yields a layout. The
corridor and station coordinates in `src/data/fleet.ts` are ridge lines read off
it; `extract-plan-structure.mjs` turns the same field into `warehouseStructure.ts`,
which is what the 2D map draws.

**This replaced two hand-drawn layouts that had silently diverged from the
building.** The old plan put racking where the hall has aisles, so a robot driving
a real aisle was drawn cutting through a rack — and the four rack runs the model
actually has were represented as two. Nothing looked broken; it just wasn't the
same building.

⚠️ **The extractor emits MASS, not objects, and the 2D map must group it before
drawing.** One physical rack run comes out as four or five overlapping
rectangles — a shelf, the beam over it and the pallets on it are three rasterised
bands covering the same floor. `src/data/floorSchematic.ts` is the layer that
turns that into a drawing: it clusters the rectangles into addressed storage runs
(`STORAGE-01…`), separates plant and floor goods by height, letters the corridors
`A`/`B`, and derives the marked floor pads and the spurs. `FloorMap.vue` draws
the result and computes no layout of its own.

⚠️ **A GROUP IS DRAWN AS ITS PARTS, NEVER AS ITS BOUNDING BOX.** The run against
the west wall is a 26-unit-deep strip of racking with two 60-unit-deep bays
bulging off it; drawn as its bounding box it became 86 units deep and covered the
open floor between the bays — racking drawn where the hall has aisles, which is
the same failure the measured pipeline exists to prevent. `Grouped.parts` is what
renders; `x/y/w/h` is only the extent, used for the address and reading order.
`audit-plan-coverage.mjs` measures the resulting over-draw so a regression here
shows up as a number rather than as a plausible-looking picture.

⚠️ **A merged cluster's capacity comes from the FOOTPRINT over the bay pitch,
never from summing `bays`.** `bays` is per-rectangle, so adding it across
overlapping rectangles counts the same run two or three times: the top-right run
reported 19 positions against the 11 of the identically-sized run beside it, and
drew a two-row grid of half-height cells in racking that is one pallet deep.
Dividing the merged footprint by the extractor's own 1.3 m pitch counts each
position once — and makes every cell on the plan the same physical size, so two
cells genuinely mean two pallets.

`verify-schematic.mjs` asserts the grouping against the measured zones (nothing
dropped, no cell outside its container, every station drawn exactly once) and
prints the layout in metres for eyeball comparison against the 3D view. Run it
after re-extracting, and after touching any threshold in `floorSchematic.ts`.

Three consequences worth knowing before you move anything:

- **The building is four rack runs, not two banks** — one against each long wall
  and one either side of the centre aisle — served by three lanes (`y 230`,
  the `y 400`/`y 460` pair, `y 670`). The two **wall runs carry over half the
  storage**, so treating them as scenery loses half the warehouse.
- **`WorkArea` bands cut ACROSS the runs, not along them** (`areaOf()` in
  `src/data/fleet.ts`). Each area holds a slice of all four runs, so no chassis
  can end up owning one side of the building. Cutting by run instead gives a
  forklift a shift spent driving end to end.
- **A lane is placed where it is clear end to end, not down the middle of its
  aisle.** There is loose plant in a few bays: the north aisle's centre is blocked
  around `x 600–655` and the south aisle's around `x 746–838`. A lane with a hole
  in it splits the network into pieces that can only be rejoined through the
  middle.

⚠️ **`floorOps.map.viewBox` is the building, not a crop.** The 3D projection fits
that box onto the model's interior, so its **centre** fixes where plan `(0,0)`
lands and its **proportions** fix the scale. It is sized so both axes bind at
once and centred on `x 620 / y 450`, which is what every station coordinate was
measured against. Change it and re-run `extract-plan-structure.mjs`, or the
racking, the aisles and the fleet all slide off the building together.

⚠️ **Fit the plan box AFTER the calibration rotation** (`floorProjection.ts`).
Fitting first measures the plan against the wrong wall. On this building — a
portrait shell under a landscape plan — that scaled the whole operational layer
to 63 %: it sat as an island in the middle of the hall, the perimeter racking down
both long walls fell outside it entirely, and every robot rendered a third too
small. It looked completely plausible, which is why it survived so long. Nothing
about a centred, uniformly-scaled floor says *wrong size* unless you know the hall.

### ⚠️ Models are sized in METRES, never in plan units

`RobotType.sizeM` / `FixtureType.sizeM` are the only size contract. The viewer
measures each GLB's bounding box and scales it **uniformly, to hit `heightM`**.

```bash
node scripts/measure-models.mjs   # authored size, applied scale, L/W error per model
```

**Two scales exist and must never be crossed.** `FloorProjection.toWorld` /
`unitScale` convert PLAN units — a drawing whose unit renders at ~0.021 m.
`FloorProjection.worldPerMetre` converts METRES and is what every physical size
goes through. Sizing a robot via `unitScale` is how the fleet ended up around a
third of its proper size, with a forklift shorter than a pallet.

Why height, and why uniform: all four assets are **single unrigged meshes
normalised to roughly a unit cube** by four different exporters, so their own
units say nothing about size and non-uniform scale would distort the machine
rather than resize it. Height is also the dimension every acceptance test is
about — does the AMR clear a pallet, does the lift reach the racking. L/W land
where each model's proportions put them; `measure-models.mjs` prints that error
rather than hiding it (worst is the AGV at −21 % / −29 %, an asset that is simply
narrow).

Applied: **forklift 2.05 m > AGV 0.8 m > AMR 0.45 m.** The upper bound is
measured, not taste: the model's roof begins at **3.33 m** and its racking tops
out at **3.69 m**, which is also where `ceilingCut: 0.655` comes from.

⚠️ **The ASRS is NOT sized this way and does not use a GLB** — see *The ASRS
cranes* below. It is built from primitives at **0.72 × 1.59 × 3.31 m**, and its
width is derived from the aisle it runs in rather than from a model's aspect
ratio.

⚠️ **Robots are longer than the aisle network's node spacing, and this is not
fixable by tuning.** A forklift is 2.0 m ≈ 95 plan units; the shortest through
lane segment is **38 plan units (0.80 m)** and the median is 45 (0.94 m), set by
dock access points at aisle ends and by rack-face pitch. A stopping gap must stay
*below* the shortest segment (`MIN_THROUGH_LEG`, and the reason is documented
above), so it can never reach a forklift's length. The soak measures the
consequence: bodies overlap on **~2.4 % of pair-samples**, about a third of those
with both units moving. Closing it means re-spacing station access points so
junctions are ≥ ~2.3 m apart — a layout change, not a constant.

**Adding a robot 3D model is one entry** in `robotTypes` (`src/data/fleet.ts`):
set `modelUrl` + `sizeM` and the viewer stops drawing that type's schematic
marker (which is drawn at the same true size, so nothing about the hall's
proportions changes when a GLB lands). A `null` url never falls back to another
chassis — a Type C drawn as a Type A is a wrong robot on an operations map,
which is worse than an honest placeholder.

⚠️ **`yawOffset` needs a human once.** The scene drives along local −Z, and the
forklift and AGV were authored with their long axis on X, so both carry a
quarter turn. Whether it should be +90° or −90° — which end is the *front* —
cannot be read off a bounding box. Getting it wrong shows as a robot driving
backwards, not sideways.

⚠️ **AND `yawOffset` MEANS THE ROOT'S LOCAL AXES ARE NOT THE SCENE'S.** Anything
parented to a robot root and positioned by a *direction* has to undo it. Cargo
did not: `setCargo` placed the load along the root's −Z because "the scene drives
along −Z", but inside a root carrying a 90° yaw that is **sideways** — the
forklift's pallet rendered beside the machine, level with the driver. It hid for
a long time because the two chassis that carry *within* themselves use
`forwardM: 0`, and a rotated zero is still zero, so only the one chassis that
carries ahead of itself could ever show it. The carrier now counter-rotates by
`-yawOffset` and offsets along `(sin yaw, 0, −cos yaw)`, which reduces to the old
behaviour when the offset is zero.

⚠️ **A BOUNDING BOX CANNOT TELL A FORK FROM A MAST — SLICE BY HEIGHT INSTEAD.**
`verify-cargo-placement.mjs` profiles each chassis in 0.1 m bands and takes the
furthest-forward vertex in each, which is what separates load-bearing structure
from the solid body behind it. On `robot 1.glb` that reads unambiguously: the
forks are a 0.65 m shelf at **0–0.10 m** reaching `x = +0.695`, while everything
from **0.10–0.60 m** stops at `x = +0.041`. The bay follows from those two
numbers rather than from anyone's eye, and the script now also checks the load is
*supported* — a pallet floating past the fork tips is as wrong as one buried in
the mast, and a single bounding box scores them identically.

⚠️ **The script no longer restates the bays or the sizes** — it reads `fleet.ts`
through Vite and parses `CARGO_BAYS` out of `WarehouseViewer.vue`. Its previous
copy had drifted to a forklift 0.25 m too tall and chassis A pointed at chassis
B's GLB, so it was verifying a fleet that did not exist. ⚠️ **It also used to
place cargo along −Z exactly as the shipped code did, so it reproduced the bug
above and reported it as correct.** A verifier that shares the code's assumption
cannot falsify it; this one checks against the mesh.

⚠️ **A model's PIVOT is measured too, never assumed.** Both 3D layers stand a
machine up by putting its root origin on the floor plane, which only stands it on
the floor if the exporter authored the origin at the base. Three of the four
assets do; **`robot 1.glb` (the type C forklift) is authored centred** (min.y
−0.75 of a 1.5-unit mesh) and rendered sunk **1.1 m** — half a 2.2 m machine —
through the slab. `baseOffsetY()` in `warehouse/robotLayer.ts` measures the
scaled box and lifts by `-min.y`, so this is corrected at load for every asset
and needs no per-model constant; `measure-models.mjs` flags any non-zero pivot.
There is no physics here — no collider, no floor contact test — so placement is
this one arithmetic step and nothing catches an error in it downstream.

**Three mobile models.** `robotTypes` A/B/C are the driving fleet — **A** AGV
cart tug (production workstations) · **B** Amazon AMR (the whole hall) ·
**C** autonomous forklift (west + centre racking and the loading apron).

### ⚠️ The ASRS cranes are their own subsystem, and they are BUILT

The ASRS is a **rail-guided stacker crane**, not a bolted-down fixture and not
fleet: it takes no transport task and is not on the road network. It lives in
three files of its own, and none of them is `fleet.ts` / `fleetSim.ts`:

| File | Owns |
|---|---|
| `src/data/asrs.ts` | Where the rails are, how wide the machine may be, bays and levels — all **derived from `warehouseStructure.ts`** |
| `src/sim/asrsSim.ts` | Behaviour. Plain TS, no Vue, no Three — same rule as `fleetSim.ts` |
| `src/components/warehouse/asrsLayer.ts` | The rig: rail, chassis, mast, carriage, cargo |

**Two axes, and they are SEQUENCED.** The machine runs its rail, then the
carriage runs the mast — never both at full speed, which is what a real crane's
safety case requires. `asrsMotion.crossoverFraction` is the only overlap allowed.
`AsrsLayer.setFrames()` writes the two numbers to two independent nodes, and the
2D map draws the same two.

⚠️ **This replaced a GLB fixture that could not be right.** `industrial robot 3d
model.glb` is a single unrigged mesh, so "the lift moved" could only mean the
whole machine floating off the floor — which capped its stroke at **0.44 m** and
put its 2.03 m long axis **across** a 2.62 m aisle. The built rig hoists the full
**2.93 m** of rack. **The remains of the old fixture are now deleted** —
`fixtureLayer.ts`, and `fixtureTypes` / `fixtures` / `asrsLift` / `Fixture` /
`FixtureType` / `FixtureTypeId` / `FixtureTelemetry` in `fleet.ts`, along with
`FleetTelemetry.fixtures` and the `Lift` model `fleetSim.ts` stepped for them.
If bolted plant ever returns, `robotLayer.ts` already loads and liveries a GLB at
a pose and is the thing to reach for.

⚠️ **The crane is sized against the strip it OWNS, not the whole aisle.** The
wall aisles measure 2.68 m and 2.81 m but carry a fleet lane 1.21 m wide, so a
crane at 65 % of the full aisle plus a forklift does not fit in one. The rail
therefore sits beside the lane and the machine is 66 % of what is left —
**0.19 m and 0.30 m of clearance to the racking**, reported by `asrsSummary`.

⚠️ **Dispatch IS wired, and `FleetSim` owns the crane engine.** `handOn` hands
the `store` stage's output to `AsrsSim.request()`, so a cycle is work the flow
produced. A crane that has received a real request stops reporting
**`pending: true`** permanently — the soak asserts that both cranes reach that
state, because a run where they never do means the seam is carrying nothing.
`request()` breaks queue-length ties on **jobs already taken**, without which a
stable sort gave every job to the first crane and the second ran self-invented
cycles all shift.

`AsrsSim.collect()` — a mobile unit taking a load off a crane's P&D deck — is
still unused: there is no station at the deck for dispatch to route to. The deck
clears itself after `handoverSeconds`, so nothing stalls waiting for it.

⚠️ **There were TWO engines until recently, and only one could be given work.**
The store constructed its own `AsrsSim` beside the fleet's, and `fleetSim.ts`
stepped a one-axis `Lift` model nobody drew. That cost two real defects: the dead
lifts shared the delivery counter, so the roster's headline figure counted crane
cycles as delivered loads (and disagreed with `metrics.tasksCompleted`, which
never did); and the `store` stage fed a queue only the dead lifts read, so the
rendered cranes never received a dispatched job.

⚠️ **Headings must be corrected by `FloorProjection.rotationY`.** The projection
rotates every plan POSITION onto the model but does nothing to facings computed
in plan space, so anything that turns must add it back:
`yaw = -(headingRad + projection.rotationY)`. Miss it and, with the current
quarter-turn calibration, every robot drives sideways down every aisle.

⚠️ **Model filenames contain spaces and are fetched as URLs, so `modelUrl` must be
percent-encoded.** A raw space 404s and the chassis silently degrades to its
schematic marker — which looks like a styling choice, not a broken path.

**The 3D scene generates no warehouse structure — with exactly one exception.**
`warehouse/chargerLayer.ts` builds the six charging docks from primitives, and
the distinction is not a loophole: racking *is* in the GLB and merely
unaddressable, whereas a charging stall is **not in the model at all** while the
simulation routes units to six of them continuously. Leaving them out meant
showing robots drive to a bare patch of floor and stop. Their lamps show only
real state (free · claimed · charging) and the pulse runs only while current is
actually flowing. Their POSITIONS are still placeholders — nothing in the GLB
identifies a charger — and are replaced by editing `chargerStations` in
`src/data/fleet.ts`, with no change here. Anything else structural is still
forbidden; see the deleted `ZoneLayer`.

### ⚠️ The house style: dark machines with glowing edges, metal building

**The fleet reads as holographic without any of the machine being holographic, and without anything
being drawn around it** (`FINISH` in `warehouse/robotLivery.ts`). Two parts, both of them surface
properties of the chassis itself:

| Part | What it is | Why it is that and not something else |
|---|---|---|
| **Hull + trim** | solid, opaque, matte, emitting **nothing** head-on (`bodyEmissive: 0`), plus a Fresnel rim spliced into the material's emissive (`rimStrength` 0.22, `rimPower` 1.8) | the body stays dark and keeps taking the hall's light, AO and its own contact shadow; the rim pays out only where the surface turns edge-on, tracing every upright, mast, wheel arch and fork |
| **Lit details** | the parts the GLBs already authored in saturated colour — lamps, indicator strips, light bars — carrying a small emissive (`ledEmissive` 0.28, in each unit's own accent) | the accent bucket *is* the lit-detail bucket, so no per-model annotation and no guessing which face is a lamp |

⚠️ **NOTHING IS DRAWN AROUND A ROBOT. No ground aura, no halo shell, no floor disc, no ring, no
projected light.** One was built here and **removed**: an additive ellipsoid around each chassis,
intended as soft light in the air. From the angle this view is actually watched from it did not read
as atmosphere — it read as **a circle on the ground under each robot**, which on an operations
display is the vocabulary of a selection ring or a safety radius. This floor draws real ones of
those (`trafficLayer.ts` — safety rings, destination marks), so a decorative one is not merely
redundant, it is a false reading of the floor. Do not reintroduce a shell, sprite, decal or light to
"soften" the rim; soften it with `rimPower`, which widens the band without raising the peak.

⚠️ **THE TWO RIM KNOBS TRADE AGAINST EACH OTHER — TUNE THEM AS A PAIR.** The flank's brightness is
`rimStrength × pow(1 − facing, rimPower)`, so the old "below ~2 the rim stops being a rim" limit was
a statement about `rimStrength: 0.6`, not about `rimPower` alone. At 0.22/1.8 the band is much wider
*and* the half-turned flank is nearly half as bright as it was at 0.6/2.4 — the hull gets darker and
the gradient gets gentler together. The failure that note describes is real but specific: widening
the band while leaving the strength high.

⚠️ **NOTHING IS BOLTED ONTO A CHASSIS ANY MORE.** `RobotLayer.addIdentity` is deleted — roof beacon,
mast band and the per-unit deck marking. The marking was a flat decal whose *shape* differed per
unit, and a violet chevron lying across a machine reads as a **direction arrow**: on an operations
display that is a claim about where a robot is going which a decal cannot back up. It was also
positioned from the instance root, which the forklift authors at its **centre** (`baseOffsetY`), so
on that chassis it floated across the mast rather than lying on the deck. ⚠️ **Identity is therefore
down to two channels — accent colour on the indicator faces, and the call-sign.** The note on
`UnitLivery` asks for three so colour is never load-bearing alone; with the shape gone, the
call-sign is what a colourblind operator has, and it has to stay legible wherever a unit is named.
⚠️ **`UnitLivery.markings` in `src/data/fleet.ts` now has NO consumer** — not the 3D scene, not the
2D map. It is declared data nothing reads. Either the 2D map should adopt it (a flat schematic can
carry a per-unit shape without it being mistaken for a heading, which is exactly what went wrong in
3D) or the field should go. Leaving it is the one option that quietly rots.

⚠️ **A holographic mode also used to live here and is DELETED, not disabled** — semi-transparent
hulls with `depthWrite: false` and emission across the whole surface. The objection that killed it
still stands and the rim answers it rather than dodging it: these are vehicles an operator reads at
distance to decide where machinery *is*, and a chassis you can see through stops holding its
silhouette. The rim puts light exactly **on** that silhouette, so the outline is drawn twice — once
by paint against the hall, once by light along its edge. A projection dissolves its own outline;
this sharpens it.

⚠️ **The glow is one fleet colour (`robotLivery.glow` → `primary-bright`), and it is neither an
identity channel nor a state.** Per-unit accents already spend the primary family on telling
machines apart. Every unit's edges light identically whatever it is doing — the moment the rim moves
with battery, fault, selection or staleness it becomes status carried by brightness alone, which the
domain rules forbid. ⚠️ **Trim is rimmed but never emits**, and **the rim is kept off the indicator
faces** so the fleet's blue doesn't blur the one colour saying *which* forklift this is.
⚠️ **Nothing structural glows, and that is what makes the fleet's glow mean anything.** Racking and
shell are explicitly zeroed in `applySurfaces`; the moment the building glows too, the one cue
separating moving equipment from structure is spent on the structure.
⚠️ **The glow is on the material precisely BECAUSE it is not bloom.** Bloom selects on brightness
across the whole frame, so it cannot be aimed: this scene had a bloom pass and deleted it after it
found the white cargo box and smeared it across every laden forklift. At the subtle levels used
here, no threshold catches a faint blue rim without also catching a lit white box.
Restoring bloom means re-tuning its threshold above both of them and above the white cargo box; see
the note in `warehouseScene.ts`.

**One brand accent for the whole fleet.** `robotLivery.accent` is `primary` for A, B, C *and* the
ASRS cranes. Chassis type used to be a hue (AGV blue, AMR mint, forklift violet) and is now a
**shape only** — the three models are already unmistakably different machines, so the hue was
spending the brand's most recognisable asset on a distinction the silhouette already makes.
`UNIT_LIVERY[id].accent` therefore changed job: it is no longer the machine's dominant colour but
its **rim** — the indicator strip, the identity badge and the 2D heading arrow — and all five are now
drawn from the primary family. ⚠️ **That narrowed one of the three redundant identity channels**
(colour · marking · call-sign) that the note on `UnitLivery` exists to protect — and the marking
channel has since been removed outright (see above), so the **call-sign now carries identity on its
own** for anyone the colour does not reach. Two of the five share a chassis and a GLB.

**The building is clean industrial metal** (`applySurfaces` + `warehouseTextures.ts`). The surface
replaced a painted-and-weathered steel carrying rust blooms, impact chips and a grime gradient:
correct for a hall used for twenty years, wrong for the brief. Wear is what dates a surface, so
there is none — a fine directional grain, the mill's tonal drift, and horizontal section seams.

⚠️ **`metalness: 0.62` AND `scene.environment` ARE ONE CHANGE — never separate them.** A metal
surface takes almost all its visible colour from what it reflects, so raising metalness without an
environment renders the racking nearly **black**, which looks like a broken texture rather than a
wrong material. `addEnvironment()` supplies it with `RoomEnvironment` + `PMREMGenerator` rather
than an HDRI file, because the project already ships ~380 MB of GLBs and first paint is the known
bottleneck. Its render target is **not reachable by walking the scene graph**, so `dispose()` frees
it explicitly or every remount leaks a filtered cube map.

Racking carries `opacity: 0.9` and keeps `depthWrite: true` — it is what robot positions are read
*against*, so at lower opacity the aisles stop separating from the bays, and a rack that stopped
writing depth would let every rack behind it sort in front of it.

⚠️ **The two surface tints come from theme tokens now** (`surfaceTints`, resolved by the viewer and
passed in). They were two hardcoded hexes with a note saying tokens "would be ideal", which made
the building the one part of the app that could not follow a rebrand.

**The GLBs are repainted into one house livery** by
`warehouse/robotLivery.ts`: shared body colour, shared dark trim, shared finish,
and a per-type accent so role stays readable. It replaces base colour /
roughness / metalness while KEEPING normal and AO maps, which is what makes the
result look like a product line instead of like flat clip art. Livery values are
theme token NAMES resolved live by the viewer — never hexes — so the fleet
re-paints with the app's theme. Materials are cloned per instance; never mutate a
cached GLB's materials or every instance of that chassis repaints with it.

⚠️ **Payload: the five robot GLBs total ~250 MB on top of the 133 MB warehouse.**
Nothing is compressed. They are fetched once per URL however many instances spawn,
and only when the 3D view is first opened, but that is still a very heavy first
paint. A Draco or meshopt re-export would cut it by roughly an order of magnitude
and needs no code change beyond registering the decoder.

### Boot chain

`main.ts` → (dev only) `await startMocks()` from `src/mocks/browser.ts` so the very first API call
is intercepted → `createApp(App)` → `registerPlugins()` (`src/plugins/index.ts`: vuetify, then
Pinia, then **router last** because its auth guard reads the auth store) → mount.

⚠️ **That `await startMocks()` has no `catch`.** If the MSW service worker fails to register or
never resolves, `bootstrap()` rejects and the app never mounts — a silently blank page with nothing
in the console. This reproduces under headless Chrome. It is dev-only (`import.meta.env.DEV`), so
`corepack pnpm build && corepack pnpm preview` skips MSW entirely and is the reliable way to view
the app when the worker misbehaves.

`App.vue` is nearly empty by design: just a `<RouterView>`. Screens are reached through the router,
not through `App.vue`.

The DS **Storybook** (`src/screens/Storybook.vue`) is **not part of the product app** — it is a
separate standalone app with its own entry (`storybook.html` → `src/storybook.ts`, which mounts
`Storybook.vue` with only Vuetify + Pinia — no router, no MSW). It runs on its own dev server on
**port 3001** via `corepack pnpm dev:storybook` (the product app stays on 3000); `corepack pnpm
dev:all` runs both at once. There is intentionally **no Storybook build script**, no product route,
and no in-app link to it, so it can never ship in the product bundle. See
`vite.storybook.config.mts`.

### How screens are composed

`src/router/index.ts` is the single place URLs map to screens. Adding a page = drop a `.vue` in
`src/screens/` + one route entry; no `App.vue` edit. Keep the landing and sign-in screens eagerly
imported; make every other screen lazy (`() => import(...)`) so each is its own chunk.

There is **no shared shell wrapper**, by design. Each screen is self-contained: it declares its own
`<v-app>` and its own chrome. If a project needs a persistent top bar or background, build it as a
component in `src/components/` and import it explicitly into each screen — the template ships none,
so nothing constrains what a given product's chrome looks like.

**Toasts are per-screen.** Each screen owns a local `<v-snackbar>` bound to a `snack` ref plus a
`notify(text, color)` helper, and passes `notify` down to child components that need it. There is
**no** app-wide snackbar and no injection contract — every screen that needs toasts declares its
own. Pre-auth screens omit the authenticated chrome; `Storybook.vue` owns its own `<v-app>` as a
standalone app.

### ⚠️ Local components are NOT auto-imported

**`unplugin-vue-components` is not installed.** Only Vuetify `<v-*>` components auto-import (via
`vite-plugin-vuetify`); every local component needs an explicit
`import X from '@/components/X.vue'`. Kebab-case tags in templates still resolve to that import.
See `src/components/README.md`.

### API seam

Screens and stores **never call `fetch`**. The layering:

- `src/api/types.ts` — the contracts. These types *are* the spec a backend team wires into. Keep
  them transport-agnostic: data shapes only.
- `src/api/client.ts` — one typed fetch wrapper; the only place that knows `BASE_URL`
  (`VITE_API_BASE_URL ?? '/api'`) and error shape. Non-2xx throws `ApiException` carrying
  `{ code, message, status }`, with a UI-safe fallback message.
- `src/api/<domain>.ts` — named callers (e.g. `auth.ts` → `login()`), so the operation set is
  discoverable in one place.
- `src/mocks/handlers.ts` — MSW implements those contracts in-memory; `src/mocks/browser.ts` boots
  the worker (needs `public/mockServiceWorker.js`, `onUnhandledRequest: 'bypass'`).

Swapping mocks → real API is a `VITE_API_BASE_URL` change; **no call site changes**. All mock data
is synthetic — **never put real user data in `src/mocks/`.** Note the dev login handler accepts
*any* credentials on purpose so the app is reachable without demo data.

Stores wrap the callers and add UI-safe error handling — see `stores/auth.ts` re-throwing network
failures as a friendly `ApiException` (never leak internals to a user-facing surface).

### State

Pinia option-stores in `src/stores/`: `auth` (user + token, persisted to `localStorage` under
`app.token`) and `app` (an empty scaffold to extend). Product state — carts, filters, wizards — is
added per project.

## Where to build new code

| Building… | Goes in | Notes |
|---|---|---|
| A **full screen / page** | `src/screens/` | One `.vue` per screen; declare its own `<v-app>` and its own chrome. Add a route in `src/router/index.ts`. Import components explicitly. |
| A **reusable component** | `src/components/` | Must be imported explicitly (see above). |
| A **chart / data viz** | `src/components/charts/` | Use a kit preset first; new presets go here on `BaseChart` + `useChartTheme.ts`. Colors/type/mark geometry are never set here — they come from `src/data/chartTheme.ts`. See the chart mandate above. |
| A **screen's dataset** | `src/data/<screen>.ts` | A typed contract + a synthetic data object. See the house rule below. |
| **Warehouse behaviour** | `src/sim/` | The fleet simulation. Plain TS, no Vue, no Three — see the three-layer rule below. Never put behaviour in a renderer. |
| **Warehouse layout** | `scripts/extract-*.mjs` → `src/data/warehouse*.ts` | ⚠️ Generated from the GLB, never hand-drawn. Edit the script and re-run it; the `src/data/warehouse*.ts` files are output. |
| **How the 2D map READS that layout** | `src/data/floorSchematic.ts` | Grouping, addressing and lettering of `warehouseObjects`. Derives; never invents a position. Check with `verify-schematic.mjs`, then `audit-plan-coverage.mjs`. |
| **API contracts / callers** | `src/api/` | `types.ts` · `client.ts` · `<domain>.ts`. |
| **Mock endpoints** | `src/mocks/handlers.ts` | Implement the contract; synthetic data only. |
| **Shared state** | `src/stores/` | Pinia. |

## Reference map

- `src/data/brand.ts` — the brand preset (`/new-project` writes it); `brand.identity` is live.
- `src/plugins/vuetify.ts` — the design control panel: theme colors (light/dark) + component
  defaults. Hot-reloads. Covers components only — **chart series colors live in
  `src/data/chartTheme.ts`** (below).
- `src/styles/_tokens.scss` — the raw radius scale (`$radius-sm…2xl`). **Edit radius here**, not in
  `settings.scss`: a Sass `with(…)` block can't reference the vars it configures, so this separate
  module is what keeps the `$rounded` scale and `$border-radius-root` coupled. Restart required.
- `src/styles/css-tokens.scss` — republishes that scale as `--radius-*` CSS custom properties for
  plain CSS and `<style>` blocks. Imported by `main.ts` + `storybook.ts` before `overrides.css`.
  **Never put a px literal in it** — it exists to remove duplicates, not add one.
- `src/styles/settings.scss` — spacing / sizing / type Sass vars, plus the Vuetify radius wiring
  (it references `_tokens.scss`; don't put radius numbers here). Restart required.
- `src/styles/overrides.css` — small documented fixes for Vuetify quirks with no prop/token lever;
  imported last in `main.ts` so it wins. Also defines `.section-panel` / `--section-radius`.
- `src/styles/sass-variables-reference.md` — the full ~764-var Sass catalog (reference only).
- `src/screens/Storybook.vue` — the DS Storybook: a standalone app on port 3001, and **the
  reference for every component and chart here**. Its *Colors* section renders the live theme, so
  any token not filed into `colorGroups` shows up under *Uncategorised*.
- `src/data/chartTheme.ts` — **the data-viz control panel**, what `vuetify.ts` is to components:
  the series colors (`categorical` / `sequential` / `diverging`) plus chart type sizes and mark
  geometry. Every chart reads it through `src/components/charts/useChartTheme.ts`, which pulls
  ink / surface / status colors *live* from the Vuetify theme instead — so those are **not**
  duplicated here. Hot-reloads. Its hexes **and the `categorical` order** are validated
  colorblind-safe against both card surfaces; no validator ships in this repo, so load the
  `dataviz` skill before retuning.
- `src/data/chartSamples.ts` — the synthetic datasets the Storybook charts render; the shape
  reference for the chart-kit props.
- `src/components/README.md` — what's in that folder and the explicit-import rule. Where it and
  this file disagree, this file wins.

## House rules

- Follow existing code style; keep code in TypeScript. Files carry substantial header comments
  explaining *why* — match that density when editing them.
- Use theme tokens + Vuetify utility classes, never hardcoded hex/px.
- **Never hardcode the product name.** Read `brand.identity` from `src/data/brand.ts` and
  interpolate it (`` `${brand.identity.shortName} Settings` ``). A find-and-replace rename must
  never be necessary.
- **Screens are dataset-driven.** Every screen renders from a typed dataset in `src/data/` (a
  contract + a synthetic data object) — no figures, labels, names, counts, or copy hardcoded in
  the template. Import the dataset, bind the template to it, and wrap mutable UI state in refs
  seeded from it. This keeps each screen a pure view, so a real backend drops in by producing the
  same shape (see the API seam in `src/api/`). Applies to *every* page as it's built.
