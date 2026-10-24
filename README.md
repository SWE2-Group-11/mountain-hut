# Mountain Hut

## Documentation

- [Architecture](docs/architecture.md): components and backend layers
- [API](docs/api.md): REST endpoints
- [Database](docs/database.md): schema, rules and SQL scripts
- [Working agreement](docs/working-agreement.md): branches, commits, pull requests

## Repository layout

```
backend/    Server: REST API and database
frontend/   Client: web user interface
e2e/        End-to-end tests: full user flows across frontend and backend
docs/       Project documentation
```

## Backend

### Tech stack

| Package | Used for |
|---|---|
| `express` | HTTP server and REST routes |
| `cors` | Allows the frontend origin to call the API |
| `better-sqlite3` | SQLite database (synchronous driver) |
| `express-session` | Session cookies |
| `passport`, `passport-local` | Login with username and password |
| `typescript` | Type checking and compilation (pinned to v6) |
| `tsx` | Runs TypeScript directly in development, with auto-restart |
| `oxlint` | Linting |
| `vitest` | Test runner |
| `supertest` | HTTP API integration tests |
| `socket.io-client` | Testing socket events |
| `@types/*` | Type definitions for Node, Express, cors, better-sqlite3 and supertest |

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

### Demo accounts



## Frontend

### Tech stack

| Package | Used for |
|---|---|
| `react` | UI library |
| `vite` | Development server and bundler with HMR |
| `typescript` | Type checking and compilation (pinned to v6) |
| `oxlint` | Linting |

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

### Project structure

```
src/
  main.tsx      React entry point
  App.tsx       Root application component
  index.css     Global styles
```
