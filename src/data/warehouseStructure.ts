/**
 * src/data/warehouseStructure.ts
 *
 * ⚠️ GENERATED FILE — DO NOT EDIT BY HAND.
 * Produced by scripts/extract-plan-structure.mjs from the warehouse GLB.
 * Re-run that script when the model changes.
 *
 * THE WAREHOUSE, MEASURED. Every rectangle, band and centre line here was read
 * off the model the 3D view renders — there is no second, hand-drawn layout any
 * more, and the 2D map is a projection of this rather than an opinion about it.
 *
 * `src/data/fleet.ts` builds the road network and the stations on top of this
 * and decides POLICY: which chassis works where, which way traffic runs, how
 * often a face is picked. Geometry is measured; policy is authored.
 *
 * Nothing here claims to know what any individual object IS — the model names
 * nothing. It knows where mass is, where the floor is clear, and how wide the
 * gaps are, which is all a robot needs.
 */

import type { FloorZone, ShellVertex } from './floorOps'

/**
 * ⚠️ THE ONE PHYSICAL SCALE.
 *
 * A plan unit is exactly 0.020971179039301308 m. The viewBox below is the interior's true
 * size × 47.68449108778944, so the projection that fits it back onto the model can only produce
 * this figure, and both axes bind at once. `PLAN_UNITS_PER_METRE` in
 * `fleet.ts` asserts against it at import time.
 */
export const planScale = {
  metresPerUnit: 0.020971179039301308,
  unitsPerMetre: 47.68449108778944,
} as const

/** The plan's box — the building's interior, exactly, with the origin at its corner. */
export const planViewBox = {"x":-67,"y":70,"width":1374,"height":759.999} as const

/** The interior wall line, clockwise from the top-left corner. */
export const warehouseShell: ShellVertex[] = [[-67,70,23.84224554389472],[1307,70,23.84224554389472],[1307,829.999,23.84224554389472],[-67,829.999,23.84224554389472]]

/**
 * A run of racking. `band` is the strip of plan-y it occupies, `servedBy` the
 * lanes that touch it, and `solid` the spans of plan-x where there is really
 * racking — a pick face outside one of those would face an empty bay.
 */
export interface RackRun {
  code: string
  band: readonly [number, number]
  mid: number
  /** How far off the lane a face stands, toward the rack. */
  faceDepth: number
  servedBy: number[]
  solid: Array<readonly [number, number]>
}

export const rackRuns: RackRun[] = [
  {
    "code": "A",
    "band": [
      88,
      150
    ],
    "mid": 119,
    "faceDepth": 23.842,
    "servedBy": [
      231
    ],
    "solid": [
      [
        58,
        473
      ],
      [
        538,
        953
      ]
    ]
  },
  {
    "code": "B",
    "band": [
      278,
      338
    ],
    "mid": 308,
    "faceDepth": 23.842,
    "servedBy": [
      231,
      380
    ],
    "solid": [
      [
        118,
        538
      ],
      [
        613,
        693
      ],
      [
        758,
        843
      ]
    ]
  },
  {
    "code": "C",
    "band": [
      564,
      624
    ],
    "mid": 594,
    "faceDepth": 23.842,
    "servedBy": [
      466,
      666
    ],
    "solid": [
      [
        118,
        538
      ],
      [
        618,
        688
      ],
      [
        753,
        843
      ],
      [
        918,
        988
      ]
    ]
  },
  {
    "code": "D",
    "band": [
      758,
      820
    ],
    "mid": 789,
    "faceDepth": 23.842,
    "servedBy": [
      666
    ],
    "solid": [
      [
        58,
        473
      ],
      [
        538,
        953
      ],
      [
        983,
        1307
      ]
    ]
  }
]

/**
 * A drivable centre line, measured. `from`/`to` is the span that is clear end
 * to end and `worst` the tightest clearance anywhere along it.
 *
 * ⚠️ These are NOT the middles of their aisles. Each is the line that runs the
 * whole length of the building; the geometric centre of an aisle is frequently
 * blocked by plant somewhere along it, and a lane with a hole in it splits the
 * network into pieces.
 */
export interface Aisle {
  py: number
  /** Every drivable stretch of this lane. Aisles have things standing in them. */
  segments: Array<readonly [number, number]>
  /** Tightest clearance along the lane, in metres. */
  worst: number
  band: readonly [number, number]
}

export const aisles: Aisle[] = [
  {
    "py": 231,
    "segments": [
      [
        -17,
        1307
      ]
    ],
    "worst": 0.55,
    "band": [
      168,
      258
    ]
  },
  {
    "py": 380,
    "segments": [
      [
        33,
        788
      ],
      [
        828,
        1173
      ]
    ],
    "worst": 0.45,
    "band": [
      364,
      544
    ]
  },
  {
    "py": 466,
    "segments": [
      [
        -17,
        1143
      ]
    ],
    "worst": 0.5,
    "band": [
      364,
      544
    ]
  },
  {
    "py": 666,
    "segments": [
      [
        -17,
        1307
      ]
    ],
    "worst": 0.5,
    "band": [
      644,
      740
    ]
  }
]

/**
 * Plan-x positions where a unit can cross the whole building between the first
 * and last lane. The racking is solid everywhere else, so these are not
 * adjustable — they are the only ways through.
 */
/**
 * A place a unit can step from one aisle into the next one across.
 *
 * ⚠️ MEASURED PAIRWISE, and that is what makes the ends of the building usable.
 * Only three gaps run clean through all four aisles at once; testing for those
 * alone threw away both end halls, because one blocked bay anywhere across the
 * width disqualifies the whole column. A link between two NEIGHBOURING lanes is
 * useful on its own — stepping twice crosses the building anyway.
 */
export interface CrossLink {
  /** The two lanes this joins, by their plan-y. */
  a: number
  b: number
  /** Plan-x positions where the step is clear. */
  xs: number[]
}

export const crossLinks: CrossLink[] = [
  {
    "a": 231,
    "b": 380,
    "xs": [
      65,
      575,
      726,
      872,
      1027.69,
      1158.31
    ]
  },
  {
    "a": 380,
    "b": 466,
    "xs": [
      47.69,
      229.345,
      411,
      592.655,
      774.31,
      843.69,
      1128.31,
      1264
    ]
  },
  {
    "a": 466,
    "b": 666,
    "xs": [
      40,
      575,
      720,
      880,
      1027.69,
      1128.31
    ]
  }
]

/** Clear rectangles big enough to stand equipment in, largest first. */
export const openFloor: Array<{ x: number; y: number; w: number; h: number }> = [
  {
    "x": 47.443,
    "y": 375.181,
    "w": 724.804,
    "h": 95.369
  },
  {
    "x": 1020.206,
    "y": 241.664,
    "w": 76.295,
    "h": 476.845
  },
  {
    "x": -9.779,
    "y": 184.443,
    "w": 572.214,
    "h": 57.221
  },
  {
    "x": 1115.575,
    "y": 89.074,
    "w": 95.369,
    "h": 228.886
  },
  {
    "x": 219.107,
    "y": 661.288,
    "w": 381.476,
    "h": 57.221
  },
  {
    "x": 848.542,
    "y": 375.181,
    "w": 152.59,
    "h": 114.443
  },
  {
    "x": 982.059,
    "y": 108.148,
    "w": 114.443,
    "h": 114.443
  },
  {
    "x": 1191.871,
    "y": 604.066,
    "w": 114.443,
    "h": 114.443
  },
  {
    "x": 1249.092,
    "y": 89.074,
    "w": 57.221,
    "h": 228.886
  },
  {
    "x": 1096.502,
    "y": 565.919,
    "w": 76.295,
    "h": 152.59
  },
  {
    "x": -9.779,
    "y": 546.845,
    "w": 95.369,
    "h": 114.443
  },
  {
    "x": 1230.018,
    "y": 394.255,
    "w": 76.295,
    "h": 114.443
  },
  {
    "x": -9.779,
    "y": 260.738,
    "w": 95.369,
    "h": 76.295
  },
  {
    "x": 772.247,
    "y": 413.328,
    "w": 57.221,
    "h": 114.443
  },
  {
    "x": 791.321,
    "y": 184.443,
    "w": 57.221,
    "h": 57.221
  }
]

export const warehouseZones: FloorZone[] = [
  {
    "id": "z-a1",
    "kind": "rack",
    "x": -67,
    "y": 70,
    "w": 26.703,
    "h": 167.849,
    "bays": 2,
    "axis": "row"
  },
  {
    "id": "z-a2",
    "kind": "rack",
    "x": 55.072,
    "y": 92.889,
    "w": 419.624,
    "h": 45.777,
    "bays": 7,
    "axis": "row"
  },
  {
    "id": "z-a3",
    "kind": "rack",
    "x": 535.732,
    "y": 92.889,
    "w": 198.367,
    "h": 15.259,
    "bays": 3,
    "axis": "row"
  },
  {
    "id": "z-a4",
    "kind": "rack",
    "x": 741.729,
    "y": 92.889,
    "w": 213.627,
    "h": 15.259,
    "bays": 3,
    "axis": "row"
  },
  {
    "id": "z-a5",
    "kind": "rack",
    "x": 535.732,
    "y": 108.148,
    "w": 419.624,
    "h": 30.518,
    "bays": 7,
    "axis": "row"
  },
  {
    "id": "z-a6",
    "kind": "rack",
    "x": 55.072,
    "y": 138.666,
    "w": 83.925,
    "h": 7.63,
    "bays": 2,
    "axis": "row"
  },
  {
    "id": "z-a7",
    "kind": "rack",
    "x": 257.255,
    "y": 138.666,
    "w": 102.999,
    "h": 7.63,
    "bays": 2,
    "axis": "row"
  },
  {
    "id": "z-a8",
    "kind": "rack",
    "x": 535.732,
    "y": 138.666,
    "w": 221.256,
    "h": 7.63,
    "bays": 4,
    "axis": "row"
  },
  {
    "id": "z-a9",
    "kind": "rack",
    "x": 806.58,
    "y": 138.666,
    "w": 148.776,
    "h": 7.63,
    "bays": 2,
    "axis": "row"
  },
  {
    "id": "z-p1",
    "kind": "cell",
    "x": 600.583,
    "y": 169.184,
    "w": 64.851,
    "h": 30.518
  },
  {
    "id": "z-b1",
    "kind": "rack",
    "x": -67,
    "y": 253.108,
    "w": 26.703,
    "h": 183.108,
    "bays": 2,
    "axis": "row"
  },
  {
    "id": "z-b2",
    "kind": "rack",
    "x": 612.027,
    "y": 260.738,
    "w": 80.11,
    "h": 83.925,
    "bays": 2,
    "axis": "row"
  },
  {
    "id": "z-b3",
    "kind": "rack",
    "x": 760.803,
    "y": 260.738,
    "w": 22.889,
    "h": 38.148,
    "bays": 2,
    "axis": "row"
  },
  {
    "id": "z-b4",
    "kind": "rack",
    "x": 943.911,
    "y": 260.738,
    "w": 41.962,
    "h": 22.889,
    "bays": 2,
    "axis": "row"
  },
  {
    "id": "z-b5",
    "kind": "rack",
    "x": 119.923,
    "y": 283.627,
    "w": 213.627,
    "h": 7.63,
    "bays": 3,
    "axis": "row"
  },
  {
    "id": "z-b6",
    "kind": "rack",
    "x": 398.401,
    "y": 283.627,
    "w": 141.146,
    "h": 7.63,
    "bays": 2,
    "axis": "row"
  },
  {
    "id": "z-b7",
    "kind": "rack",
    "x": 119.923,
    "y": 291.256,
    "w": 419.624,
    "h": 45.777,
    "bays": 7,
    "axis": "row"
  },
  {
    "id": "z-b8",
    "kind": "rack",
    "x": 760.803,
    "y": 298.886,
    "w": 80.11,
    "h": 30.518,
    "bays": 2,
    "axis": "row"
  },
  {
    "id": "z-b9",
    "kind": "rack",
    "x": 783.691,
    "y": 329.404,
    "w": 57.221,
    "h": 15.259,
    "bays": 2,
    "axis": "row"
  },
  {
    "id": "z-b10",
    "kind": "rack",
    "x": 924.837,
    "y": 329.404,
    "w": 53.407,
    "h": 15.259,
    "bays": 2,
    "axis": "row"
  },
  {
    "id": "z-p2",
    "kind": "cell",
    "x": 1195.685,
    "y": 352.292,
    "w": 111.315,
    "h": 7.63
  },
  {
    "id": "z-p3",
    "kind": "cell",
    "x": -17.408,
    "y": 375.181,
    "w": 30.518,
    "h": 68.666
  },
  {
    "id": "z-p4",
    "kind": "cell",
    "x": 1165.167,
    "y": 443.846,
    "w": 38.148,
    "h": 61.036
  },
  {
    "id": "z-p5",
    "kind": "cell",
    "x": -67,
    "y": 489.624,
    "w": 26.703,
    "h": 343.328
  },
  {
    "id": "z-p6",
    "kind": "cell",
    "x": 409.845,
    "y": 512.512,
    "w": 64.851,
    "h": 30.518
  },
  {
    "id": "z-c1",
    "kind": "rack",
    "x": 1207.13,
    "y": 550.66,
    "w": 41.962,
    "h": 22.889,
    "bays": 2,
    "axis": "row"
  },
  {
    "id": "z-c2",
    "kind": "rack",
    "x": 1264.351,
    "y": 550.66,
    "w": 42.649,
    "h": 22.889,
    "bays": 2,
    "axis": "row"
  },
  {
    "id": "z-c3",
    "kind": "rack",
    "x": 215.292,
    "y": 565.919,
    "w": 99.184,
    "h": 7.63,
    "bays": 2,
    "axis": "row"
  },
  {
    "id": "z-c4",
    "kind": "rack",
    "x": 455.622,
    "y": 565.919,
    "w": 83.925,
    "h": 7.63,
    "bays": 2,
    "axis": "row"
  },
  {
    "id": "z-c5",
    "kind": "rack",
    "x": 760.803,
    "y": 565.919,
    "w": 80.11,
    "h": 15.259,
    "bays": 2,
    "axis": "row"
  },
  {
    "id": "z-c6",
    "kind": "rack",
    "x": 921.023,
    "y": 565.919,
    "w": 68.666,
    "h": 76.295,
    "bays": 2,
    "axis": "row"
  },
  {
    "id": "z-c7",
    "kind": "rack",
    "x": 119.923,
    "y": 573.548,
    "w": 419.624,
    "h": 45.777,
    "bays": 7,
    "axis": "row"
  },
  {
    "id": "z-c8",
    "kind": "rack",
    "x": 612.027,
    "y": 573.548,
    "w": 76.295,
    "h": 38.148,
    "bays": 2,
    "axis": "row"
  },
  {
    "id": "z-c9",
    "kind": "rack",
    "x": 753.173,
    "y": 581.178,
    "w": 87.739,
    "h": 61.036,
    "bays": 2,
    "axis": "row"
  },
  {
    "id": "z-c10",
    "kind": "rack",
    "x": 615.842,
    "y": 611.696,
    "w": 41.962,
    "h": 15.259,
    "bays": 2,
    "axis": "row"
  },
  {
    "id": "z-c11",
    "kind": "rack",
    "x": 612.027,
    "y": 626.955,
    "w": 76.295,
    "h": 7.63,
    "bays": 2,
    "axis": "row"
  },
  {
    "id": "z-p7",
    "kind": "cell",
    "x": 772.247,
    "y": 703.25,
    "w": 68.666,
    "h": 15.259
  },
  {
    "id": "z-p8",
    "kind": "cell",
    "x": 783.691,
    "y": 718.509,
    "w": 57.221,
    "h": 15.259
  },
  {
    "id": "z-d1",
    "kind": "rack",
    "x": 55.072,
    "y": 764.286,
    "w": 419.624,
    "h": 53.407,
    "bays": 7,
    "axis": "row"
  },
  {
    "id": "z-d2",
    "kind": "rack",
    "x": 535.732,
    "y": 764.286,
    "w": 419.624,
    "h": 45.777,
    "bays": 7,
    "axis": "row"
  },
  {
    "id": "z-d3",
    "kind": "rack",
    "x": 982.059,
    "y": 764.286,
    "w": 324.941,
    "h": 53.407,
    "bays": 5,
    "axis": "row"
  },
  {
    "id": "z-d4",
    "kind": "rack",
    "x": 535.732,
    "y": 810.063,
    "w": 87.739,
    "h": 7.63,
    "bays": 2,
    "axis": "row"
  },
  {
    "id": "z-d5",
    "kind": "rack",
    "x": 741.729,
    "y": 810.063,
    "w": 122.072,
    "h": 7.63,
    "bays": 2,
    "axis": "row"
  }
]
