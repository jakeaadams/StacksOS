# Security Configuration Guide

## CRITICAL: SSL Certificate Verification Disabled

**Current Status:** SSL certificate verification is disabled via NODE_TLS_REJECT_UNAUTHORIZED=0

**Location:** .env.local line 2

**Risk Level:** CRITICAL

### Why This Is Dangerous

Disabling SSL verification allows man-in-the-middle (MITM) attacks.

### How To Fix

**Option 1: Install Valid SSL Certificate on Evergreen Server**

1. SSH into Evergreen server (192.168.1.232)
2. Install SSL certificate
3. Remove NODE_TLS_REJECT_UNAUTHORIZED=0 from .env.local
4. Restart StacksOS

**Option 2: Accept Risk for Internal Network**

Only if network is completely isolated.

### Security Improvements Completed

- Password Hashing: Upgraded from MD5 to bcrypt+MD5
- CSRF Protection: Implemented cryptographic token validation
- File Upload Security: Authentication and validation enforced
- Audit Logging: Comprehensive security event logging

Last Updated: January 29, 2026
