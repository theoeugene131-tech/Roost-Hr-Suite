import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { employeesRouter } from "./routes/employees.js";
import { payrollRouter } from "./routes/payroll.js";

export const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, service: "roost-backend" }));
app.get("/api/health", (_req, res) => res.json({ ok: true, service: "roost-backend" }));

app.use("/api/auth", authRouter);
app.use("/api/employees", employeesRouter);
app.use("/api/payroll", payrollRouter);

app.use((_req, res) => res.status(404).json({ error: "Not found" }));
