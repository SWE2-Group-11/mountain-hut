import { app } from "./app";
import { APP_PORT, RESET_DB } from "./config/config";
import { isDatabaseEmpty, resetDatabase } from "./database/database.js";

// Also on an empty database, so a start whose seeding failed is retried on the next start
if (RESET_DB || isDatabaseEmpty()) {
    resetDatabase();
    console.log("Database reset completed.");
}

// Activate the server
app.listen(APP_PORT, () => {
    console.log(`Server listening on http://localhost:${APP_PORT}`);
});