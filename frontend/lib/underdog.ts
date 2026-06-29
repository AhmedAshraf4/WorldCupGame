export type RankedTeam = {
  id?: string | null;
  fifa_rank?: number | string | null;
  fifa_points?: number | string | null;
};

const MEANINGFUL_UNDERDOG_RANK_GAP = 3;
const MEANINGFUL_UNDERDOG_POINTS_GAP = 10;

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getMeaningfulUnderdogTeamId(
  teamA?: RankedTeam | null,
  teamB?: RankedTeam | null
) {
  if (!teamA?.id || !teamB?.id) return null;

  const teamARank = toNumber(teamA.fifa_rank);
  const teamBRank = toNumber(teamB.fifa_rank);

  if (teamARank !== null && teamBRank !== null) {
    if (Math.abs(teamARank - teamBRank) > MEANINGFUL_UNDERDOG_RANK_GAP) {
      return teamARank > teamBRank ? teamA.id : teamB.id;
    }

    return null;
  }

  const teamAPoints = toNumber(teamA.fifa_points);
  const teamBPoints = toNumber(teamB.fifa_points);

  if (teamAPoints !== null && teamBPoints !== null) {
    if (Math.abs(teamAPoints - teamBPoints) >= MEANINGFUL_UNDERDOG_POINTS_GAP) {
      return teamAPoints < teamBPoints ? teamA.id : teamB.id;
    }
  }

  return null;
}

export function formatTeamRank(team?: RankedTeam | null) {
  const rank = toNumber(team?.fifa_rank);
  return rank === null ? "Rank -" : `Rank #${rank}`;
}
