/**
 * src/data/warehouseLayout.ts
 *
 * ⚠️ GENERATED FILE — DO NOT EDIT BY HAND.
 * Produced by scripts/extract-warehouse-layout.mjs from the warehouse GLB.
 * Re-run that script when the model changes.
 *
 * These are the REAL world-space bounds of every node in the 3D model, so the
 * 2D view can be drawn from the same geometry the 3D view renders rather than
 * from a separate drawing. Units are the model's own.
 *
 * The `role` field is inferred from geometry alone — a full-footprint box with
 * no height is the floor slab, a full-footprint box with height is the building
 * shell, and everything else is interior mass. The model records nothing about
 * what that mass IS, so nothing here claims to be a rack, a charger or a pick
 * station. Those need a person to label once, against the rendered model.
 */

export type WarehouseObjectRole = 'slab' | 'shell' | 'structure'

export interface WarehouseObject {
  /** Node name from the GLB. Meaningless in this export, but stable. */
  id: string
  role: WarehouseObjectRole
  /** Footprint, world units, top-down. x/z are the min corner. */
  x: number
  z: number
  w: number
  d: number
  /** Vertical extent, so the 2D view can drop anything above the cut line. */
  y: number
  h: number
}

/** Overall extents of the building, world units. */
export const warehouseHull = {
  x: -8.662,
  z: -15.625,
  width: 17.324,
  depth: 31.32,
  height: 5.089,
} as const

export const warehouseObjects: WarehouseObject[] = [
  {
    "id": "Node5",
    "role": "slab",
    "x": -8.662,
    "z": -15.625,
    "w": 17.324,
    "d": 31.235,
    "y": 0,
    "h": 0.022
  },
  {
    "id": "Node2",
    "role": "shell",
    "x": -8.636,
    "z": -15.614,
    "w": 17.272,
    "d": 31.227,
    "y": 0.022,
    "h": 5.068
  },
  {
    "id": "Node3",
    "role": "shell",
    "x": -8.617,
    "z": -15.463,
    "w": 17.233,
    "d": 30.925,
    "y": 0.022,
    "h": 5.051
  },
  {
    "id": "Node1",
    "role": "shell",
    "x": -8.552,
    "z": -15.551,
    "w": 17.104,
    "d": 31.109,
    "y": 0,
    "h": 5.045
  },
  {
    "id": "Node4",
    "role": "shell",
    "x": -8.562,
    "z": -15.492,
    "w": 17.123,
    "d": 30.984,
    "y": 0.022,
    "h": 5.017
  },
  {
    "id": "Node8",
    "role": "slab",
    "x": -8.404,
    "z": -15.251,
    "w": 16.808,
    "d": 30.73,
    "y": 0.021,
    "h": 0.002
  },
  {
    "id": "Node7",
    "role": "shell",
    "x": -8.173,
    "z": -15.016,
    "w": 16.346,
    "d": 30.237,
    "y": 0.021,
    "h": 3.281
  },
  {
    "id": "Node9",
    "role": "structure",
    "x": -8.173,
    "z": -15.024,
    "w": 16.086,
    "d": 30.245,
    "y": 0.09,
    "h": 3.107
  },
  {
    "id": "Node28",
    "role": "structure",
    "x": -7.958,
    "z": -13.824,
    "w": 15.916,
    "d": 29.319,
    "y": 0.791,
    "h": 0.981
  },
  {
    "id": "Node11",
    "role": "structure",
    "x": -7.936,
    "z": -14.661,
    "w": 15.207,
    "d": 29.652,
    "y": 0.093,
    "h": 2.883
  },
  {
    "id": "Node6",
    "role": "structure",
    "x": -4.04,
    "z": -15.55,
    "w": 11.699,
    "d": 31.115,
    "y": 0.018,
    "h": 3.67
  },
  {
    "id": "Node27",
    "role": "structure",
    "x": -6.158,
    "z": -13.333,
    "w": 12.319,
    "d": 28.542,
    "y": 0.016,
    "h": 0.647
  },
  {
    "id": "Node23",
    "role": "structure",
    "x": -6.437,
    "z": -13.375,
    "w": 12.873,
    "d": 26.75,
    "y": 3.331,
    "h": 1.355
  },
  {
    "id": "Node10",
    "role": "structure",
    "x": -7.659,
    "z": -14.932,
    "w": 15.556,
    "d": 21.847,
    "y": 0.093,
    "h": 2.783
  },
  {
    "id": "Node18",
    "role": "structure",
    "x": -5.846,
    "z": -13.394,
    "w": 11.971,
    "d": 18.133,
    "y": 0.025,
    "h": 1.155
  },
  {
    "id": "Node22",
    "role": "structure",
    "x": -4.599,
    "z": -10.402,
    "w": 9.198,
    "d": 20.804,
    "y": 3.639,
    "h": 0.699
  },
  {
    "id": "Node12",
    "role": "structure",
    "x": -6.826,
    "z": -8.059,
    "w": 13.628,
    "d": 12.887,
    "y": 1.212,
    "h": 1.307
  },
  {
    "id": "Node26",
    "role": "structure",
    "x": -2.564,
    "z": 7.791,
    "w": 10.824,
    "d": 6.714,
    "y": 0.003,
    "h": 0.445
  },
  {
    "id": "Node14",
    "role": "structure",
    "x": -3.556,
    "z": -5.813,
    "w": 11.133,
    "d": 4.045,
    "y": 1.221,
    "h": 0.407
  },
  {
    "id": "Node15",
    "role": "structure",
    "x": 2.464,
    "z": -5.829,
    "w": 5.245,
    "d": 8.384,
    "y": 2.269,
    "h": 0.344
  },
  {
    "id": "Node20",
    "role": "structure",
    "x": 1.53,
    "z": 12.111,
    "w": 6.426,
    "d": 3.506,
    "y": 0.529,
    "h": 0.393
  },
  {
    "id": "Node25",
    "role": "structure",
    "x": 1.609,
    "z": 12.129,
    "w": 6.235,
    "d": 3.344,
    "y": 0.79,
    "h": 1.252
  },
  {
    "id": "Node16",
    "role": "structure",
    "x": -3.949,
    "z": 2.956,
    "w": 1.608,
    "d": 1.757,
    "y": 0.089,
    "h": 0.804
  },
  {
    "id": "Node13",
    "role": "structure",
    "x": -3.954,
    "z": -0.054,
    "w": 1.579,
    "d": 1.551,
    "y": 0.092,
    "h": 0.744
  },
  {
    "id": "Node17",
    "role": "structure",
    "x": -4.013,
    "z": 6.433,
    "w": 1.723,
    "d": 1.347,
    "y": 0.128,
    "h": 0.767
  },
  {
    "id": "Node21",
    "role": "structure",
    "x": -1.842,
    "z": 11.506,
    "w": 2.721,
    "d": 0.655,
    "y": 0.024,
    "h": 2.597
  },
  {
    "id": "Node19",
    "role": "structure",
    "x": 1.459,
    "z": 12.808,
    "w": 0.36,
    "d": 1.866,
    "y": 2.019,
    "h": 0.436
  },
  {
    "id": "Node24",
    "role": "structure",
    "x": -2.113,
    "z": 15.49,
    "w": 1.205,
    "d": 0.205,
    "y": 1.586,
    "h": 0.267
  }
]
