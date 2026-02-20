# Contributing to StacksOS

Thank you for your interest in contributing to StacksOS. This guide covers the
development workflow, code style expectations, and pull request process.

## Development Setup

1. **Prerequisites**: Node.js 20+ (see `.nvmrc`), access to an Evergreen ILS
   instance, and PostgreSQL.

2. **Clone and install**:

   ```bash
   git clone <repo-url> stacksos
   cd stacksos
   nvm use
   npm install
   ```

3. **Configure environment**: Copy `.env.example` to `.env.local` and fill in
   your Evergreen connection details. See the [README](README.md) for required
   variables.

4. **Start developing**:

   ```bash
   npm run dev
   ```

5. **Run the quality gate** before submitting changes:

   ```bash
   npm run lint
   npm run format:check
   npm run test:run
   ```

## Code Style

The project enforces consistent style through automated tooling:

- **Prettier** for formatting (`npm run format` to auto-fix,
  `npm run format:check` to verify).
- **ESLint** for linting (`npm run lint`).
- **TypeScript** in strict mode -- all code must pass `tsc --noEmit` with zero
  errors.

Pre-commit hooks (via Husky + lint-staged) run ESLint and Prettier
automatically on staged files. Ensure hooks are installed by running
`npm install` after cloning.

## File Naming Conventions

- **Components**: kebab-case filenames (e.g., `patron-search-form.tsx`).
- **Hooks**: `use-` prefix with kebab-case (e.g., `use-patron-search.ts`).
- **Utilities / lib**: kebab-case (e.g., `opensrf-client.ts`).
- **Types**: kebab-case (e.g., `circulation-types.ts`).
- **Test files**: co-located with source using `.test.ts` or `.test.tsx` suffix.

## Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

<optional body>
```

**Types**:

| Type       | Purpose                                   |
| ---------- | ----------------------------------------- |
| `feat`     | New feature                               |
| `fix`      | Bug fix                                   |
| `docs`     | Documentation only                        |
| `style`    | Formatting, no logic change               |
| `refactor` | Code restructuring, no behavior change    |
| `test`     | Adding or updating tests                  |
| `chore`    | Build, CI, tooling, or dependency updates |
| `perf`     | Performance improvement                   |

**Examples**:

```
feat(circulation): add batch checkout support
fix(opac): correct hold placement for multi-branch patrons
docs(readme): expand quick-start section
chore(deps): upgrade next to 16.1.6
```

Keep the summary line under 72 characters. Use the body for additional context
when the change is non-trivial.

## Pull Request Process

1. **Create a branch** from `main` using a descriptive name:

   ```bash
   git checkout -b feat/batch-checkout
   ```

2. **Make your changes** in small, focused commits.

3. **Ensure quality checks pass locally**:

   ```bash
   npm run lint
   npm run format:check
   npm run test:run
   ```

4. **Push and open a pull request** against `main`. Fill out the PR template
   with a summary, change list, and testing details.

5. **Address review feedback** promptly. Push additional commits rather than
   force-pushing over review comments.

6. **Merge**: A maintainer will merge the PR once it is approved and CI passes.

## Testing Expectations

- **Run tests before opening a PR**: `npm run test:run` (unit) and
  `npm run test:e2e` (end-to-end) should both pass.
- **Write tests for new features**: unit tests (Vitest) for business logic and
  utilities, E2E tests (Playwright) for critical user workflows.
- **Maintain coverage**: avoid reducing existing test coverage. If removing
  tests, explain why in the PR description.
- **Accessibility**: new UI components should pass axe-core checks. The E2E
  suite includes accessibility audits.

## Reporting Issues

Use GitHub Issues to report bugs or request features. Please use the provided
issue templates and include enough detail to reproduce the problem.

## Questions

If something is unclear, open a discussion or reach out to the maintainers.
We are happy to help.
