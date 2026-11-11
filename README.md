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

### Run the published image

Requires only Docker.

```bash
docker run -d --name mountain-hut -p 5173:5173 -p 3000:3000 -p 8025:8025 -v mountain-hut-data:/app/data ghcr.io/swe2-group-11/mountain-hut:latest
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

All demo accounts have the password `password`.

| Email | Role |
|---|---|
| `warden@mountainhut.test` | Warden |
| `employee@mountainhut.test` | Employee |
| `mario@mountainhut.test` | Hiker |
| `laura@mountainhut.test` | Hiker |

### Database

The SQLite database is stored in the `mountain-hut-data` Docker volume. It is created and seeded on the first start and kept on later starts. To reset it:

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

Requires Node 22 or newer.

```bash
cd backend
npm install
npm run dev
```

If running for the first time or in need to recreate the database:

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