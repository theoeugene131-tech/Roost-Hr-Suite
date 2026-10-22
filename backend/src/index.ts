import "dotenv/config";
import express from "express";
import cors from "cors";
import { ensureSchema } from "./lib/db.js";
import { authRouter } from "./routes/auth.js";
import { employeesRouter } from "./routes/employees.js";
import { payrollRouter } from "./routes/payroll.js";
import { companySettingsRouter } from "./routes/companySettings.js";

const app = express();
const allowedOrigins = (process.env.CORS_ORIGINS || process.env.APP_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || process.env.NODE_ENV !== "production") return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed by CORS"));
  },
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, service: "roost-backend" }));
app.use("/api/auth", authRouter);
app.use("/api/company-settings", companySettingsRouter);
app.use("/api/employees", employeesRouter);
app.use("/api/payroll", payrollRouter);
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

const PORT = process.env.PORT ? Number(process.env.PORT) : 4001;

ensureSchema()
  .then(() => {
    app.listen(PORT, () => console.log(`Roost backend listening on port ${PORT}`));
  })
  .catch((err) => {
    console.error("Failed to connect to Postgres / prepare schema:", err);
    process.exit(1);
  });
