# Changelog

All notable changes to StacksOS are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Production Dockerfile with multi-stage build and health check
- OpenAPI 3.0 specification for all key API endpoints
- Dynamic imports for heavy components (AddItemDialog, CoverArtPicker, PlaceHoldDialog, PatronNoticesTab)
- SEO metadata for all OPAC pages via layout.tsx server components
- Sitemap infrastructure for dynamic record URLs

### Changed
- Enabled Next.js standalone output mode for containerized deployments

## [0.9.0] - 2026-02-20

### Added
- Moonshot/Kimi K2.5 AI provider via NVIDIA NIM integration
- Wave 2 features: AI cataloging suggestions, OPAC overhaul, Polaris-style cataloging UI
- ILL provider status, sync metadata, and manual-first UI
- Dedicated e2e smoke test lane (public and authenticated)
- ILS product gap closures across cataloging, ILL, and reports
- Cataloging workflow upgrades and staff dashboard improvements

### Fixed
- UI/UX uniformity audit addressing security, accessibility, and consistency
- Comprehensive 360-degree audit remediation (48+ fixes)
- Dashboard UX stability and Evergreen stat-category integration

### Changed
- Tightened lint `any` policy and removed legacy export shim

## [0.8.0] - 2026-02-06

### Added
- Tailscale serve runbook for Evergreen
- Internal root CA certificate serving via Caddy
- Nonce-ready CSP scripts and internal CA trust documentation

### Fixed
- CSP report URL handling behind reverse proxies
- Removed `rg` dependency from hardening script

### Changed
- Refreshed HTTPS/Caddy and kernel/security posture documentation

## [0.7.0] - 2026-02-05

### Added
- Retry-After header for rate-limited API errors
- World-class hardening: CI gate, CSP nonce, Redis session store, API cleanup
- Permissions inspector for staff admin

### Fixed
- Auth hardening, CSP reporting, and ops script improvements

### Changed
- Acquisitions route split into dedicated subroutes
- RBAC audit with delegated handler path resolution

## [0.6.0] - 2026-02-02

### Added
- Real staff user search endpoint for admin
- HTTPS hardening support specific to StacksOS

### Fixed
- Staff user search to include inherited staff groups
- Search result counts, pagination, and proxy handling

### Changed
- Kids OPAC and unfinished modules hidden behind feature flags
- Removed hardcoded stats cards from admin settings
- Disabled destructive workflow QA by default
- Refreshed plan/backlog dates and AI sequencing

## [0.5.0] - 2026-02-01

### Added
- MARC editor split-screen compare view
- Polaris-style header with environment banner, search, and workforms
- Implementation plan and expanded AI backlog documentation
- Patron photo management

### Fixed
- Z39.50 imported record linking
- OpenSRF POST encoding for spaces
- Patron UX and audit tooling improvements

## [0.4.0] - 2026-01-30

### Added
- Acquisitions module: purchase orders, invoices, funds, vendors, EDI, and receiving
- Offline circulation mode for network outages
- Course reserves module
- Booking/reservations system
- Item bucket management
- Organization calendar management
- Serials management (subscriptions, claims, routing)
- Z39.50/SRU federated search for copy cataloging

### Changed
- Admin settings with real Evergreen org-unit settings integration

## [0.3.0] - 2026-01-29

### Added
- Evergreen database integration for dashboard KPIs
- Authority control search functionality
- Holdings templates backend
- Email notification system
- Print styles and record creation functionality
- Confirmation dialog components

### Security
- Rate limiting on authentication endpoints
- Comprehensive security headers on all responses
- CSRF protection implementation

## [0.2.0] - 2026-01-29

### Added
- Next.js performance optimizations and bundle analyzer
- Logger utility replacing console statements

### Security
- Upgraded Next.js 16.1.2 to 16.1.6 to fix vulnerabilities
- Reverted bcrypt password hashing (critical fix)
- Replaced MD5 password hashing with bcrypt+MD5

### Changed
- Added security configuration guide for SSL issues
- Added .env.example documentation

## [0.1.0] - 2026-01-29

### Added
- Initial release of StacksOS library management system
- Staff client with circulation, cataloging, patron management
- OPAC with search, browse, holds, and account management
- Evergreen ILS integration via OpenSRF
- MARC editor for bibliographic records
- Multi-branch support with organization tree
