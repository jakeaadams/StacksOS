import { query, querySingle, withTransaction } from "@/lib/db/evergreen";
import { logger } from "@/lib/logger";
import { assertLibrarySchemaExists } from "@/lib/db/library-schema";

export type NotificationChannel = "email" | "sms";
export type NotificationTemplateStatus = "active" | "inactive";
export type DeliveryStatus = "pending" | "sent" | "failed";

let tablesReady = false;

export async function ensureNotificationTables(): Promise<void> {
  if (tablesReady) return;

  await withTransaction(async (client) => {
    await assertLibrarySchemaExists(client);

    await client.query(`
      CREATE TABLE IF NOT EXISTS library.notification_templates (
        id SERIAL PRIMARY KEY,
        channel TEXT NOT NULL,
        notice_type TEXT NOT NULL,
        subject_template TEXT,
        body_template TEXT NOT NULL,
        body_text_template TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        created_by INTEGER,
        status TEXT NOT NULL DEFAULT 'inactive'
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_notification_templates_lookup
      ON library.notification_templates(channel, notice_type, status, id)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS library.notification_events (
        id TEXT PRIMARY KEY,
        channel TEXT NOT NULL,
        notice_type TEXT NOT NULL,
        patron_id INTEGER,
        recipient TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        created_by INTEGER,
        context JSONB
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_notification_events_created_at
      ON library.notification_events(created_at)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS library.notification_deliveries (
        id SERIAL PRIMARY KEY,
        event_id TEXT NOT NULL references library.notification_events(id) on delete cascade,
        provider TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        last_attempt_at TIMESTAMP,
        sent_at TIMESTAMP
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status
      ON library.notification_deliveries(status, id)
    `);
  });

  tablesReady = true;
  logger.info({ component: "notifications" }, "Notification tables ready");
}

export interface NotificationTemplateRow {
  id: number;
  channel: NotificationChannel;
  notice_type: string;
  subject_template: string | null;
  body_template: string;
  body_text_template: string | null;
  created_at: string;
  created_by: number | null;
  status: NotificationTemplateStatus;
}

export async function listTemplates(channel: NotificationChannel, noticeType?: string) {
  await ensureNotificationTables();
  const rows = await query<NotificationTemplateRow>(
    `
      select id, channel, notice_type, subject_template, body_template, body_text_template, created_at, created_by, status
      from library.notification_templates
      where channel = $1
        and ($2::text is null or notice_type = $2)
      order by notice_type asc, id desc
    `,
    [channel, noticeType ?? null]
  );
  return rows;
}

export async function getActiveTemplate(channel: NotificationChannel, noticeType: string) {
  await ensureNotificationTables();
  return await querySingle<NotificationTemplateRow>(
    `
      select id, channel, notice_type, subject_template, body_template, body_text_template, created_at, created_by, status
      from library.notification_templates
      where channel = $1 and notice_type = $2 and status = 'active'
      order by id desc
      limit 1
    `,
    [channel, noticeType]
  );
}

export async function createTemplateVersion(args: {
  channel: NotificationChannel;
  noticeType: string;
  subjectTemplate?: string | null;
  bodyTemplate: string;
  bodyTextTemplate?: string | null;
  createdBy?: number | null;
  activate?: boolean;
}) {
  await ensureNotificationTables();
  const {
    channel,
    noticeType,
    subjectTemplate = null,
    bodyTemplate,
    bodyTextTemplate = null,
    createdBy = null,
    activate = false,
  } = args;

  return await withTransaction(async (client) => {
    if (activate) {
      await client.query(
        `update library.notification_templates set status = 'inactive' where channel = $1 and notice_type = $2 and status = 'active'`,
        [channel, noticeType]
      );
    }
    const res = await client.query(
      `
        insert into library.notification_templates
          (channel, notice_type, subject_template, body_template, body_text_template, created_by, status)
        values ($1, $2, $3, $4, $5, $6, $7)
        returning id
      `,
      [channel, noticeType, subjectTemplate, bodyTemplate, bodyTextTemplate, createdBy, activate ? "active" : "inactive"]
    );
    return res.rows[0]?.id as number;
  });
}

export async function activateTemplate(channel: NotificationChannel, templateId: number) {
  await ensureNotificationTables();
  return await withTransaction(async (client) => {
    const row = await client.query(
      `select id, channel, notice_type from library.notification_templates where id = $1`,
      [templateId]
    );
    const t = row.rows[0];
    if (!t) return null;
    if (t.channel !== channel) return null;

    await client.query(
      `update library.notification_templates set status = 'inactive' where channel = $1 and notice_type = $2 and status = 'active'`,
      [channel, t.notice_type]
    );
    await client.query(`update library.notification_templates set status = 'active' where id = $1`, [templateId]);
    return { noticeType: t.notice_type as string };
  });
}

export async function createNotificationEvent(args: {
  id: string;
  channel: NotificationChannel;
  noticeType: string;
  patronId?: number | null;
  recipient?: string | null;
  createdBy?: number | null;
  context?: any;
}) {
  await ensureNotificationTables();
  const { id, channel, noticeType, patronId = null, recipient = null, createdBy = null, context = null } = args;
  await query(
    `
      insert into library.notification_events (id, channel, notice_type, patron_id, recipient, created_by, context)
      values ($1, $2, $3, $4, $5, $6, $7::jsonb)
    `,
    [id, channel, noticeType, patronId, recipient, createdBy, context ? JSON.stringify(context) : null]
  );
}

export async function createDelivery(args: { eventId: string; provider: string }) {
  await ensureNotificationTables();
  const { eventId, provider } = args;
  const res = await querySingle<{ id: number }>(
    `
      insert into library.notification_deliveries (event_id, provider, status)
      values ($1, $2, 'pending')
      returning id
    `,
    [eventId, provider]
  );
  return res?.id ?? null;
}

export async function markDeliveryAttempt(args: {
  deliveryId: number;
  status: DeliveryStatus;
  error?: string | null;
}) {
  await ensureNotificationTables();
  const { deliveryId, status, error = null } = args;
  await query(
    `
      update library.notification_deliveries
      set
        attempts = attempts + 1,
        last_attempt_at = now(),
        status = $2,
        last_error = $3,
        sent_at = case when $2 = 'sent' then now() else sent_at end
      where id = $1
    `,
    [deliveryId, status, error]
  );
}

export async function listDeliveries(limit: number = 200) {
  await ensureNotificationTables();
  const rows = await query<any>(
    `
      select d.id, d.event_id, d.provider, d.status, d.attempts, d.last_error, d.created_at, d.last_attempt_at, d.sent_at,
             e.channel, e.notice_type, e.patron_id, e.recipient, e.created_by
      from library.notification_deliveries d
      join library.notification_events e on e.id = d.event_id
      order by d.id desc
      limit $1
    `,
    [limit]
  );
  return rows;
}
