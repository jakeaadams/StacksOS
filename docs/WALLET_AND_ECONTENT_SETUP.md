# Wallet + eContent Setup

This guide configures two StacksOS product-layer features while keeping Evergreen as source-of-record:

- OPAC wallet enrollment links for patron digital cards
- Tenant-level digital provider connector behavior (Libby/OverDrive, Hoopla, cloudLibrary, Kanopy)

## 1. Wallet Enrollment Links

StacksOS does not require Evergreen customization for wallet links.
It generates short-lived signed tokens and redirects patrons to your wallet pass issuer service.

Set these env vars:

```bash
STACKSOS_WALLET_APPLE_URL_TEMPLATE="https://wallet.example.org/apple?token={token}&card={card_number}"
STACKSOS_WALLET_GOOGLE_URL_TEMPLATE="https://wallet.example.org/google?token={token}&card={card_number}"
STACKSOS_WALLET_TOKEN_SECRET="a-long-random-secret"
STACKSOS_WALLET_TOKEN_TTL_SECONDS=900
```

Supported template placeholders:

- `{token}`, `{patron_id}`, `{card_number}`
- `{first_name}`, `{last_name}`, `{full_name}`
- `{email}`, `{library_name}`, `{tenant_id}`

Patron entrypoints:

- `GET /api/opac/library-card/wallet`
- `POST /api/opac/library-card/wallet` with `{ "action": "email", "platform": "both" }`
- OPAC page: `/opac/account/library-card`

## 2. Digital App Library Connectors

Connector settings are stored in `library.econtent_connections` and are tenant-scoped.
No Evergreen core table changes are required.

Staff admin entrypoint:

- `/staff/admin/settings/econtent`

API endpoints:

- `GET /api/admin/econtent-connections`
- `POST /api/admin/econtent-connections`
- `GET /api/opac/econtent/providers` (patron-facing effective provider list)

Each provider can be configured for:

- `enabled` (`true`/`false`)
- `mode` (`linkout`, `oauth_passthrough`, `api`)
- `browseUrl`, `appUrl`
- `supportsCheckout`, `supportsHold`
- `credentialRef` (vault pointer/reference, not secret material)
- `notes`

## 3. Production Guardrails

- Keep Evergreen auth/card/PIN as source-of-truth.
- Use `credentialRef` to point to secret vault entries; do not store provider secrets in UI notes.
- Start in `linkout` mode and promote to `oauth_passthrough`/`api` per-provider after contract/cert validation.
- Keep outbound notifications in safe mode for demo environments.
