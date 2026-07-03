/**
 * ClipForge — Drizzle ORM schema
 * Source: ClipForge_PRD.md §10 Data Model
 *
 * Tables: users, sessions, projects, scenes, generations, merges,
 *         usage_counters, audit_log
 */

import {
  pgTable,
  serial,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ─── Enums ───────────────────────────────────────────────────────────────

export const projectStatusEnum = pgEnum('project_status', [
  'draft',
  'generating',
  'ready_to_merge',
  'exported',
]);

export const sceneStatusEnum = pgEnum('scene_status', [
  'not_generated',
  'queued',
  'generating',
  'ready',
  'failed',
]);

export const generationStatusEnum = pgEnum('generation_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
  'canceled',
]);

export const mergeStatusEnum = pgEnum('merge_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
]);

export const providerEnum = pgEnum('provider', [
  'gemini_veo_pro',
  'gemini_veo_flash',
  'minimax_hailuo_2_3',
]);

// ─── Users ───────────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 320 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    displayName: varchar('display_name', { length: 120 }),
    isAdmin: boolean('is_admin').default(false).notNull(),
    role: varchar('role', { length: 16 }).default('editor').notNull(), // T5.6: 'admin' | 'editor' | 'viewer'
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    emailIdx: uniqueIndex('users_email_idx').on(t.email),
  })
);

// ─── Sessions (server-side, httpOnly cookie reference) ──────────────────

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  userAgent: text('user_agent'),
  ipAddress: varchar('ip_address', { length: 64 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Projects ────────────────────────────────────────────────────────────

export const projects = pgTable(
  'projects',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    globalStylePrompt: text('global_style_prompt').notNull().default(''),
    status: projectStatusEnum('status').notNull().default('draft'),
    thumbnailClipId: integer('thumbnail_clip_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index('projects_user_idx').on(t.userId),
    updatedIdx: index('projects_updated_idx').on(t.updatedAt),
  })
);

// ─── Scenes ──────────────────────────────────────────────────────────────

export const scenes = pgTable(
  'scenes',
  {
    id: serial('id').primaryKey(),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    prompt: text('prompt').notNull(),
    defaultModel: providerEnum('default_model').notNull().default('gemini_veo_flash'),
    selectedGenerationId: integer('selected_generation_id'),
    status: sceneStatusEnum('status').notNull().default('not_generated'),
    referenceImageUrl: text('reference_image_url'),
    aspectRatio: varchar('aspect_ratio', { length: 16 }).default('16:9'),
    promptOptimizerEnabled: boolean('prompt_optimizer_enabled').default(true).notNull(),
    watermarkEnabled: boolean('watermark_enabled').default(true).notNull(),
    includeAudio: boolean('include_audio').default(false).notNull(),
    transitionToNext: varchar('transition_to_next', { length: 32 }).default('cut'), // 'cut' | 'fade_black' | 'crossfade_05' | 'crossfade_1'
    transitionSeconds: integer('transition_seconds'),
    subjectReferenceId: integer('subject_reference_id'), // T5.5: ID of generation whose first frame to reuse
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    projectIdx: index('scenes_project_idx').on(t.projectId),
    projectPosIdx: uniqueIndex('scenes_project_position_idx').on(t.projectId, t.position),
  })
);

// ─── Generations (one per attempt; never overwrite) ──────────────────────

export const generations = pgTable(
  'generations',
  {
    id: serial('id').primaryKey(),
    sceneId: integer('scene_id')
      .notNull()
      .references(() => scenes.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: providerEnum('provider').notNull(),
    providerJobId: varchar('provider_job_id', { length: 200 }),
    prompt: text('prompt').notNull(),
    referenceImageUrl: text('reference_image_url'),
    status: generationStatusEnum('status').notNull().default('queued'),
    resultUrl: text('result_url'), // object-storage path
    thumbnailUrl: text('thumbnail_url'),
    durationSeconds: integer('duration_seconds'),
    errorCode: varchar('error_code', { length: 64 }),
    errorMessage: text('error_message'),
    estimatedCostUsd: integer('estimated_cost_usd'), // store as micro-cents
    countedAgainstQuota: boolean('counted_against_quota').default(true).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sceneIdx: index('generations_scene_idx').on(t.sceneId),
    userIdx: index('generations_user_idx').on(t.userId),
    providerJobIdx: index('generations_provider_job_idx').on(t.providerJobId),
    statusIdx: index('generations_status_idx').on(t.status),
  })
);

// ─── Merges ──────────────────────────────────────────────────────────────

export const merges = pgTable(
  'merges',
  {
    id: serial('id').primaryKey(),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    selectedGenerationIds: jsonb('selected_generation_ids').$type<number[]>().notNull(),
    totalDurationSeconds: integer('total_duration_seconds').notNull(),
    status: mergeStatusEnum('status').notNull().default('queued'),
    resultUrl: text('result_url'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => ({
    projectIdx: index('merges_project_idx').on(t.projectId),
    userIdx: index('merges_user_idx').on(t.userId),
  })
);

// ─── Usage Counters (per user / model / UTC day) ─────────────────────────

export const usageCounters = pgTable(
  'usage_counters',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: providerEnum('provider').notNull(),
    usageDate: varchar('usage_date', { length: 10 }).notNull(), // YYYY-MM-DD (UTC)
    countUsed: integer('count_used').notNull().default(0),
    dailyLimit: integer('daily_limit').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqCounter: uniqueIndex('usage_counters_user_provider_date_idx').on(
      t.userId,
      t.provider,
      t.usageDate
    ),
  })
);

// ─── Music Library (T5.2) ───────────────────────────────────────────────

export const musicTracks = pgTable(
  'music_tracks',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    artist: varchar('artist', { length: 200 }),
    objectKey: text('object_key').notNull(),
    durationSeconds: integer('duration_seconds').notNull(),
    isBuiltIn: boolean('is_built_in').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index('music_user_idx').on(t.userId),
  })
);

// ─── Captions (T5.3) ─────────────────────────────────────────────────────

export const captionSegments = pgTable(
  'caption_segments',
  {
    id: serial('id').primaryKey(),
    generationId: integer('generation_id')
      .notNull()
      .references(() => generations.id, { onDelete: 'cascade' }),
    startMs: integer('start_ms').notNull(),
    endMs: integer('end_ms').notNull(),
    text: text('text').notNull(),
  },
  (t) => ({
    genIdx: index('caption_gen_idx').on(t.generationId),
  })
);

// ─── Analytics Events (T5.7) ─────────────────────────────────────────────

export const analyticsDaily = pgTable(
  'analytics_daily',
  {
    id: serial('id').primaryKey(),
    metricDate: varchar('metric_date', { length: 10 }).notNull(), // YYYY-MM-DD
    provider: providerEnum('provider'),
    eventType: varchar('event_type', { length: 32 }).notNull(), // 'generation.succeeded' | 'generation.failed' | 'merge.succeeded' | etc
    count: integer('count').notNull().default(1),
    spendMicros: integer('spend_micros').notNull().default(0),
  },
  (t) => ({
    uniqDaily: uniqueIndex('analytics_daily_uniq').on(t.metricDate, t.provider, t.eventType),
  })
);

// ─── Audit Log ───────────────────────────────────────────────────────────

export const auditLog = pgTable(
  'audit_log',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: varchar('action', { length: 64 }).notNull(),
    entityType: varchar('entity_type', { length: 64 }),
    entityId: integer('entity_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ipAddress: varchar('ip_address', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index('audit_user_idx').on(t.userId),
    actionIdx: index('audit_action_idx').on(t.action),
  })
);

// ─── Provider Config (admin-editable; addresses §19 risk) ────────────────

export const providerConfig = pgTable('provider_config', {
  provider: providerEnum('provider').primaryKey(),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  description: text('description'),
  costIndicator: varchar('cost_indicator', { length: 8 }), // '$', '$$', '$$$'
  modelId: varchar('model_id', { length: 200 }).notNull(),
  endpoint: text('endpoint'),
  dailyLimit: integer('daily_limit').notNull(),
  isHardCap: boolean('is_hard_cap').default(false).notNull(),
  isEnabled: boolean('is_enabled').default(true).notNull(),
  config: jsonb('config').$type<Record<string, unknown>>(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Relations ───────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
  sessions: many(sessions),
  generations: many(generations),
  merges: many(merges),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, { fields: [projects.userId], references: [users.id] }),
  scenes: many(scenes),
  merges: many(merges),
}));

export const scenesRelations = relations(scenes, ({ one, many }) => ({
  project: one(projects, { fields: [scenes.projectId], references: [projects.id] }),
  generations: many(generations),
  selectedGeneration: one(generations, {
    fields: [scenes.selectedGenerationId],
    references: [generations.id],
  }),
}));

export const generationsRelations = relations(generations, ({ one }) => ({
  scene: one(scenes, { fields: [generations.sceneId], references: [scenes.id] }),
  user: one(users, { fields: [generations.userId], references: [users.id] }),
}));

export const mergesRelations = relations(merges, ({ one }) => ({
  project: one(projects, { fields: [merges.projectId], references: [projects.id] }),
  user: one(users, { fields: [merges.userId], references: [users.id] }),
}));