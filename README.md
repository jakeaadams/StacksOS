# StacksOS

A modern library staff platform and public catalog (OPAC) built on top of the
[Evergreen ILS](https://evergreen-ils.org). StacksOS provides a world-class
staff experience, workflow automation, and analytics layer while Evergreen
remains the system of record for patrons, items, circulation, and policies.

## Architecture

| Layer       | Technology                                              |
| ----------- | ------------------------------------------------------- |
| Framework   | [Next.js 16](https://nextjs.org/) (App Router)          |
| Language    | TypeScript (strict mode)                                |
| UI          | React 19, Radix UI, Tailwind CSS 4                      |
| ILS Backend | Evergreen ILS via OpenSRF gateway                       |
| Database    | PostgreSQL (Evergreen DB + StacksOS `library.*` schema) |
| Testing     | Vitest (unit), Playwright (E2E)                         |

StacksOS runs as a web application and API gateway. It communicates with
Evergreen over HTTPS (OpenSRF) and optionally connects directly to the
Evergreen PostgreSQL database for read-heavy or StacksOS-specific features.

## Prerequisites

- **Node.js 20+** (see `.nvmrc`)
- **Access to an Evergreen ILS instance** with OpenSRF gateway enabled
- **PostgreSQL** (Evergreen database; a dedicated `stacksos_app` role is recommended)
- **npm** (ships with Node.js)

## Quick Start

```bash
# Clone the repository
git clone <repo-url> stacksos
cd stacksos

# Use the correct Node version
nvm use

# Copy and configure environment variables
cp .env.example .env.local
# Edit .env.local with your Evergreen connection details

# Install dependencies
npm install

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the application.
Login credentials are your Evergreen staff credentials.

## Available Scripts

| Command                 | Description                                          |
| ----------------------- | ---------------------------------------------------- |
| `npm run dev`           | Start the Next.js development server with hot reload |
| `npm run build`         | Build the production bundle                          |
| `npm run start`         | Start the production server                          |
| `npm run lint`          | Run ESLint                                           |
| `npm run format`        | Format code with Prettier                            |
| `npm run format:check`  | Check formatting without writing changes             |
| `npm run test`          | Run unit tests in watch mode (Vitest)                |
| `npm run test:run`      | Run unit tests once                                  |
| `npm run test:coverage` | Run unit tests with coverage report                  |
| `npm run test:e2e`      | Run end-to-end tests (Playwright)                    |
| `npm run test:all`      | Run unit tests then E2E tests                        |

## Project Structure

```
src/
  app/                  # Next.js App Router pages and API routes
    api/                # API routes (Evergreen gateway, health, metrics)
    login/              # Authentication pages
    staff/              # Staff application pages
    opac/               # Public catalog (OPAC) pages
    self-checkout/      # Self-checkout kiosk interface
  components/           # React components (shared UI system)
  hooks/                # Custom React hooks
  lib/                  # Shared utilities, Evergreen client, RBAC, email
  config/               # Application configuration
  contexts/             # React context providers
  types/                # TypeScript type definitions
docs/                   # Detailed documentation and planning
audit/                  # Quality gate and performance budget scripts
scripts/                # Build, deploy, and maintenance scripts
tenants/                # Multi-tenant configuration files
ops/                    # Operational tooling (systemd units, backups)
```

## Environment Configuration

Copy `.env.example` to `.env.local` and configure the required variables:

- **`EVERGREEN_BASE_URL`** -- URL of your Evergreen OpenSRF gateway
- **`EVERGREEN_DB_*`** -- PostgreSQL connection details (use a least-privilege role)
- **`STACKSOS_BASE_URL`** -- Public URL of your StacksOS instance
- **`STACKSOS_RBAC_MODE`** -- Permission enforcement mode (`strict`, `warn`, or `off`)
- **`STACKSOS_EMAIL_PROVIDER`** -- Email provider (`console`, `resend`, `sendgrid`, `ses`)

See `.env.example` for the full list of available options including feature
flags, security settings, and optional integrations.

## Documentation

Detailed documentation lives in the `docs/` directory:

- [Runbook](docs/StacksOS-Runbook.md) -- Development and pilot operations guide
- [Master PRD](docs/StacksOS-Master-PRD.md) -- Product requirements document
- [Permissions](docs/StacksOS-Permissions.md) -- RBAC and Evergreen permission mapping
- [Observability](docs/OBSERVABILITY.md) -- Metrics, logging, and monitoring
- [Email Notices](docs/EMAIL_NOTICES.md) -- Email notification setup and templates
- [TLS Setup](docs/TLS_INTERNAL_CA.md) -- Internal CA and TLS configuration
- [Tenants](docs/StacksOS-Tenants.md) -- Multi-tenant configuration
- [Cover Storage](docs/COVER_STORAGE_GUIDE.md) -- Book cover image handling

Additional references:

- [Security Guide](SECURITY.md) -- TLS, database hardening, MFA strategy
- [Contributing](CONTRIBUTING.md) -- Development workflow and code style

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style
guidelines, commit conventions, and the pull request process.

## License

This project is licensed under the [MIT License](LICENSE).
