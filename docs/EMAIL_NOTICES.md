# Email Notification System for StackOS

This document describes the email notification system for patron notices in StackOS.

## Overview

The email notification system allows libraries to send automated email notices to patrons for various events:

- **Hold Ready**: Notify patrons when their holds are available for pickup
- **Overdue**: Alert patrons about overdue items
- **Pre-Overdue (Courtesy)**: Remind patrons when items are due soon
- **Card Expiration**: Warn patrons when their library card is expiring
- **Fines & Bills**: Notify patrons about outstanding fees

## Architecture

### Core Components

```
/src/lib/email/
├── index.ts              # Main email service
├── provider.ts           # Email provider integration (Resend, SendGrid, SES)
├── types.ts              # TypeScript interfaces
└── templates/
    ├── base.ts           # Base HTML template and utilities
    ├── hold-ready.ts     # Hold ready notification
    ├── overdue.ts        # Overdue items notification
    ├── pre-overdue.ts    # Pre-overdue courtesy notification
    ├── card-expiration.ts # Card expiration notification
    ├── fine-bill.ts      # Fines and bills notification
    └── index.ts          # Template exports

/src/app/api/evergreen/notices/
└── route.ts              # API routes for notices

/src/components/patron/
├── notification-preferences.tsx  # Patron preference UI
└── patron-notices-tab.tsx        # Staff notice interface
```

### API Routes

#### GET /api/evergreen/notices
Get patron notification preferences.

**Query Parameters:**
- `patron_id` (required): Patron ID

**Response:**
```json
{
  "ok": true,
  "preferences": {
    "patronId": 123,
    "emailEnabled": true,
    "holdReady": true,
    "overdue": true,
    "preOverdue": true,
    "cardExpiration": true,
    "fineBill": true
  }
}
```

#### POST /api/evergreen/notices
Send an email notice to a patron.

**Request Body:**
```json
{
  "patron_id": 123,
  "notice_type": "hold_ready",
  "holds": [
    {
      "id": 456,
      "title": "The Great Gatsby",
      "author": "F. Scott Fitzgerald",
      "pickupLibrary": "Main Library",
      "shelfExpireTime": "2026-02-15T23:59:59Z"
    }
  ]
}
```

**Notice Types:**
- `hold_ready` - requires `holds` array
- `overdue` - requires `items` array
- `pre_overdue` - requires `items` array
- `card_expiration` - requires `expirationDate`
- `fine_bill` - requires `bills` array

#### PATCH /api/evergreen/notices
Update patron notification preferences.

**Request Body:**
```json
{
  "patron_id": 123,
  "preferences": {
    "emailEnabled": true,
    "holdReady": true,
    "overdue": false
  }
}
```

## Configuration

### Environment Variables

Add these to your `.env.local` file:

```bash
# Email Provider (console, resend, sendgrid, ses)
STACKSOS_EMAIL_PROVIDER=console

# API Key (for resend, sendgrid, ses)
STACKSOS_EMAIL_API_KEY=your_api_key_here

# From Email
STACKSOS_EMAIL_FROM=noreply@yourlibrary.org
STACKSOS_EMAIL_FROM_NAME=Your Library System

# Dry Run Mode (true = log only, false = send emails)
STACKSOS_EMAIL_DRY_RUN=true

# Base URL for links
STACKSOS_BASE_URL=https://catalog.yourlibrary.org
```

### Email Providers

#### Resend (Recommended)
1. Sign up at https://resend.com
2. Get API key from dashboard
3. Verify your sending domain
4. Set environment variables:
   ```bash
   STACKSOS_EMAIL_PROVIDER=resend
   STACKSOS_EMAIL_API_KEY=re_xxxxxxxxxxxxx
   STACKSOS_EMAIL_FROM=notices@yourlibrary.org
   ```

#### SendGrid
1. Sign up at https://sendgrid.com
2. Create API key with "Mail Send" permission
3. Verify your sending domain
4. Set environment variables:
   ```bash
   STACKSOS_EMAIL_PROVIDER=sendgrid
   STACKSOS_EMAIL_API_KEY=SG.xxxxxxxxxxxxx
   STACKSOS_EMAIL_FROM=notices@yourlibrary.org
   ```

#### Amazon SES
Coming soon - requires AWS SDK integration.

#### Console (Development)
For testing, use console mode:
```bash
STACKSOS_EMAIL_PROVIDER=console
STACKSOS_EMAIL_DRY_RUN=true
```

## Usage

### Programmatic API

```typescript
import { sendNotice } from "@/lib/email";

// Send a hold ready notice
await sendNotice({
  type: "hold_ready",
  context: {
    patron: {
      id: 123,
      firstName: "Jane",
      lastName: "Doe",
      email: "jane.doe@example.com",
    },
    library: {
      name: "Main Library",
      phone: "(555) 123-4567",
      email: "library@example.org",
      website: "https://library.example.org",
    },
    holds: [
      {
        id: 456,
        title: "The Great Gatsby",
        author: "F. Scott Fitzgerald",
        pickupLibrary: "Main Library",
        shelfExpireTime: "2026-02-15",
      },
    ],
    preferencesUrl: "https://catalog.library.org/account/settings",
    unsubscribeUrl: "https://catalog.library.org/account/settings?unsubscribe=email",
  },
});
```

### Staff Interface

1. Navigate to patron detail page
2. Click "Notices" tab
3. Select notice type from dropdown
4. Click "Send Notice"

### Patron Preferences

Patrons can manage their notification preferences:
1. Navigate to account settings
2. Toggle notification types on/off
3. Save preferences

Preferences are stored in Evergreen's `actor.usr_setting` table using setting types:
- `stacksos.email.notices.enabled` - Master switch
- `stacksos.email.notices.hold_ready` - Hold ready notices
- `stacksos.email.notices.overdue` - Overdue notices
- `stacksos.email.notices.pre_overdue` - Pre-overdue notices
- `stacksos.email.notices.card_expiration` - Card expiration notices
- `stacksos.email.notices.fine_bill` - Fine/bill notices

## Integration with Evergreen

### Creating Setting Types

You'll need to create the setting types in Evergreen:

```sql
-- Run this in your Evergreen database
INSERT INTO config.usr_setting_type (name, label, description, datatype, reg_default)
VALUES
  ('stacksos.email.notices.enabled', 'Email Notices Enabled', 'Enable email notifications', 'bool', 'true'),
  ('stacksos.email.notices.hold_ready', 'Hold Ready Email', 'Send email when hold is ready', 'bool', 'true'),
  ('stacksos.email.notices.overdue', 'Overdue Email', 'Send email for overdue items', 'bool', 'true'),
  ('stacksos.email.notices.pre_overdue', 'Pre-Overdue Email', 'Send courtesy reminder for items due soon', 'bool', 'true'),
  ('stacksos.email.notices.card_expiration', 'Card Expiration Email', 'Send email when card is expiring', 'bool', 'true'),
  ('stacksos.email.notices.fine_bill', 'Fine/Bill Email', 'Send email for fines and bills', 'bool', 'true');
```

### Scheduled Jobs

For automated notices, you'll need to create scheduled jobs (cron, systemd timers, etc.) that:

1. Query Evergreen for patrons with:
   - Holds that just became available
   - Items that are overdue
   - Items due within X days
   - Cards expiring within X days
   - New bills/fines

2. Call the notices API for each patron:
   ```bash
   curl -X POST http://localhost:3000/api/evergreen/notices \
     -H "Content-Type: application/json" \
     -H "Cookie: authtoken=YOUR_AUTH_TOKEN" \
     -d '{
       "patron_id": 123,
       "notice_type": "hold_ready",
       "holds": [...]
     }'
   ```

### Example Cron Job

```bash
#!/bin/bash
# /usr/local/bin/send-hold-ready-notices.sh

# Query Evergreen for holds that just became available
# This is a simplified example - you'll need actual Evergreen queries

psql evergreen -t -c "
  SELECT DISTINCT usr
  FROM action.hold_request
  WHERE shelf_time::date = CURRENT_DATE
    AND capture_time IS NOT NULL
" | while read patron_id; do
  # Get hold details and send notice
  # You'd call your API here with actual hold data
  echo "Sending hold ready notice to patron $patron_id"
done
```

Add to crontab:
```
# Send hold ready notices at 9 AM daily
0 9 * * * /usr/local/bin/send-hold-ready-notices.sh
```

## Testing

### Test in Dry Run Mode

1. Set `STACKSOS_EMAIL_DRY_RUN=true` in `.env.local`
2. Send a test notice from staff interface
3. Check console output for email content

### Test with Real Email

1. Set up email provider (Resend recommended)
2. Set `STACKSOS_EMAIL_DRY_RUN=false`
3. Send test notice to your own email address
4. Verify formatting and links

### Test Preferences

1. As patron, navigate to account settings
2. Toggle notification preferences
3. Verify settings are saved
4. Send notice and confirm it respects preferences

## Audit Logging

All email notices are logged via StackOS audit system:

```json
{
  "ts": "2026-01-27T10:30:00.000Z",
  "channel": "audit",
  "action": "notice.sent",
  "entity": "email_notice",
  "entityId": 123,
  "status": "success",
  "details": {
    "noticeType": "hold_ready",
    "patronId": 123,
    "recipient": "patron@example.com"
  },
  "actor": { "id": 1, "username": "admin" }
}
```

View audit logs:
```bash
tail -f ~/projects/stacksos/.logs/audit.log | grep "notice.sent"
```

## Rate Limiting

The batch notice sender includes automatic rate limiting:
- 100ms delay between emails
- Prevents provider rate limit issues
- Can be adjusted in `/src/lib/email/index.ts`

## Customization

### Email Templates

Templates are in `/src/lib/email/templates/`. Each template has:
- HTML version (styled with inline CSS)
- Plain text version (for email clients that don't support HTML)

To customize:
1. Edit template files
2. Update styling in `base.ts`
3. Test with dry run mode

### Adding New Notice Types

1. Add type to `/src/lib/email/types.ts`:
   ```typescript
   export type NoticeType =
     | "hold_ready"
     | "overdue"
     | "your_new_type";
   ```

2. Create template in `/src/lib/email/templates/your-new-type.ts`

3. Update `/src/lib/email/index.ts` to handle new type

4. Add to UI components

## Troubleshooting

### Emails not sending

1. Check `STACKSOS_EMAIL_DRY_RUN` is `false`
2. Verify API key is correct
3. Check email provider dashboard for errors
4. Review audit logs for failures

### Patron not receiving emails

1. Verify patron has email address in Evergreen
2. Check patron notification preferences
3. Verify email not going to spam
4. Check provider's delivery logs

### Template styling issues

1. Use inline CSS only (email clients don't support `<style>` tags well)
2. Test in multiple email clients
3. Use email testing service like Litmus or Email on Acid

## Security

- Email API keys are redacted from logs
- Patron emails are not exposed in client-side code
- Unsubscribe links are generated per-notice
- Preferences require authentication to modify

## Performance

- Batch sending supports multiple notices efficiently
- Rate limiting prevents provider throttling
- Async sending doesn't block API responses
- Templates are rendered on-demand (no caching needed)

## Future Enhancements

- [ ] SMS notifications via Twilio
- [ ] Amazon SES integration
- [ ] Notice history tracking in database
- [ ] Notice templates in Evergreen
- [ ] Scheduled notice generation
- [ ] Digest mode (combine multiple notices)
- [ ] Rich text editor for custom notices
- [ ] A/B testing for notice effectiveness
