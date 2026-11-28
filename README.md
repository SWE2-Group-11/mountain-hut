# Mountain Hut

- [Install and run](#install-and-run): for mountain huts, with Docker only
- [Development](#development): for contributors, from the source code
- [Repository layout](#repository-layout), [documentation](#documentation) and [license](#license)

## Install and run

The whole system runs in a single Docker image: web application, REST API and Mailpit (which catches the emails sent by the system: booking confirmations and changes, password reset links). Only requisite is a Docker installation.

### Quick start

1. Create a folder:

   ```bash
   mkdir mountain-hut && cd mountain-hut
   ```

2. Create `.env` with a random session secret:

   ```bash
   echo "SESSION_SECRET=$(openssl rand -hex 32)" > .env
   ```

3. Create `seed-accounts.json` with your own accounts (see [Accounts file](#accounts-file) for the rules):

   ```bash
   cat > seed-accounts.json <<'EOF'
   [
       { "role": "warden", "email": "anna@rifugio-example.it", "password": "a-strong-password", "name": "Anna" },
       { "role": "employee", "email": "luca@rifugio-example.it", "password": "another-strong-password", "name": "Luca" },
       {
           "role": "hiker", "email": "demo1@rifugio-example.it", "password": "demo-hiker-1",
           "name": "Demo Hiker One", "mobile": "+39 300 000 0001"
       },
       {
           "role": "hiker", "email": "demo2@rifugio-example.it", "password": "demo-hiker-2",
           "name": "Demo Hiker Two", "mobile": "+39 300 000 0002"
       }
   ]
   EOF
   chmod 600 .env seed-accounts.json
   ```

4. Start the container from the same folder:

   ```bash
   docker run -d --name mountain-hut --restart unless-stopped \
     --env-file .env \
     -v "$PWD/seed-accounts.json:/run/secrets/seed_accounts:ro" \
     -v mountain-hut-data:/app/data \
     -p 5173:5173 -p 3000:3000 -p 8025:8025 \
     ghcr.io/swe2-group-11/mountain-hut:latest
   ```

   The `seed-accounts.json` path must be absolute (in PowerShell use `${PWD}`). If the file is missing, Docker mounts an empty directory instead and the backend stops with `Cannot read the seed accounts file /run/secrets/seed_accounts`.

5. Check that it started:

   ```bash
   docker logs mountain-hut    # the demo slots and bookings, "Database reset completed." and "Server listening ..."
   ```

   Then open `http://localhost:5173` and log in with an account from `seed-accounts.json`.

### Use the system

| URL | Description |
|---|---|
| `http://localhost:5173` | Web application |
| `http://localhost:3000/api/v1` | REST API |
| `http://localhost:8025` | Mailpit: emails sent by the system, such as booking confirmations and password reset links (no real email is ever sent) |

Keep the ports as they are: the web application calls the API on port 3000, and the API accepts requests only from port 5173.

### Accounts file

`seed-accounts.json` is a JSON array of accounts:

| Field | Required for | Description |
|---|---|---|
| `role` | everyone | `warden`, `employee` or `hiker` |
| `email`, `password`, `name` | everyone | Login and display name |
| `mobile` | hikers | Mobile number |
| `notes`, `emergency_contact` | optional, hikers only | Free text |

- The file must contain at least one account. Every hiker in the file may get some random demo bookings (see [Demo data](#demo-data)).
- Unknown fields are rejected.
- The accounts are created only together with the database (first start). Editing the file later has no effect unless you [reset the database](#manage-the-installation); after a successful first start the file is no longer read.
- If seeding fails (for example an invalid file), the backend stops with the error and retries on the next start, once the file is fixed.

### Demo data

When the database is created (first start, or after a reset), it is filled with random demo data:

- slots for the next 3 days, 1 to 3 per day, each with 1 to 6 tables of 2 to 8 seats; about half of them have one of 4 demo menus, the others have no menu yet;
- bookings for the hikers in `seed-accounts.json` and for a few temporary hikers (people without an account), with random party sizes and dietary requirements;
- hikes for some of the hikers in `seed-accounts.json`, each one of 3 demo hikes: registered (not started yet), active or overdue.

The data is different at every reset. To get the same data again:

1. Copy the seed from the logs (`Random seed: ...` in `docker logs mountain-hut`), or choose any text.
2. Put it in `.env`: `SEED_RANDOM_SEED=<seed>`.
3. Reset the database.

Only the dates and times change: slots and bookings always start from the day of the reset, and hike times are relative to the moment of the reset.

### Manage the installation

| Task | Command |
|---|---|
| Stop / start | `docker stop mountain-hut` / `docker start mountain-hut` |
| Run a specific release | Replace `latest` with its version in step 4, e.g. `1.0.0` |
| Reset the database (deletes all data) | `docker rm -f mountain-hut && docker volume rm mountain-hut-data`, then repeat step 4 |

## Development

For contributors: run the system from the source code. To install and use it, see [Install and run](#install-and-run).

### Setup

Requires Node 22 or newer and Docker. From the repository root, create the two secret files from the templates and replace every value (both are gitignored):

```bash
cp .env.example .env                                # session secret
cp seed-accounts.example.json seed-accounts.json    # demo accounts
```

### Run with Docker

Builds the image from the source code and starts it like [Install and run](#install-and-run), using the two files above:

```bash
docker compose up --build
```

### Run without Docker

1. Start Mailpit, which catches the emails sent by the backend:

   ```bash
   docker run --rm -d --name mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit:v1.27.0
   ```

2. Start the backend on `http://localhost:3000` (`npm run dev` reads `../.env`, database resets read `../seed-accounts.json`):

   ```bash
   cd backend
   npm install
   npm run dev
   ```

   The database is created and seeded on the first run. To recreate it (this also recreates the demo accounts from `seed-accounts.json` and new random [demo data](#demo-data)):

   ```bash
   RESET_DB=true npm run dev
   ```

3. Start the frontend on `http://localhost:5173`:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

Email settings (environment variables): `SMTP_HOST` (default `localhost`), `SMTP_PORT` (default `1025`) and `MAIL_FROM` (default `Mountain Hut <no-reply@mountainhut.local>`). `CLIENT_ORIGIN` (default `http://localhost:5173`) is the address of the frontend: the API accepts requests only from it, and password reset links point to it.

### Tests

Backend tests run on an in-memory database with their own accounts and fixed slots and bookings instead of random ones (`backend/src/tests/fixtures/test.env` sets `SEED_MODE=fixed` and points to `backend/src/tests/fixtures/seed-accounts.json`), never the real `.env`:

```bash
cd backend
npm test
```

End-to-end tests: Playwright starts everything they need, namely Mailpit (with Docker, or reusing one already listening on port 8025, whose emails the tests read), the backend on a fresh in-memory database and the frontend.

First time:

```bash
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
cd e2e && npm install
npx playwright install chromium
```

Every time, with Docker running and ports 3000 and 5173 free (stop the `mountain-hut` container and any `npm run dev`):

```bash
cd e2e
npm test
```

## Repository layout

```
backend/    Server: REST API and database
frontend/   Client: web user interface
e2e/        End-to-end tests: full user flows across frontend and backend
docs/       Project documentation
```

## Documentation

- [Architecture](docs/architecture.md): components and backend layers
- [API](docs/api.md): REST endpoints
- [Database](docs/database.md): schema, rules and SQL scripts
- [Stack](docs/stack.md): libraries and tools used by backend, frontend and E2E tests
- [Working agreement](docs/working-agreement.md): branches, commits, pull requests

## License

We want our project to be used commercially by mountain huts.
We want to be credited when the code gets modified and redistributed.
We are free to use any license based on npm packages used to build this project.

Considering these main motivations, we choose to adopt the EUPL-1.2 license, included in the root directory of the repository inside the [LICENSE](LICENSE) file.
