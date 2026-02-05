# Migration playbooks (draft but actionable)

These playbooks are designed for pilots. They focus on repeatable steps and measurable checkpoints, not vendor marketing.

Core principles:
- Treat Evergreen as system-of-record; validate data in Evergreen first.
- Run `./audit/run_all.sh` before and after every migration step.
- Keep a rollback plan for every irreversible change (DB snapshot or restore point).

Playbooks:
- `docs/migration/Polaris.md`
- `docs/migration/Sierra.md`
- `docs/migration/Symphony.md`
- `docs/migration/Alma.md`
- `docs/migration/Koha.md`
- `docs/migration/Evergreen.md`

