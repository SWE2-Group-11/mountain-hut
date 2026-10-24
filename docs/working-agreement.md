# Working agreement

## Branches
- `main` is the only long-lived branch and is protected: no direct pushes, every change goes through a PR.
- Each branch corresponds to one YouTrack task and is named `<type>/OQM-<id>-<short-description>`:
  - `<type>`: same types as Conventional Commits (see below)
  - `MH-<id>`: the ID of the YouTrack task, so the branch can be traced back to it
  - `<short-description>`: a few words, lowercase, kebab-case, no personal names

Examples:

    No examples available

## Commits
We follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

    <type>(<scope>): <description>

- Types: `feat`, `fix`, `docs`, `test`, `refactor`, `build`, `ci`, `chore`
- Scope: the part of the project involved, e.g. `backend`, `frontend`, `db`, `docs`
- Imperative, lowercase, no final period

Examples:

    feat(backend): add ticket creation logic
    fix(frontend): show ticket code after selection
    docs(readme): add setup instructions

## Pull requests
- The PR title must follow Conventional Commits. Keep the number of commits low and meaningful: a task should usually fit in a few commits. If a PR contains many work-in-progress commits, use **Squash and merge** on GitHub when merging it after approval; otherwise a normal merge is fine.
- At least one approval from a teammate (docs included).
- CI must pass before merging.
- Keep PRs small and focused: ideally one PR per task.

## Documentation
- Docs live in the repo as Markdown and are reviewed like code.
- 