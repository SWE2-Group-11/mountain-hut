# Database

SQLite, accessed with `better-sqlite3`. The DB file path comes from the `DB_PATH` environment variable (default `backend/src/data/database.sqlite`).

## Conceptual schema



## Logical schema



## Rules not visible in the diagrams



## SQL scripts (`backend/src/database/sql/`)

| File | Content |
|---|---|
| `drop-core.sql` |  |
| `init-core.sql` |  |
| `seed-core.sql` |  |
| `clear-core.sql` |  |

`RESET_DB=true` runs drop, init and seed at startup.
