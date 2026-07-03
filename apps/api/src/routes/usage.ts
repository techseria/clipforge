/**
 * Usage / quota routes — PRD §6.1, §12.2
 * - GET /api/v1/usage
 *   Returns current user's daily quota usage for each provider
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/require-auth';
import { getQuota } from '@clipforge/shared/quota';
import { listProviders } from '@clipforge/providers';

export const usageRouter = Router();
usageRouter.use(requireAuth);

usageRouter.get('/', async (req, res, next) => {
  try {
    const usage = await Promise.all(
      listProviders().map(async (provider) => {
        const { remaining, limit } = await getQuota(req.user!.id, provider);
        return { provider, remaining, limit, used: limit - remaining };
      })
    );
    res.json({ usage });
  } catch (err) {
    next(err);
  }
});