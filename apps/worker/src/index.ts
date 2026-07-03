/**
 * Worker entry point — boots all BullMQ workers.
 */

import 'dotenv/config';
import { logger } from './logger';
import { generationWorker } from './generation-worker';
import { mergeWorker } from './merge-worker';
import { captionsWorker } from './captions-worker';

logger.info('ClipForge worker booting...');

generationWorker.on('ready', () => logger.info('generation worker ready'));
mergeWorker.on('ready', () => logger.info('merge worker ready'));
captionsWorker.on('ready', () => logger.info('captions worker ready'));

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'shutting down workers');
  await Promise.all([generationWorker.close(), mergeWorker.close(), captionsWorker.close()]);
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));