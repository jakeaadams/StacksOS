-- StackOS Email/SMS Notification System
-- Evergreen Database Setup
--
-- Run this SQL script in your Evergreen database to create the
-- user setting types needed for notification preferences.
--
-- Usage:
--   psql -U evergreen -d evergreen -f setup-evergreen-settings.sql

BEGIN;

-- Create notification preference setting types
INSERT INTO config.usr_setting_type (name, opac_visible, label, description, datatype, reg_default)
VALUES
  (
    'stacksos.email.notices.enabled',
    TRUE,
    'Email Notices Enabled',
    'Master switch to enable or disable all email notifications from the library',
    'bool',
    'true'
  ),
  (
    'stacksos.email.notices.hold_ready',
    TRUE,
    'Hold Ready Email Notification',
    'Send email notification when a hold is ready for pickup',
    'bool',
    'true'
  ),
  (
    'stacksos.email.notices.overdue',
    TRUE,
    'Overdue Email Notification',
    'Send email notification for overdue items',
    'bool',
    'true'
  ),
  (
    'stacksos.email.notices.pre_overdue',
    TRUE,
    'Pre-Overdue Courtesy Email',
    'Send courtesy reminder email when items are due soon',
    'bool',
    'true'
  ),
  (
    'stacksos.email.notices.card_expiration',
    TRUE,
    'Card Expiration Email Notification',
    'Send email reminder when library card is expiring soon',
    'bool',
    'true'
  ),
  (
    'stacksos.email.notices.fine_bill',
    TRUE,
    'Fine/Bill Email Notification',
    'Send email notification for outstanding fines or bills',
    'bool',
    'true'
  ),
  (
    'stacksos.sms.notices.enabled',
    TRUE,
    'SMS Notices Enabled',
    'Master switch to enable or disable all SMS notifications from the library',
    'bool',
    'false'
  ),
  (
    'stacksos.sms.notices.hold_ready',
    TRUE,
    'Hold Ready SMS Notification',
    'Send SMS notification when a hold is ready for pickup',
    'bool',
    'false'
  ),
  (
    'stacksos.sms.notices.overdue',
    TRUE,
    'Overdue SMS Notification',
    'Send SMS notification for overdue items',
    'bool',
    'false'
  ),
  (
    'stacksos.sms.notices.pre_overdue',
    TRUE,
    'Pre-Overdue Courtesy SMS',
    'Send courtesy SMS reminder when items are due soon',
    'bool',
    'false'
  ),
  (
    'stacksos.sms.notices.card_expiration',
    TRUE,
    'Card Expiration SMS Notification',
    'Send SMS reminder when library card is expiring soon',
    'bool',
    'false'
  ),
  (
    'stacksos.sms.notices.fine_bill',
    TRUE,
    'Fine/Bill SMS Notification',
    'Send SMS notification for outstanding fines or bills',
    'bool',
    'false'
  )
ON CONFLICT (name) DO UPDATE
  SET
    opac_visible = EXCLUDED.opac_visible,
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    datatype = EXCLUDED.datatype,
    reg_default = EXCLUDED.reg_default;

COMMIT;

-- Verify the settings were created
SELECT
  name,
  label,
  datatype,
  reg_default,
  opac_visible
FROM config.usr_setting_type
WHERE name LIKE 'stacksos.email.notices.%'
   OR name LIKE 'stacksos.sms.notices.%'
ORDER BY name;

-- Example: Set a patron's preference
-- UPDATE actor.usr_setting
-- SET value = 'false'
-- WHERE usr = <patron_id>
--   AND name = 'stacksos.email.notices.overdue';

-- Example: Get a patron's preferences
-- SELECT
--   name,
--   value
-- FROM actor.usr_setting
-- WHERE usr = <patron_id>
--   AND (name LIKE 'stacksos.email.notices.%' OR name LIKE 'stacksos.sms.notices.%');
