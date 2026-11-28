# AGENTS.md

Guidance for coding agents. It covers only what the docs below do not; read the relevant one before changing that area.

| Topic | Source |
|---|---|
| Components, backend layers and their dependency rules | [docs/architecture.md](docs/architecture.md) |
| REST endpoints | [docs/api.md](docs/api.md) |
| Schema, rules and SQL scripts | [docs/database.md](docs/database.md) |
| Libraries and tools | [docs/stack.md](docs/stack.md) |
| Branches, commits, PRs, Definition of Done, docs that must match the code | [docs/working-agreement.md](docs/working-agreement.md) |
| Setup, running, test prerequisites | [README.md](README.md#development) |

## Requirements

The user stories are in the public course repository [SE2-Polito/AY26-27-Mountain-Hut](https://github.com/SE2-Polito/AY26-27-Mountain-Hut): the index in its `README.md`, one file per story in `stories/` (e.g. `https://raw.githubusercontent.com/SE2-Polito/AY26-27-Mountain-Hut/main/stories/MH-10.md`), the domain in `context.md`. Read the story when the expected behaviour of a task is unclear.

- Find the story by name, not by number. Every YouTrack task is named after its story (also visible in the branch description): task `MH-157` "define menus controller" belongs to story `MH-10` "Define menus". Story IDs (`MH-01` to `MH-30`) and task IDs share the `MH-` prefix but are unrelated numbers.
- The story file, including its Clarifications section, is the current requirement. Discussions are in that repository's issues: `gh issue list -R SE2-Polito/AY26-27-Mountain-Hut --state all --search "MH-10"`. If an issue and the story disagree, follow the story and report the disagreement.
- Never open issues or comment in that repository: it is shared by all teams and the product owner. If a requirement is still ambiguous, stop and ask the user, quoting the story wording and the possible interpretations.

## Checks

Run them in the package you changed, the same as CI (`.github/workflows/ci.yml`).

| Package | Command |
|---|---|
| `backend/` | `npm run lint && npm run typecheck && npm test` |
| `frontend/` | `npx oxlint && npx tsc -b --noEmit` (no unit tests: lint and type check are the only checks) |
| `e2e/` | `npx playwright test tests/<name>.spec.ts` |

- One backend test file: `npx vitest run src/tests/<unit|integration>/<file>`.
- Backend tests are named `<feature>[-<layer>].<unit|integration>.test.ts` in `src/tests/unit/` and `src/tests/integration/`; shared helpers are in `src/tests/helpers.ts`.
- Run E2E only when a user flow changes, one spec at a time. It needs the [E2E prerequisites](README.md#tests); if a port is taken, report it instead of stopping the user's processes.

## Secrets

- Never read, create, edit or commit `.env` or `seed-accounts.json`. Tests use only `backend/src/tests/fixtures/`.
- Never touch `backend/src/data/database.sqlite`: it is the developer's local database.

## Before finishing a change

- Every contract doc affected by the change is updated in the same change (see "Documentation" in [docs/working-agreement.md](docs/working-agreement.md#documentation)).
- The tests required by the Definition of Done exist for the layers you touched ([docs/working-agreement.md](docs/working-agreement.md#definition-of-done)).
- Branch name, commit messages and PR title/template follow [docs/working-agreement.md](docs/working-agreement.md); ask for the YouTrack `MH-<id>` if it is not given.
