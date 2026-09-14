export type TrainingStrokeSide = "forehand" | "backhand";

export type TrainingSessionReport = {
  swings: 20;
  hits: number;
  misses: number;
  hitPercentage: number;
  bySide: Record<TrainingStrokeSide, { swings: number; hits: number; hitPercentage: number }>;
  missReasons: Array<{ reason: string; count: number }>;
};

/** Collects fixed 20-swing calibration blocks without affecting hit decisions. */
export class TrainingSessionCalibration {
  private outcomes: Array<{ hit: boolean; side: TrainingStrokeSide; missReason: string | null }> = [];

  record(hit: boolean, side: TrainingStrokeSide, missReason: string | null = null): TrainingSessionReport | null {
    this.outcomes.push({ hit, side, missReason });
    if (this.outcomes.length < 20) return null;

    const completed = this.outcomes.splice(0, 20);
    const hits = completed.filter(outcome => outcome.hit).length;
    const bySide = (['forehand', 'backhand'] as const).reduce((summary, side) => {
      const outcomes = completed.filter(outcome => outcome.side === side);
      const sideHits = outcomes.filter(outcome => outcome.hit).length;
      summary[side] = {
        swings: outcomes.length,
        hits: sideHits,
        hitPercentage: outcomes.length === 0 ? 0 : Math.round(sideHits / outcomes.length * 100)
      };
      return summary;
    }, {} as TrainingSessionReport['bySide']);
    const reasonCounts = new Map<string, number>();
    for (const outcome of completed) {
      if (!outcome.hit) {
        const reason = outcome.missReason ?? "UNKNOWN";
        reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
      }
    }
    return {
      swings: 20,
      hits,
      misses: 20 - hits,
      hitPercentage: Math.round(hits / 20 * 100),
      bySide,
      missReasons: [...reasonCounts].map(([reason, count]) => ({ reason, count }))
        .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason))
    };
  }
}
