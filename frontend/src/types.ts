export const DEPTHS = [
  0,
  5,
  10,
  20,
  30,
  50,
  75,
  100,
  125,
  150,
  200,
  300,
  500,
  700,
  1000,
] as const;

export type Depth = (typeof DEPTHS)[number];

export type Region =
  | "Arabian Sea"
  | "Bay of Bengal";
