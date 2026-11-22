/** node:sqlite `StatementSync` natijalarini typed qilish */
export function sqlOne<T>(row: unknown): T | undefined {
  if (row === undefined) return undefined
  return row as T
}

export function sqlAll<T>(rows: unknown): T[] {
  return rows as T[]
}