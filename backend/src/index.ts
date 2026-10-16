import "dotenv/config";
import { app } from "./app.js";
import { ensureSchema } from "./lib/db.js";

const PORT = process.env.PORT ? Number(process.env.PORT) : 4001;

ensureSchema()
  .then(() => {
    app.listen(PORT, () => console.log(`Roost backend listening on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("Failed to connect to Postgres / prepare schema:", err);
    process.exit(1);
  });
