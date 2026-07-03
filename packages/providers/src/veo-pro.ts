/**
 * Gemini Veo Pro (3.1 "Quality") provider — PRD §8
 * Same interface as VeoFlashProvider; points at the higher-quality model ID.
 */

import { VeoFlashProvider } from './veo-flash';

export class VeoProProvider extends VeoFlashProvider {
  readonly id = 'gemini_veo_pro' as const;

  constructor(apiKey: string = process.env.GEMINI_API_KEY ?? '') {
    super(apiKey, process.env.VEO_PRO_MODEL ?? 'veo-3.1-pro-generate-preview');
  }
}