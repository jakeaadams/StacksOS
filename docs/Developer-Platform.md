# StacksOS Developer Platform (Webhooks + Extension Contract)

Updated: 2026-02-25

## Scope

This document defines the first-class external integration surface for StacksOS:

1. Signed outbound webhooks for operational workflow hooks.
2. Stable event names and payload envelope.
3. Extension registration model in the `library` schema.

## Webhook Management API

Route: `/api/admin/developer/webhooks`

- `GET`: list supported events, subscriptions, and recent delivery logs.
- `POST action=create`: create subscription.
- `POST action=test`: dispatch `system.webhook.test` for a single subscription.
- `PUT`: update endpoint/events/active status/secret.
- `DELETE`: delete subscription.

Authorization:

- Requires SaaS tenant admin access (`requireSaaSAccess(... minRole=tenant_admin ...)`).

## Event Catalog (v1)

- `circulation.checkout.created`
- `circulation.checkin.completed`
- `holds.request.created`
- `patron.created`
- `k12.checkout.created`
- `k12.return.processed`
- `ai.ops.playbook.generated`
- `system.webhook.test`

Subscriptions may also use `*` to receive all supported events.

## Delivery Envelope

All webhook deliveries POST JSON:

```json
{
  "id": "delivery-uuid",
  "event": "k12.checkout.created",
  "tenantId": "default",
  "requestId": "optional-request-id",
  "actorId": 123,
  "occurredAt": "2026-02-25T15:00:00.000Z",
  "payload": {}
}
```

Headers:

- `x-stacksos-event`: event name
- `x-stacksos-delivery-id`: delivery UUID
- `x-stacksos-signature`: `sha256=<hmac_hex>`

Signature:

- HMAC SHA-256 over raw JSON request body.
- Shared secret is per-subscription.

## Persistence Model

Tables (created by DB migration #4):

- `library.webhook_subscriptions`
- `library.webhook_deliveries`
- `library.extension_registrations`

K-12 workflow backing tables in the same migration:

- `library.k12_classes`
- `library.k12_students`
- `library.k12_class_checkouts`

## Extension Contract

`library.extension_registrations` stores extension identity and capabilities.

Current core contract fields:

- `tenant_id`
- `extension_key`
- `display_name`
- `version`
- `status` (`active` by default)
- `capabilities` (text array)
- `webhook_subscription_id` (optional linkage)

This provides a stable base for future app-runtime loading without changing webhook semantics.
