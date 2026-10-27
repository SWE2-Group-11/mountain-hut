# Database

SQLite, accessed with `better-sqlite3`. The DB file path comes from the `DB_PATH` environment variable (default `backend/src/data/database.sqlite`).

## Conceptual schema

![Core schema](img/schema-core.png)

## Logical schema

Primary keys in **bold**, `*` = nullable.

- Account(**id**, first_name, last_name, email, password_salt, password_hash, role)
- Slot(**date**, **start_time**, duration)
- SlotTable(**(slot_date, slot_start_time)** → Slot, **table_number**, seats)
- Booking(**id**, hiker_id → Account)
- SeatedAt(**booking_id** → Booking, **(slot_date, slot_start_time, table_number)** → SlotTable, assigned_seats)
- DietaryRequirement(**id**, booking_id → Booking, allergy_flag, description)

## Rules not visible in the diagrams

- `Account.email` is unique.
- `Account.role` ∈ {`hiker`, `employee`, `warden`}; a warden can also perform employee functions.
- All `SeatedAt` rows of the same booking refer to the same slot.
- For each `SlotTable`: SUM(`assigned_seats`) ≤ `seats`.
- `assigned_seats` ≥ 1.
- Party size of a booking = SUM(`assigned_seats`).

## SQL scripts (`backend/src/database/sql/`)

| File | Content |
|---|---|
| `drop-core.sql` |  |
| `init-core.sql` |  |
| `seed-core.sql` |  |
| `clear-core.sql` |  |

`RESET_DB=true` runs drop, init and seed at startup.
