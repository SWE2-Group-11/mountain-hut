#!/bin/sh
# Starts the whole system in the container: Mailpit, frontend and backend.

# Mailpit: catches every email sent by the backend (SMTP 1025, web UI 8025)
mailpit &

# Frontend: production bundle served on port 5173
# -s falls back to index.html for client-side routes, -L disables per-request logs
serve -s -L -l tcp://0.0.0.0:5173 /app/frontend/dist &

# Print the URLs once the services have started
(
  sleep 5
  echo
  echo "Mountain Hut is running:"
  echo "  Web application   http://localhost:5173"
  echo "  REST API          http://localhost:3000/api/v1"
  echo "  Mailpit (emails)  http://localhost:8025"
  echo
) &

# Backend: creates and seeds the database when it has no tables yet (first start), keeps it otherwise
cd /app/backend
exec node dist/index.js