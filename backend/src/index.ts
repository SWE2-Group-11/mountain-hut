import { app } from "./app";
import { APP_PORT, RESET_DB } from "./config/config";
import { resetDatabase } from "./database/database.js";

if (RESET_DB) {
    resetDatabase();
    console.log("Database reset completed.");
}

// Activate the server
app.listen(APP_PORT, () => {
    console.log(`Server listening on http://localhost:${APP_PORT}`);
});