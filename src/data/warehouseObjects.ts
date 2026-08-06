/**
 * src/data/warehouseObjects.ts
 *
 * ⚠️ GENERATED FILE — DO NOT EDIT BY HAND.
 * Produced by scripts/extract-plan-objects.mjs from the warehouse GLB.
 * Re-run that script when the model changes.
 *
 * EVERY OBJECT STANDING ON THE FLOOR, measured across the FULL height of the
 * interior (0.06–3.3 m) rather than through the 0.25–1.9 m band a robot
 * strikes. That distinction is the reason this file exists: the 2D map used to
 * be drawn from the navigation grid, which cannot see the east rack (its lowest
 * member is above 1.9 m), any pallet on the floor, or the top of a rack beam —
 * 22 % of the building's mass, none of which looked missing.
 *
 * ⚠️ NOTHING HERE FEEDS ROUTING. Corridors, stations and the plan scale are all
 * measured against `warehouseNav.ts` and must stay that way. This is a drawing
 * input, consumed by `src/data/floorSchematic.ts`.
 *
 * `kind` is inferred from height and nothing else — the model names nothing:
 *   rack   tops out above 2.05 m, taller than any machine in the fleet
 *   plant  in between: benches, conveyors, machines, transfer stands
 *   goods  tops out below 0.65 m — a pallet or a stack on the floor
 */

export interface WarehouseObject {
  id: string
  kind: 'rack' | 'plant' | 'goods'
  /** Plan units — the same space the fleet, the stations and the 2D map use. */
  x: number
  y: number
  w: number
  h: number
  /** Lowest and highest mass over this rectangle, centimetres above the slab. */
  baseCm: number
  topCm: number
}

export const warehouseObjects: WarehouseObject[] = [
  { id: 'o-001', kind: 'rack', x: -67, y: 70, w: 30, h: 36, baseCm: 9, topCm: 330 },
  { id: 'o-002', kind: 'goods', x: 989, y: 70, w: 104, h: 8, baseCm: 7, topCm: 45 },
  { id: 'o-003', kind: 'rack', x: 59, y: 86, w: 418, h: 58, baseCm: 9, topCm: 330 },
  { id: 'o-004', kind: 'rack', x: 539, y: 86, w: 418, h: 58, baseCm: 9, topCm: 330 },
  { id: 'o-005', kind: 'rack', x: -67, y: 106, w: 28, h: 268, baseCm: 9, topCm: 330 },
  { id: 'o-006', kind: 'plant', x: 599, y: 146, w: 70, h: 42, baseCm: 6, topCm: 118 },
  { id: 'o-007', kind: 'plant', x: 881, y: 148, w: 46, h: 30, baseCm: 6, topCm: 66 },
  { id: 'o-008', kind: 'plant', x: 605, y: 188, w: 64, h: 8, baseCm: 6, topCm: 118 },
  { id: 'o-009', kind: 'plant', x: 611, y: 260, w: 84, h: 38, baseCm: 6, topCm: 72 },
  { id: 'o-010', kind: 'plant', x: 759, y: 260, w: 86, h: 70, baseCm: 6, topCm: 80 },
  { id: 'o-011', kind: 'goods', x: 907, y: 260, w: 84, h: 80, baseCm: 6, topCm: 39 },
  { id: 'o-012', kind: 'rack', x: 123, y: 278, w: 418, h: 58, baseCm: 9, topCm: 330 },
  { id: 'o-013', kind: 'goods', x: 615, y: 298, w: 82, h: 44, baseCm: 6, topCm: 62 },
  { id: 'o-014', kind: 'plant', x: 763, y: 330, w: 82, h: 12, baseCm: 6, topCm: 80 },
  { id: 'o-015', kind: 'plant', x: 767, y: 344, w: 48, h: 28, baseCm: 6, topCm: 66 },
  { id: 'o-016', kind: 'rack', x: 1195, y: 352, w: 112, h: 26, baseCm: 14, topCm: 246 },
  { id: 'o-017', kind: 'rack', x: -67, y: 374, w: 86, h: 56, baseCm: 6, topCm: 330 },
  { id: 'o-018', kind: 'rack', x: 1199, y: 378, w: 108, h: 30, baseCm: 6, topCm: 246 },
  { id: 'o-019', kind: 'rack', x: 1165, y: 410, w: 142, h: 128, baseCm: 6, topCm: 329 },
  { id: 'o-020', kind: 'rack', x: -67, y: 476, w: 26, h: 186, baseCm: 9, topCm: 330 },
  { id: 'o-021', kind: 'plant', x: 411, y: 512, w: 70, h: 22, baseCm: 7, topCm: 118 },
  { id: 'o-022', kind: 'plant', x: 917, y: 524, w: 46, h: 32, baseCm: 6, topCm: 66 },
  { id: 'o-023', kind: 'plant', x: 189, y: 526, w: 46, h: 38, baseCm: 6, topCm: 66 },
  { id: 'o-024', kind: 'plant', x: 417, y: 534, w: 64, h: 8, baseCm: 6, topCm: 118 },
  { id: 'o-025', kind: 'rack', x: 1199, y: 538, w: 108, h: 14, baseCm: 21, topCm: 329 },
  { id: 'o-026', kind: 'goods', x: 1207, y: 552, w: 100, h: 22, baseCm: 7, topCm: 45 },
  { id: 'o-027', kind: 'plant', x: 615, y: 558, w: 82, h: 44, baseCm: 6, topCm: 84 },
  { id: 'o-028', kind: 'plant', x: 759, y: 560, w: 86, h: 80, baseCm: 6, topCm: 89 },
  { id: 'o-029', kind: 'plant', x: 909, y: 560, w: 82, h: 80, baseCm: 6, topCm: 90 },
  { id: 'o-030', kind: 'rack', x: 123, y: 564, w: 418, h: 58, baseCm: 9, topCm: 330 },
  { id: 'o-031', kind: 'plant', x: 611, y: 602, w: 84, h: 38, baseCm: 6, topCm: 84 },
  { id: 'o-032', kind: 'goods', x: 1295, y: 610, w: 12, h: 54, baseCm: 6, topCm: 12 },
  { id: 'o-033', kind: 'rack', x: -67, y: 662, w: 72, h: 40, baseCm: 6, topCm: 330 },
  { id: 'o-034', kind: 'plant', x: 775, y: 698, w: 70, h: 22, baseCm: 7, topCm: 118 },
  { id: 'o-035', kind: 'rack', x: -67, y: 702, w: 28, h: 128, baseCm: 9, topCm: 330 },
  { id: 'o-036', kind: 'plant', x: 917, y: 714, w: 46, h: 24, baseCm: 6, topCm: 66 },
  { id: 'o-037', kind: 'plant', x: 189, y: 716, w: 46, h: 40, baseCm: 6, topCm: 66 },
  { id: 'o-038', kind: 'plant', x: 783, y: 720, w: 62, h: 8, baseCm: 6, topCm: 118 },
  { id: 'o-039', kind: 'rack', x: 59, y: 756, w: 418, h: 58, baseCm: 9, topCm: 330 },
  { id: 'o-040', kind: 'rack', x: 539, y: 756, w: 418, h: 58, baseCm: 9, topCm: 330 },
  { id: 'o-041', kind: 'rack', x: 985, y: 758, w: 322, h: 58, baseCm: 9, topCm: 330 },
]
