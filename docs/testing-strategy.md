# Testing strategy

## Shape: the testing trophy

Most of the effort goes into integration tests. They run the real backend and a real (in memory) database, so they catch what users actually hit.

| Level | Amount of tests | Question it answers |
|---|---|---|
| E2E | few | Can a user complete the story in the browser? |
| Integration | most | Does the API do what the story says, with the real database? |
| Unit | some | Is this business rule right in every case, including the edge cases? |

## Levels

| Level | What it covers |
|---|---|
| Unit | Business logic only: `backend/src/domain/` and `backend/src/controllers/` |
| Integration | Router, middleware, controller |
| E2E | Frontend and backend together |

The frontend has no unit tests: it is tested only through E2E.

### Unit tests

Unit tests cover business logic expressed inside `backend/src/domain/` and `backend/src/controllers/`. Other layers are skipped because they contain trivial logic that is covered by integration and E2E tests. DAOs have no tests of their own: their SQL is covered through the HTTP API by the integration tests.

Unit tests need to mock all collaborators of the unit being tested. They should not test how collaborators are used: no assertion on how many times a collaborator has been called or on its input parameters. Assert only on what the unit returns or throws. Controller functions whose only effect is a DAO call (for example cancelling or saving a booking) therefore have no unit tests: integration tests cover them.

When a rule depends on the current time, control it with `vi.setSystemTime`, or pass "now" as a parameter (like `isBookingOpen` in `backend/src/domain/booking-rules.ts`).

### Integration tests

They are the main safety net. One file per feature or component (`<feature/component>.integration.test.ts`). Components to be tested are inside `backend/src/routes/` and all tests need to get through the HTTP layer using `supertest`. Each feature's integration tests must:

- Cover every acceptance criterion of the story with at least one test.
- Test every business rule once. Edge cases belong to the unit tests of that rule.
- Access: for each authenticated endpoint, have one 401 test (visitor) and one 403 test (wrong role).
- Validation: have one test per rule the API defines (for example "party size between 1 and the slot capacity", "menu up to 5000 characters"). Do not test zod's own checks (wrong type, not an object, unknown field stripped).
- Check results through the API (a follow-up `GET`) when it exposes them. Read the database only for effects no endpoint shows (a password hash, a stored reset token, "nothing was saved after a refused request").
- For email-related tests, mock `notifications/mail-sender` and assert on the messages it received, including that none was sent.

### E2E tests

One (or more, if needed) spec per story, kept small:

- the happy path of the story;
- at most two main failures, as the user sees them (for example the slot is full, or the booking is less than 48 h away);
- UI behaviour that no other test can cover, only when it is part of the story (for example a role that must not see a page).

Not in E2E:
- backend rules and validation messages already covered by integration tests;
- API-only requests with no browser step;
- one test per role when the UI does not differ between roles;
- proving that "nothing happened" by waiting: integration tests check it.

## Writing robust tests

### Tests must not depend on the implementation

A refactor that keeps the behaviour must not break any test. If it does, the test is wrong. Some rules to write robust tests:

- Go through the public entry point: the HTTP API, an exported `domain/` or controller function, the page as a user sees it.
- Assert outcomes, not calls: do not assert SQL text, private helpers or the order of internal calls. Do not test the libraries: zod, Express, luxon, crypto. This is why DTO testing is not performed.
- No assertion that only re-reads the value the test itself gave to a mock.

### Test data and isolation

| Level | Rule |
|---|---|
| Unit | No database. Build the input in the test. |
| Integration | `resetTestDatabase()` before each test; the fixed seed is in `backend/src/tests/fixtures/seed.sql`. Log each role in once per file (`beforeAll`): sessions live in memory and survive the reset. Tests that log out or change a password log in on their own. Fake the clock with `vi.setSystemTime` when a rule depends on the time. |
| E2E | Each spec works on its own day (today + an offset that no other spec uses). Create data through the API, not the UI. Log in through the API unless login is what the test is about. |

### Time

- No fixed waits (`waitForTimeout`, polling for a set time to prove that nothing happens). Wait for a condition with `expect.poll` or a web-first assertion.
- Tests must be able to run in parallel: they must not depend on the order of the files or share data with other files.
- CI does not retry failed tests. A test that fails only sometimes is a bug: fix it, do not re-run the job until it passes.

## Migration

Existing tests that this strategy no longer asks for (route, DTO and DAO unit tests; E2E tests of backend rules; duplicated integration cases) are cleaned up in one dedicated task. The candidates for removal or merging are listed in [testing-analysis.md](testing-analysis.md#5-recommendations-by-ci-time-saved).
