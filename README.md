# Mountain Hut

## Documentation

- [Architecture](docs/architecture.md): components and backend layers
- [API](docs/api.md): REST endpoints
- [Database](docs/database.md): schema, rules and SQL scripts
- [Stack](docs/stack.md): libraries and tools used by backend, frontend and E2E tests
- [Working agreement](docs/working-agreement.md): branches, commits, pull requests

## License motivations

We want our project to be used commercially by mountain huts.
We want to be credited when the code gets modified and redistributed.
We are free to use any license based on npm packages used to build this project.

Considering these main motivations, we choose to adopt the EUPL-1.2 license, included in the root directory of the repository inside the [LICENSE](LICENSE) file.

## Repository layout

```
backend/    Server: REST API and database
frontend/   Client: web user interface
e2e/        End-to-end tests: full user flows across frontend and backend
docs/       Project documentation
```

## Running with Docker

The whole system runs in a single Docker image: web application, REST API and Mailpit.

### Secrets and demo accounts

Two files in the repository root hold the secrets, and neither is committed. Create them from the templates and replace every value:

```bash
cp .env.example .env                                # session secret
cp seed-accounts.example.json seed-accounts.json    # demo accounts
```

In `seed-accounts.json`, every account has `role` (`warden`, `employee` or `hiker`), `email`, `password` and `name`. Hikers also need `mobile` and can have `notes` and `emergency_contact`. The demo bookings belong to the 3rd and 4th accounts in the file, so those must be hikers.

The container reads both files at startup; the image never contains them. The demo accounts are created only together with the database (first start), so editing them later requires resetting the database (see below). If seeding fails (for example an invalid `seed-accounts.json`), the backend stops with the error and retries seeding on the next start, once the file is fixed. After a successful first start, `seed-accounts.json` is no longer read.

### Run the published image

Requires only Docker and the two files above. Run it from the repository root:

```bash
docker run -d --name mountain-hut --env-file .env -v "$PWD/seed-accounts.json:/run/secrets/seed_accounts:ro" -p 5173:5173 -p 3000:3000 -p 8025:8025 -v mountain-hut-data:/app/data ghcr.io/swe2-group-11/mountain-hut:latest
```

To run a specific release, replace `latest` with its version, e.g. `1.0.0`.
Stop it with `docker stop mountain-hut` and start it again with `docker start mountain-hut`.

### Build and run from the source code

```bash
docker compose up --build
```

### Use the system

| URL | Description |
|---|---|
| `http://localhost:5173` | Web application |
| `http://localhost:3000/api/v1` | REST API |
| `http://localhost:8025` | Mailpit: booking confirmation emails |

Keep the ports as they are: the web application calls the API on port 3000, and the API accepts requests only from port 5173.

Log in with the demo accounts defined in `seed-accounts.json`.

### Database

The SQLite database is stored in the `mountain-hut-data` Docker volume. It is created and seeded on the first start (whenever it has no tables yet) and kept on later starts. To reset it:

```bash
docker rm -f mountain-hut
docker volume rm mountain-hut-data
```

### Email in development

Booking confirmations are sent over SMTP. In the Docker image, Mailpit catches every email: open `http://localhost:8025` to read them. No real email is ever sent.

Without Docker (for example with `npm run dev`), start Mailpit on its own:

```bash
docker run --rm -d --name mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit:v1.27.0
```

Settings (environment variables): `SMTP_HOST` (default `localhost`), `SMTP_PORT` (default `1025`) and `MAIL_FROM` (default `Mountain Hut <no-reply@mountainhut.local>`).

The end-to-end tests (`cd e2e && npm test`) read the confirmation emails from Mailpit: Playwright starts it with Docker, or reuses one already listening on port 8025.

## Backend

### Getting started

Requires Node 22 or newer, plus `.env` and `seed-accounts.json` in the repository root (see [Secrets and demo accounts](#secrets-and-demo-accounts)). `npm run dev` and `npm start` read `../.env`; database resets read `../seed-accounts.json`.

```bash
cd backend
npm install
npm run dev
```

The database is created and seeded on the first run. To recreate it (this also recreates the demo accounts from `seed-accounts.json`):

```bash
RESET_DB=true npm run dev
```

The server listens on `http://localhost:3000`.

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start in development mode with auto-restart |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run the compiled server |
| `npm run lint` | Lint with oxlint |
| `npm run typecheck` | Type-check without emitting files |
| `npm test` | Run tests once |
| `npm run test:watch` | Run tests in watch mode |

## Frontend

### Getting started

```bash
cd frontend
npm install
npm run dev
```

The application runs on `http://localhost:5173`.

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server with HMR |
| `npm run build` | Type-check and compile production bundle |
| `npm run lint` | Lint with oxlint |
| `npm run preview` | Preview production build locally |

## E2E tests

Playwright starts everything the tests need: Mailpit (with Docker), the backend on a fresh in-memory database seeded at start, and the frontend.

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

### Scripts

| Command | Description |
|---|---|
| `npm test` | Run all tests |