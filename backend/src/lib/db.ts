import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ...(process.env.NODE_ENV === "production" ? { ssl: { rejectUnauthorized: false } } : {}),
});

export async function ensureSchema() {
  if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be configured in production");
  }
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
  await pool.query("CREATE INDEX IF NOT EXISTS idx_records_table_company ON records (table_name, company_id);");
}

export const db = {
  async table(name: string, companyId?: string): Promise<any[]> {
    const res = companyId
      ? await pool.query("SELECT data FROM records WHERE table_name = $1 AND company_id = $2 ORDER BY created_at ASC", [name, companyId])
      : await pool.query("SELECT data FROM records WHERE table_name = $1 ORDER BY created_at ASC", [name]);
    return res.rows.map((r) => r.data);
  },

  async insert(name: string, row: any) {
    await pool.query(
      "INSERT INTO records (table_name, id, company_id, data) VALUES ($1, $2, $3, $4)",
      [name, row.id, row.companyId ?? null, JSON.stringify(row)]
    );
    return row;
  },

  // Prefer scoped methods for company-owned records. The database predicate is
  // part of the read/write, rather than relying only on route-level checks.
  async findForCompany(name: string, id: string, companyId: string) {
    const res = await pool.query(
      "SELECT data FROM records WHERE table_name = $1 AND id = $2 AND company_id = $3",
      [name, id, companyId]
    );
    return res.rowCount ? res.rows[0].data : null;
  },

  async updateForCompany(name: string, id: string, companyId: string, patch: Record<string, any>) {
    const existing = await pool.query(
      "SELECT data FROM records WHERE table_name = $1 AND id = $2 AND company_id = $3",
      [name, id, companyId]
    );
    if (existing.rowCount === 0) return null;
    const merged = { ...existing.rows[0].data, ...patch, companyId };
    const updated = await pool.query(
      "UPDATE records SET data = $1, updated_at = now() WHERE table_name = $2 AND id = $3 AND company_id = $4 RETURNING data",
      [JSON.stringify(merged), name, id, companyId]
    );
    return updated.rowCount ? updated.rows[0].data : null;
  },

  async deleteForCompany(name: string, id: string, companyId: string) {
    const res = await pool.query(
      "DELETE FROM records WHERE table_name = $1 AND id = $2 AND company_id = $3",
      [name, id, companyId]
    );
    return (res.rowCount ?? 0) > 0;
  },

  // Unscoped operations are retained only for deliberate global lookups, such
  // as email login and one-time invitation tokens.
  async update(name: string, id: string, patch: Record<string, any>) {
    const existing = await pool.query("SELECT data FROM records WHERE table_name = $1 AND id = $2", [name, id]);
    if (existing.rowCount === 0) return null;
    const merged = { ...existing.rows[0].data, ...patch };
    await pool.query(
      "UPDATE records SET data = $1, company_id = $2, updated_at = now() WHERE table_name = $3 AND id = $4",
      [JSON.stringify(merged), merged.companyId ?? null, name, id]
    );
    return merged;
  },

  async find(name: string, id: string) {
    const res = await pool.query("SELECT data FROM records WHERE table_name = $1 AND id = $2", [name, id]);
    return res.rowCount ? res.rows[0].data : null;
  },

  async delete(name: string, id: string) {
    const res = await pool.query("DELETE FROM records WHERE table_name = $1 AND id = $2", [name, id]);
    return (res.rowCount ?? 0) > 0;
  },

  async close() {
    await pool.end();
  },
};
