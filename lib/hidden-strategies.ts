/** @deprecated Use getArchivedStrategies() — list is persisted and editable in the UI. */
export { DEFAULT_ARCHIVED_STRATEGIES, getArchivedStrategies } from './archived-strategies-store';

export function hiddenStrategySql(column: string, paramIndex: number): string {
  return `${column} <> ALL($${paramIndex}::text[])`;
}
