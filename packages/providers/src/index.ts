/**
 * Provider registry — returns a provider by id, lazy-initialised.
 */

import type { ProviderId } from '@clipforge/shared';
import type { VideoProvider } from './types';
import { VeoFlashProvider } from './veo-flash';
import { VeoProProvider } from './veo-pro';
import { HailuoProvider } from './hailuo';

export * from './types';

const providers = new Map<ProviderId, VideoProvider>();

export function getProvider(id: ProviderId): VideoProvider {
  let p = providers.get(id);
  if (p) return p;

  switch (id) {
    case 'gemini_veo_flash':
      p = new VeoFlashProvider();
      break;
    case 'gemini_veo_pro':
      p = new VeoProProvider();
      break;
    case 'minimax_hailuo_2_3':
      p = new HailuoProvider();
      break;
  }
  providers.set(id, p);
  return p;
}

export function listProviders(): ProviderId[] {
  return ['gemini_veo_pro', 'gemini_veo_flash', 'minimax_hailuo_2_3'];
}