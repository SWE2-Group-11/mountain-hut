# Database

SQLite, accessed with `better-sqlite3`. The DB file path comes from the `DB_PATH` environment variable (default `backend/src/data/database.sqlite`).

## Conceptual schema

![Core schema](img/schema-core.png)

The diagram was drawn with [designER](https://designer.designerdb.io/).
The editable source is [`img/schema-core.er`](img/schema-core.er): load it in the tool to change the diagram, then export it again as `img/schema-core.png`.

## Logical schema

Primary keys in **bold**, `*` = nullable.

- account(**id**, email, password_salt, password_hash, must_change_password)
- password_reset_token(**token_hash**, account_id → account, created_at, expires_at)
- hiker(**account_id** → account, full_name, mobile_number, notes\*, emergency_contact\*)
- staff(**account_id** → account, name, role)
- slot(**date**, **start_time**, duration, menu\*)
- slot_table(**(slot_date, slot_start_time)** → slot, **table_number**, seats)
- booking(**id**, hiker_id\* → hiker)
- temporary_hiker(**booking_id** → booking, full_name, mobile_number\*)
- seated_at(**booking_id** → booking, **(slot_date, slot_start_time, table_number)** → slot_table, assigned_seats)
- dietary_requirement(**id**, booking_id → booking, allergy_flag, description)

## Rules not visible in the diagrams

- `account.email` is unique.
- `account.must_change_password` = 1 for accounts created by staff with a temporary password; it is cleared by any password change.
- `password_reset_token`: at most one row per account (`account_id` is unique); `token_hash` is the hex SHA-256 of the emailed token, never the token itself; `created_at` and `expires_at` are UTC (`YYYY-MM-DDTHH:MM:SSZ`), `expires_at` = `created_at` + 24 hours. A row is deleted when it is redeemed, replaced, expired (on the next request) or when the account password changes.
- Every account is either a hiker or a staff member, never both: exactly one row in `hiker` or `staff` per `account` (generalization (t,e), checked by the backend).
- `staff.role` ∈ {`employee`, `warden`}; a warden can also perform employee functions.
- `slot.duration` is expressed in minutes.
- `slot.menu` is free text in Markdown (bold, italic, nested lists); NULL means the menu is not defined yet, the empty string is not allowed.
- All `seated_at` rows of the same booking refer to the same slot.
- For each `slot_table`: SUM(`assigned_seats`) ≤ `seats`.
- `assigned_seats` ≥ 1.
- Party size of a booking = SUM(`assigned_seats`).
- A hiker can have at most one booking per slot.
- A booking can be created only up to 2 hours before the slot start (`date` + `start_time`).
- A booking can be changed only up to 48 hours before the slot start.
- Every booking belongs to exactly one of: a hiker (`booking.hiker_id`) or a temporary hiker (a row in `temporary_hiker`), never both and never none.

## SQL scripts (`backend/src/database/sql/`)

| File | Content |
|---|---|
| `drop.sql` | Drops all tables |
| `init.sql` | Creates all tables |
| `clear.sql` | Empties all tables, keeping the schema |

The fixed demo data for the tests is in `backend/src/tests/fixtures/seed.sql` (see [Seed](#seed)). SQL files are read through `readSql` (`backend/src/database/sql-files.ts`).

## Seed

`resetDatabase` (`backend/src/database/database.ts`) drops, recreates and seeds the database in a single transaction: if any step fails, the database is left unchanged. It runs at startup when `RESET_DB=true` or when the database has no tables yet (first start, or a previous start whose seeding failed and was rolled back). The seed itself is in `backend/src/database/seed/` (`index.ts` runs the steps below).

1. Accounts (`seed/accounts.ts`): read from `seed-accounts.json` in the repository root (see `seed-accounts.example.json`; `SEED_ACCOUNTS_FILE` overrides the path). Passwords are hashed at that moment; the account at position `n` gets id `n`.
2. Slots, tables and bookings, according to `SEED_MODE`:

| `SEED_MODE` | Used by | Data |
|---|---|---|
| `random` (default) | the app | `seed/slots.ts`: slots for the next 3 days, 1 to 3 per day, never overlapping and ending by 23:59, each with 1 to 6 tables of 2 to 8 seats. `seed/bookings.ts`: some of the hikers and some temporary hikers (at least one of each) book a random set of slots, with a party of 1 to half the slot capacity seated with `assignSeats` (skipped if the slot is full) and random dietary requirements (at most one per person). Everything created is logged. |
| `fixed` | the tests (`src/tests/fixtures/test.env`) | `src/tests/fixtures/seed.sql`: 4 slots with the same table layout, 4 bookings with seats and dietary requirements (3 by accounts 3 and 4, 1 for a temporary hiker). Its bookings belong to accounts 3 and 4, so it works only with `src/tests/fixtures/seed-accounts.json`. |