import pg from 'pg'

function toPgParams(sql: string): string {
  let i = 0
  return sql.replace(/\?/g, () => `$${++i}`)
}

export class SqlClient {
  constructor(private readonly pool: pg.Pool) {}

  async query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    sql: string,
    params: unknown[] = [],
  ): Promise<pg.QueryResult<T>> {
    return this.pool.query<T>(toPgParams(sql), params)
  }

  async exec(sql: string): Promise<void> {
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
    for (const statement of statements) {
      await this.pool.query(statement)
    }
  }

  prepare(sql: string) {
    const text = toPgParams(sql)
    return {
      get: async <T = pg.QueryResultRow>(...params: unknown[]) => {
        const result = await this.pool.query(text, params)
        return result.rows[0] as T | undefined
      },
      all: async <T = pg.QueryResultRow>(...params: unknown[]) => {
        const result = await this.pool.query(text, params)
        return result.rows as T[]
      },
      run: async (...params: unknown[]) => {
        await this.pool.query(text, params)
      },
    }
  }
}
