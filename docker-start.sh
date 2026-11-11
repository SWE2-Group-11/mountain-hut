#!/bin/sh
# Starts the whole system in the container: Mailpit, frontend and backend.

# Mailpit: catches every email sent by the backend (SMTP 1025, web UI 8025)
mailpit &

# Frontend: production bundle served on port 5173
(cd /app/frontend && exec npx vite preview --host 0.0.0.0 --port 5173 --strictPort) &

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

# Backend: create and seed the database on the first start, keep it on later starts
if [ ! -f "$DB_PATH" ]; then
  export RESET_DB=true
fi
cd /app/backend
exec node dist/index.js