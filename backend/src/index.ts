import "dotenv/config";
import express from "express";
import cors from "cors";
import { ensureSchema } from "./lib/db.js";
import { authRouter } from "./routes/auth.js";
import { employeesRouter } from "./routes/employees.js";
import { payrollRouter } from "./routes/payroll.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, service: "roost-backend" }));

app.use("/api/auth", authRouter);
app.use("/api/employees", employeesRouter);
app.use("/api/payroll", payrollRouter);

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

const PORT = process.env.PORT ? Number(process.env.PORT) : 4001;

ensureSchema()
  .then(() => {
    app.listen(PORT, () => console.log(`Roost backend listening on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("Failed to connect to Postgres / prepare schema:", err);
    process.exit(1);
  });
