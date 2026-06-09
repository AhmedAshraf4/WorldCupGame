export const TOURNAMENT_STAGES = {
  GROUP: "GROUP",
  RO32: "RO32",
  R16: "R16",
  QF: "QF",
  SF: "SF",
  FINAL: "FINAL",
} as const;

export const STAGE_POINTS = {
  RO32: 7,
  R16: 10,
  QF: 15,
  SF: 20,
  FINAL: 25,
} as const;

export const GROUP_POSITION_POINTS = {
  EXACT_POSITION: 5,
  TOP_TWO_WRONG_ORDER: 2,
  THIRD_PLACE_QUALIFIED: 1,
  GROUP_WILDCARD_WRONG: -15,
} as const;

export const CHAMPION_PICK_POINTS = 50;
export const FINALIST_PICK_POINTS = 50;

export type TournamentStage =
  (typeof TOURNAMENT_STAGES)[keyof typeof TOURNAMENT_STAGES];