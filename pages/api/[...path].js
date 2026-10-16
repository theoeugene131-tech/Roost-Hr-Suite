import { app } from "../../backend/dist/app.js";
import { ensureSchema } from "../../backend/dist/lib/db.js";

let schemaReady;

export default async function handler(req, res) {
  try {
    schemaReady ||= ensureSchema();
    await schemaReady;
  } catch (error) {
    schemaReady = undefined;
    console.error("Roost API database initialization failed:", error);
    return res.status(503).json({ error: "Cloud database is not configured or is unavailable" });
  }

  return app(req, res);
}
