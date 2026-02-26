import crypto from "crypto";
import { query, querySingle } from "@/lib/db/evergreen";
import { logger } from "@/lib/logger";

export const DEVELOPER_EVENT_TYPES = [
  "circulation.checkout.created",
  "circulation.checkin.completed",
  "holds.request.created",
  "patron.created",
  "k12.checkout.created",
  "k12.return.processed",
  "ai.ops.playbook.generated",
  "ai.staff.copilot.generated",
  "ai.holds.copilot.generated",
  "ai.patron.copilot.generated",
  "ai.acquisitions.copilot.generated",
  "ai.cataloging.copilot.generated",
  "ai.admin.copilot.generated",
  "system.webhook.test",
] as const;

export type DeveloperEventType = (typeof DEVELOPER_EVENT_TYPES)[number];

export interface WebhookSubscription {
  id: number;
  tenantId: string;
  name: string;
  endpointUrl: string;
  events: string[];
  active: boolean;
  lastTestedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: number | null;
  updatedBy: number | null;
  hasSecret: boolean;
  secretPreview: string;
}

export interface WebhookDelivery {
  id: number;
  subscriptionId: number;
  eventType: string;
  deliveryId: string;
  status: "delivered" | "failed";
  statusCode: number | null;
  latencyMs: number | null;
  responseBody: string | null;
  createdAt: string;
  deliveredAt: string | null;
}

type SubscriptionRow = {
  id: number;
  tenant_id: string;
  name: string;
  endpoint_url: string;
  secret: string;
  events: string[] | null;
  active: boolean;
  last_tested_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
};

type DeliveryRow = {
  id: number;
  subscription_id: number;
  event_type: string;
  delivery_id: string;
  status: "delivered" | "failed";
  status_code: number | null;
  latency_ms: number | null;
  response_body: string | null;
  created_at: string;
  delivered_at: string | null;
};

function normalizeTenantId(tenantId?: string | null): string {
  const normalized = String(tenantId || "default")
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(normalized)) {
    throw new Error("Invalid tenant id");
  }
  return normalized;
}

function normalizeEvents(events: string[]): string[] {
  const unique = new Set<string>();
  for (const event of events) {
    const value = String(event || "").trim();
    if (!value) continue;
    if (value === "*") {
      unique.add("*");
      continue;
    }
    if (!(DEVELOPER_EVENT_TYPES as readonly string[]).includes(value)) {
      throw new Error(`Unsupported webhook event: ${value}`);
    }
    unique.add(value);
  }
  if (unique.size === 0) {
    throw new Error("At least one webhook event is required");
  }
  return [...unique.values()].sort();
}

function normalizeEndpointUrl(url: string): string {
  const normalized = String(url || "").trim();
  if (!/^https?:\/\//i.test(normalized)) {
    throw new Error("Webhook endpoint must start with http:// or https://");
  }
  return normalized;
}

function normalizeName(name: string): string {
  const normalized = String(name || "").trim();
  if (!normalized) throw new Error("Webhook name is required");
  if (normalized.length > 128) throw new Error("Webhook name must be 128 characters or less");
  return normalized;
}

function makeSecretPreview(secret: string): string {
  const trimmed = String(secret || "").trim();
  if (!trimmed) return "";
  if (trimmed.length <= 8) return `${trimmed.slice(0, 2)}***`;
  return `${trimmed.slice(0, 4)}***${trimmed.slice(-4)}`;
}

function mapSubscription(row: SubscriptionRow): WebhookSubscription {
  const secret = String(row.secret || "");
  return {
    id: Number(row.id),
    tenantId: row.tenant_id,
    name: row.name,
    endpointUrl: row.endpoint_url,
    events: Array.isArray(row.events) ? row.events : [],
    active: Boolean(row.active),
    lastTestedAt: row.last_tested_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    hasSecret: secret.length > 0,
    secretPreview: makeSecretPreview(secret),
  };
}

function mapDelivery(row: DeliveryRow): WebhookDelivery {
  return {
    id: Number(row.id),
    subscriptionId: Number(row.subscription_id),
    eventType: row.event_type,
    deliveryId: row.delivery_id,
    status: row.status,
    statusCode: row.status_code,
    latencyMs: row.latency_ms,
    responseBody: row.response_body,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
  };
}

function generateSecret(): string {
  return crypto.randomBytes(24).toString("hex");
}

function buildSignature(secret: string, body: string): string {
  const digest = crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");
  return `sha256=${digest}`;
}

function safeResponseText(value: string | null): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value);
  return normalized.length > 2000 ? `${normalized.slice(0, 2000)}...` : normalized;
}

export async function listWebhookSubscriptions(
  tenantId?: string | null
): Promise<WebhookSubscription[]> {
  const tenant = normalizeTenantId(tenantId);
  const rows = await query<SubscriptionRow>(
    `
      SELECT
        id,
        tenant_id,
        name,
        endpoint_url,
        secret,
        events,
        active,
        last_tested_at,
        created_at,
        updated_at,
        created_by,
        updated_by
      FROM library.webhook_subscriptions
      WHERE lower(tenant_id) = lower($1)
      ORDER BY lower(name), id DESC
    `,
    [tenant]
  );
  return rows.map(mapSubscription);
}

export async function createWebhookSubscription(args: {
  tenantId?: string | null;
  name: string;
  endpointUrl: string;
  events: string[];
  active?: boolean;
  secret?: string | null;
  actorId?: number | null;
}): Promise<WebhookSubscription> {
  const tenant = normalizeTenantId(args.tenantId);
  const name = normalizeName(args.name);
  const endpointUrl = normalizeEndpointUrl(args.endpointUrl);
  const events = normalizeEvents(args.events);
  const secret = String(args.secret || "").trim() || generateSecret();

  const row = await querySingle<SubscriptionRow>(
    `
      INSERT INTO library.webhook_subscriptions (
        tenant_id,
        name,
        endpoint_url,
        secret,
        events,
        active,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5::text[], $6, $7, $7, NOW(), NOW())
      RETURNING
        id,
        tenant_id,
        name,
        endpoint_url,
        secret,
        events,
        active,
        last_tested_at,
        created_at,
        updated_at,
        created_by,
        updated_by
    `,
    [tenant, name, endpointUrl, secret, events, args.active !== false, args.actorId ?? null]
  );

  if (!row) throw new Error("Failed to create webhook subscription");
  return mapSubscription(row);
}

export async function updateWebhookSubscription(args: {
  id: number;
  tenantId?: string | null;
  name?: string;
  endpointUrl?: string;
  events?: string[];
  active?: boolean;
  secret?: string | null;
  actorId?: number | null;
}): Promise<WebhookSubscription | null> {
  const id = Math.trunc(args.id);
  if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid webhook id");
  const tenant = normalizeTenantId(args.tenantId);

  const existing = await querySingle<SubscriptionRow>(
    `
      SELECT
        id,
        tenant_id,
        name,
        endpoint_url,
        secret,
        events,
        active,
        last_tested_at,
        created_at,
        updated_at,
        created_by,
        updated_by
      FROM library.webhook_subscriptions
      WHERE id = $1
        AND lower(tenant_id) = lower($2)
      LIMIT 1
    `,
    [id, tenant]
  );
  if (!existing) return null;

  const name = args.name !== undefined ? normalizeName(args.name) : existing.name;
  const endpointUrl =
    args.endpointUrl !== undefined ? normalizeEndpointUrl(args.endpointUrl) : existing.endpoint_url;
  const events = args.events !== undefined ? normalizeEvents(args.events) : existing.events || [];
  const secret =
    args.secret !== undefined
      ? String(args.secret || "").trim() || generateSecret()
      : existing.secret;
  const active = args.active !== undefined ? args.active : Boolean(existing.active);

  const updated = await querySingle<SubscriptionRow>(
    `
      UPDATE library.webhook_subscriptions
      SET
        name = $3,
        endpoint_url = $4,
        events = $5::text[],
        active = $6,
        secret = $7,
        updated_at = NOW(),
        updated_by = $8
      WHERE id = $1
        AND lower(tenant_id) = lower($2)
      RETURNING
        id,
        tenant_id,
        name,
        endpoint_url,
        secret,
        events,
        active,
        last_tested_at,
        created_at,
        updated_at,
        created_by,
        updated_by
    `,
    [id, tenant, name, endpointUrl, events, active, secret, args.actorId ?? null]
  );
  return updated ? mapSubscription(updated) : null;
}

export async function deleteWebhookSubscription(args: {
  id: number;
  tenantId?: string | null;
}): Promise<boolean> {
  const id = Math.trunc(args.id);
  if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid webhook id");
  const tenant = normalizeTenantId(args.tenantId);

  const row = await querySingle<{ id: number }>(
    `
      DELETE FROM library.webhook_subscriptions
      WHERE id = $1
        AND lower(tenant_id) = lower($2)
      RETURNING id
    `,
    [id, tenant]
  );
  return Boolean(row?.id);
}

export async function listWebhookDeliveries(args: {
  tenantId?: string | null;
  limit?: number;
}): Promise<WebhookDelivery[]> {
  const tenant = normalizeTenantId(args.tenantId);
  const limit = Math.max(1, Math.min(Math.trunc(args.limit || 50), 500));
  const rows = await query<DeliveryRow>(
    `
      SELECT
        d.id,
        d.subscription_id,
        d.event_type,
        d.delivery_id,
        d.status,
        d.status_code,
        d.latency_ms,
        d.response_body,
        d.created_at,
        d.delivered_at
      FROM library.webhook_deliveries d
      JOIN library.webhook_subscriptions s ON s.id = d.subscription_id
      WHERE lower(s.tenant_id) = lower($1)
      ORDER BY d.id DESC
      LIMIT $2
    `,
    [tenant, limit]
  );
  return rows.map(mapDelivery);
}

async function markWebhookTested(id: number): Promise<void> {
  await query(
    `
      UPDATE library.webhook_subscriptions
      SET last_tested_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `,
    [id]
  );
}

async function recordDelivery(args: {
  subscriptionId: number;
  eventType: string;
  deliveryId: string;
  status: "delivered" | "failed";
  statusCode: number | null;
  latencyMs: number | null;
  requestBody: Record<string, any>;
  responseBody: string | null;
}): Promise<void> {
  await query(
    `
      INSERT INTO library.webhook_deliveries (
        subscription_id,
        event_type,
        delivery_id,
        status,
        status_code,
        latency_ms,
        request_body,
        response_body,
        created_at,
        delivered_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, NOW(), CASE WHEN $4 = 'delivered' THEN NOW() ELSE NULL END)
    `,
    [
      args.subscriptionId,
      args.eventType,
      args.deliveryId,
      args.status,
      args.statusCode,
      args.latencyMs,
      JSON.stringify(args.requestBody),
      safeResponseText(args.responseBody),
    ]
  );
}

type PublishArgs = {
  tenantId?: string | null;
  eventType: DeveloperEventType;
  payload: Record<string, any>;
  actorId?: number | null;
  requestId?: string | null;
};

export async function publishDeveloperEvent(args: PublishArgs): Promise<{
  attempted: number;
  delivered: number;
}> {
  const tenant = normalizeTenantId(args.tenantId);
  const rows = await query<SubscriptionRow>(
    `
      SELECT
        id,
        tenant_id,
        name,
        endpoint_url,
        secret,
        events,
        active,
        last_tested_at,
        created_at,
        updated_at,
        created_by,
        updated_by
      FROM library.webhook_subscriptions
      WHERE lower(tenant_id) = lower($1)
        AND active = TRUE
        AND ($2 = ANY(events) OR '*' = ANY(events))
      ORDER BY id
    `,
    [tenant, args.eventType]
  );

  if (!rows.length) return { attempted: 0, delivered: 0 };

  let delivered = 0;
  for (const row of rows) {
    const deliveryId = crypto.randomUUID();
    const body = {
      id: deliveryId,
      event: args.eventType,
      tenantId: tenant,
      requestId: args.requestId || null,
      actorId: args.actorId || null,
      occurredAt: new Date().toISOString(),
      payload: args.payload,
    };
    const bodyText = JSON.stringify(body);
    const signature = buildSignature(row.secret, bodyText);
    const startedAt = Date.now();

    let statusCode: number | null = null;
    let responseBody: string | null = null;
    let status: "delivered" | "failed" = "failed";
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(row.endpoint_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-stacksos-event": args.eventType,
          "x-stacksos-delivery-id": deliveryId,
          "x-stacksos-signature": signature,
        },
        body: bodyText,
        signal: controller.signal,
      });
      clearTimeout(timer);

      statusCode = response.status;
      responseBody = await response.text().catch(() => null);
      status = response.ok ? "delivered" : "failed";
      if (response.ok) delivered += 1;
    } catch (error) {
      responseBody = String(error);
      status = "failed";
    }

    const latencyMs = Date.now() - startedAt;
    await recordDelivery({
      subscriptionId: row.id,
      eventType: args.eventType,
      deliveryId,
      status,
      statusCode,
      latencyMs,
      requestBody: body,
      responseBody,
    });

    logger.info(
      {
        component: "developer-webhooks",
        subscriptionId: row.id,
        eventType: args.eventType,
        deliveryId,
        status,
        statusCode,
        latencyMs,
      },
      "Webhook delivery completed"
    );
  }

  return { attempted: rows.length, delivered };
}

export async function triggerWebhookTest(args: {
  tenantId?: string | null;
  webhookId: number;
  actorId?: number | null;
  requestId?: string | null;
}): Promise<{ attempted: number; delivered: number }> {
  const tenant = normalizeTenantId(args.tenantId);
  const webhookId = Math.trunc(args.webhookId);
  if (!Number.isFinite(webhookId) || webhookId <= 0) throw new Error("Invalid webhook id");

  const row = await querySingle<SubscriptionRow>(
    `
      SELECT
        id,
        tenant_id,
        name,
        endpoint_url,
        secret,
        events,
        active,
        last_tested_at,
        created_at,
        updated_at,
        created_by,
        updated_by
      FROM library.webhook_subscriptions
      WHERE id = $1
        AND lower(tenant_id) = lower($2)
      LIMIT 1
    `,
    [webhookId, tenant]
  );
  if (!row) throw new Error("Webhook subscription not found");

  const eventResult = await publishDeveloperEvent({
    tenantId: tenant,
    eventType: "system.webhook.test",
    actorId: args.actorId,
    requestId: args.requestId,
    payload: {
      webhookId,
      webhookName: row.name,
      endpointUrl: row.endpoint_url,
      message: "StacksOS webhook connectivity test",
    },
  });

  await markWebhookTested(webhookId);
  return eventResult;
}
