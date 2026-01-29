# Email Configuration Guide

StacksOS includes a comprehensive email notification system for sending patron notices including:
- Hold ready notifications
- Overdue item reminders
- Pre-overdue courtesy notices
- Library card expiration warnings
- Fine and fee bills

## Quick Start (Development)

For development and testing, emails are logged to the console by default:

```bash
# Already configured in .env
STACKSOS_EMAIL_PROVIDER=console
STACKSOS_EMAIL_DRY_RUN=true
```

Check the application logs to see email content that would be sent.

## Production Setup

### Option 1: Resend (Recommended)

Resend offers a simple API, generous free tier, and excellent deliverability.

1. **Sign up** at https://resend.com
2. **Verify your domain** in the Resend dashboard
3. **Create an API key** at https://resend.com/api-keys
4. **Update .env**:
   ```bash
   STACKSOS_EMAIL_PROVIDER=resend
   STACKSOS_EMAIL_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
   STACKSOS_EMAIL_FROM=noreply@yourlibrary.org
   STACKSOS_EMAIL_FROM_NAME=Your Library Name
   STACKSOS_EMAIL_DRY_RUN=false
   ```
5. **Restart the application**

### Option 2: SendGrid

SendGrid is widely used and offers robust email infrastructure.

1. **Sign up** at https://sendgrid.com
2. **Verify your domain** in SendGrid settings
3. **Create an API key** at https://app.sendgrid.com/settings/api_keys
4. **Update .env**:
   ```bash
   STACKSOS_EMAIL_PROVIDER=sendgrid
   STACKSOS_EMAIL_API_KEY=SG.xxxxxxxxxxxxxxxxxxxx
   STACKSOS_EMAIL_FROM=noreply@yourlibrary.org
   STACKSOS_EMAIL_FROM_NAME=Your Library Name
   STACKSOS_EMAIL_DRY_RUN=false
   ```
5. **Restart the application**

### Option 3: Amazon SES

Amazon SES offers low-cost email sending for high volume.

**Note**: SES integration requires additional AWS SDK setup and is not fully implemented yet.

1. **Set up AWS SES** in your AWS account
2. **Verify your domain** in SES console
3. **Create IAM credentials** with SES send permissions
4. **Update .env**:
   ```bash
   STACKSOS_EMAIL_PROVIDER=ses
   STACKSOS_EMAIL_API_KEY=AKIAXXXXXXXXXXXX
   STACKSOS_EMAIL_REGION=us-east-1
   STACKSOS_EMAIL_FROM=noreply@yourlibrary.org
   STACKSOS_EMAIL_FROM_NAME=Your Library Name
   STACKSOS_EMAIL_DRY_RUN=false
   ```
5. **Restart the application**

## Testing Email Configuration

### Test in Dry Run Mode First

Before sending real emails, test with dry run enabled:

```bash
STACKSOS_EMAIL_PROVIDER=resend  # or sendgrid
STACKSOS_EMAIL_API_KEY=your-key-here
STACKSOS_EMAIL_DRY_RUN=true  # Still logs, doesn't send
```

### Send a Test Email

1. Log in to StacksOS as a staff member
2. Navigate to Patron Management
3. Find a patron with a valid email address
4. Trigger a manual notice (e.g., hold ready notification)
5. Check application logs to verify email was sent
6. Check patron's email inbox

### Monitor Email Logs

All email sending is logged with structured logging:

```bash
# View recent email logs on the server
ssh stacksos
tail -f ~/projects/stacksos/logs/stacksos.log | grep "component.*email"
```

Look for log entries like:
```json
{
  "level": "info",
  "component": "email",
  "noticeType": "hold_ready",
  "patronId": 12345,
  "recipient": "patron@example.com",
  "message": "Successfully sent hold_ready notice to patron 12345"
}
```

## Email Templates

Email templates are located in `src/lib/email/templates/`:

- `hold-ready.ts` - Hold available for pickup
- `overdue.ts` - Overdue items
- `pre-overdue.ts` - Courtesy reminder (items due soon)
- `card-expiration.ts` - Library card expiring
- `fine-bill.ts` - Outstanding fines/fees

Each template generates both HTML and plain text versions.

### Customizing Templates

To customize email content:

1. Edit the template file in `src/lib/email/templates/`
2. Modify the HTML/text generation functions
3. Test in dry run mode
4. Deploy changes

## Batch Notices

StacksOS supports sending notices in batches with automatic rate limiting:

```typescript
import { sendBatchNotices } from "@/lib/email";

const results = await sendBatchNotices([
  { type: "hold_ready", context: {...} },
  { type: "overdue", context: {...} },
  // ...
]);

console.log(`Sent: ${results.sent}, Failed: ${results.failed}`);
```

Rate limiting is automatically applied (100ms delay between emails).

## Troubleshooting

### Emails Not Sending

1. **Check provider is not "console"**:
   ```bash
   grep STACKSOS_EMAIL_PROVIDER .env
   ```

2. **Check dry run is disabled**:
   ```bash
   grep STACKSOS_EMAIL_DRY_RUN .env
   ```

3. **Verify API key is set**:
   ```bash
   grep STACKSOS_EMAIL_API_KEY .env
   ```

4. **Check application logs** for errors:
   ```bash
   tail -f logs/stacksos.log | grep error
   ```

### Invalid Email Addresses

StacksOS validates email addresses before sending. Invalid addresses will be logged:

```json
{
  "level": "error",
  "component": "email",
  "error": "Invalid recipient email: not-an-email",
  "message": "Failed to send notice"
}
```

### Provider Rate Limits

If you hit rate limits:
- **Resend**: 100 emails/day (free tier), upgrade for more
- **SendGrid**: 100 emails/day (free tier), upgrade for more
- **SES**: Must request production access, starts in sandbox

Increase the delay in `sendBatchNotices()` if needed:
```typescript
await new Promise((resolve) => setTimeout(resolve, 500)); // 500ms delay
```

## Production Recommendations

1. **Domain Verification**: Always verify your sending domain to improve deliverability
2. **SPF/DKIM**: Configure SPF and DKIM records for your domain
3. **Monitor Bounces**: Set up bounce handling in your provider dashboard
4. **Volume Planning**: Choose provider based on expected email volume
5. **Fallback**: Consider configuring a backup provider if primary fails

## Security Notes

- Never commit `.env` with real API keys to version control
- Use environment-specific credentials (dev vs prod)
- Rotate API keys periodically
- Monitor for unauthorized sending
- Keep email provider libraries updated

## Cost Comparison

| Provider | Free Tier | Paid Plans | Notes |
|----------|-----------|------------|-------|
| Resend | 100/day, 3000/month | $20/mo for 50k | Modern API, good docs |
| SendGrid | 100/day | $15/mo for 40k | Industry standard |
| Amazon SES | 62k/month (with EC2) | $0.10 per 1000 | Cheapest for volume |

Choose based on your library's monthly email volume and budget.
