import { Router } from "express";
import { z } from "zod";
import { db } from "../lib/db.js";
import { requireAuth, requireAdmin, AuthedRequest } from "../middleware/requireAuth.js";

export const companySettingsRouter = Router();
companySettingsRouter.use(requireAuth);

const defaults: Record<string, any> = {
  NG: { country: "NG", currency: "NGN", locale: "en-NG", timezone: "Africa/Lagos" },
  US: { country: "US", currency: "USD", locale: "en-US", timezone: "America/New_York" },
  GB: { country: "GB", currency: "GBP", locale: "en-GB", timezone: "Europe/London" },
};

const settingsSchema = z.object({
  companyName: z.string().trim().min(2).max(160),
  country: z.enum(["NG", "US", "GB"]),
  region: z.string().max(100).optional().default(""),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  locale: z.string().min(2).max(20).optional(),
  timezone: z.string().min(3).max(80).optional(),
  workWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional().default([1, 2, 3, 4, 5]),
  financialYearStartMonth: z.number().int().min(1).max(12).optional().default(1),
  leavePolicies: z.record(z.number().min(0).max(365)).optional().default({}),
});

companySettingsRouter.get("/", async (req: AuthedRequest, res) => {
  const companyId = req.auth!.companyId;
  const [saved, company] = await Promise.all([
    db.findForCompany("companySettings", companyId, companyId),
    db.find("companies", companyId),
  ]);
  res.json({
    ...(saved || {
    id: companyId,
    companyId,
    ...defaults.NG,
    region: "",
    workWeek: [1, 2, 3, 4, 5],
    financialYearStartMonth: 1,
    leavePolicies: {},
    }),
    companyName: company?.name || saved?.companyName || "",
  });
});

companySettingsRouter.put("/", requireAdmin, async (req: AuthedRequest, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const companyId = req.auth!.companyId;
  const selected = defaults[parsed.data.country];
  await db.update("companies", companyId, { name: parsed.data.companyName });
  const settings = {
    id: companyId,
    companyId,
    ...parsed.data,
    currency: parsed.data.currency || selected.currency,
    locale: parsed.data.locale || selected.locale,
    timezone: parsed.data.timezone || selected.timezone,
    updatedAt: new Date().toISOString(),
  };
  const existing = await db.findForCompany("companySettings", companyId, companyId);
  const saved = existing
    ? await db.updateForCompany("companySettings", companyId, companyId, settings)
    : await db.insert("companySettings", settings);
  res.json(saved);
});
