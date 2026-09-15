import { Pool } from "pg";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgres://postgres:devpassword@localhost:5432/roost",
});

export async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS records (
      table_name TEXT NOT NULL,
      id TEXT NOT NULL,
      company_id TEXT,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (table_name, id)
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_records_table_company ON records (table_name, company_id);`
  );
}

export const db = {
  async table(name: string, companyId?: string): Promise<any[]> {
    const res = companyId
      ? await pool.query(
          "SELECT data FROM records WHERE table_name = $1 AND company_id = $2 ORDER BY created_at ASC",
          [name, companyId]
        )
      : await pool.query(
          "SELECT data FROM records WHERE table_name = $1 ORDER BY created_at ASC",
          [name]
        );
    return res.rows.map((r) => r.data);
  },

  async insert(name: string, row: any) {
    await pool.query(
      "INSERT INTO records (table_name, id, company_id, data) VALUES ($1, $2, $3, $4)",
      [name, row.id, row.companyId ?? null, JSON.stringify(row)]
    );
    return row;
  },

  async update(name: string, id: string, patch: Record<string, any>) {
    const existing = await pool.query(
      "SELECT data FROM records WHERE table_name = $1 AND id = $2",
      [name, id]
    );
    if (existing.rowCount === 0) return null;
    const merged = { ...existing.rows[0].data, ...patch };
    await pool.query(
      "UPDATE records SET data = $1, company_id = $2, updated_at = now() WHERE table_name = $3 AND id = $4",
      [JSON.stringify(merged), merged.companyId ?? null, name, id]
    );
    return merged;
  },

  async find(name: string, id: string) {
    const res = await pool.query(
      "SELECT data FROM records WHERE table_name = $1 AND id = $2",
      [name, id]
    );
    return res.rowCount ? res.rows[0].data : null;
  },

  async delete(name: string, id: string) {
    const res = await pool.query(
      "DELETE FROM records WHERE table_name = $1 AND id = $2",
      [name, id]
    );
    return (res.rowCount ?? 0) > 0;
  },

  async close() {
    await pool.end();
  },
};
