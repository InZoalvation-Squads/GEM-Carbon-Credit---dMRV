// REC ROI routes — registered under the bare /api/v1 prefix because paths span
// /rec-roi/…, /projects/:id/rec-roi-setting and /fx/eur-thb.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../../config.js';
import { actorFromRequest } from '../../lib/audit.js';
import { fetchEurThb } from '../../lib/bot-fx.js';
import { idParams } from '../../lib/validation.js';
import { getSettings, listProjectSettings, putProjectSetting, putSettings } from './service.js';

const price = z.number().positive().nullable();

// Mirrored client-side by validateRecRoiSettings (carbon-ready/src/lib/rec-roi.ts).
export const SettingsBody = z
  .object({
    price_low_thb: price,
    price_mid_thb: price,
    price_high_thb: price,
    price_source: z.string().trim().max(500),
    platform_fee_pct: z.number().min(0).lt(100).nullable(),
    eur_thb: z.number().positive().nullable(),
    eur_thb_source: z.string().trim().max(200),
    horizon_years: z.number().int().min(1).max(25),
  })
  .strict()
  .superRefine((b, ctx) => {
    const entered = [b.price_low_thb, b.price_mid_thb, b.price_high_thb].filter((p): p is number => p !== null);
    for (let i = 1; i < entered.length; i++) {
      if (entered[i]! < entered[i - 1]!) {
        ctx.addIssue({ code: 'custom', message: 'prices must be ordered low ≤ mid ≤ high', path: ['price_mid_thb'] });
        break;
      }
    }
    if (entered.length > 0 && b.price_source === '') {
      ctx.addIssue({ code: 'custom', message: 'price_source is required when a price is entered', path: ['price_source'] });
    }
  });

const ProjectSettingBody = z
  .object({
    issuance_type: z.enum(['Normal', 'Self consumption']),
    digital_meter_exempt: z.boolean(),
    investment_mthb: z.number().positive().nullable(),
  })
  .strict();

export async function recRoiRoutes(app: FastifyInstance): Promise<void> {
  // Prices and fees are commercial data: the verifier role has no access.
  const readers = [app.authenticate, app.requireRole('admin', 'esg_manager', 'project_owner')];
  const orgEditors = [app.authenticate, app.requireRole('admin', 'esg_manager')];

  app.get('/rec-roi/settings', { preHandler: readers }, async (req) => ({
    settings: await getSettings(app.prisma, req.user.org),
  }));

  app.put('/rec-roi/settings', { preHandler: orgEditors }, async (req) => {
    const body = SettingsBody.parse(req.body ?? {});
    return { settings: await putSettings(app.prisma, actorFromRequest(req), body) };
  });

  app.get('/rec-roi/project-settings', { preHandler: readers }, async (req) => ({
    project_settings: await listProjectSettings(app.prisma, req.user.org),
  }));

  app.put('/projects/:id/rec-roi-setting', { preHandler: readers }, async (req) => {
    const { id } = idParams.parse(req.params);
    const body = ProjectSettingBody.parse(req.body ?? {});
    return { project_setting: await putProjectSetting(app.prisma, actorFromRequest(req), id, body) };
  });

  app.get('/fx/eur-thb', { preHandler: orgEditors }, async () => fetchEurThb(config.BOT_API_TOKEN));
}
