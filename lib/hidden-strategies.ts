/** Strategies that should never appear in live dashboard aggregates. */
export const HIDDEN_STRATEGIES = ['hip3_xsec_skip_momentum'] as const;

export function hiddenStrategySql(column: string, paramIndex: number): string {
  return `${column} <> ALL($${paramIndex}::text[])`;
}
