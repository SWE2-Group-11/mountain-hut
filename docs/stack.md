# Stack

## Backend

| Package | Used for |
|---|---|
| `express` | HTTP server and REST routes |
| `cors` | Allows the frontend origin to call the API |
| `express-session` | Session cookies |
| `passport`, `passport-local` | Login with email and password |
| `better-sqlite3` | SQLite database (synchronous driver) |
| `zod` | Validation of request bodies and parameters |
| `luxon` | Dates and times in the hut timezone |
| `nodemailer` | Sending booking confirmation emails over SMTP |
| `morgan` | HTTP request logging |
| `typescript` | Type checking and compilation (v6) |
| `tsx` | Runs TypeScript directly in development, with auto-restart |
| `oxlint` | Linting |
| `vitest`, `@vitest/coverage-v8` | Test runner and coverage |
| `supertest` | HTTP API integration tests |
| `@types/*` | Type definitions |

## Frontend

| Package | Used for |
|---|---|
| `react`, `react-dom` | UI library |
| `react-router-dom` | Client-side routing |
| `tailwindcss`, `@tailwindcss/postcss`, `postcss`, `autoprefixer` | Styling |
| `lucide-react` | Icons |
| `vite`, `@vitejs/plugin-react` | Development server with HMR and bundler |
| `typescript` | Type checking and compilation (v6) |
| `oxlint` | Linting |

## E2E tests

| Package | Used for |
|---|---|
| `@playwright/test` | End-to-end tests in the browser |

## Docker image

| Tool | Used for |
|---|---|
| `tini` | Runs as PID 1: forwards stop signals to all processes and reaps zombies |
| `serve` | Serves the built frontend bundle |
| Mailpit | Catches every email the system sends |