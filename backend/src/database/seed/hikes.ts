import Database from "better-sqlite3";
import { DateTime } from "luxon";
import { pickOne, pickSome, type Random } from "./random";

/*
 * Random demo hikes, seeded in SEED_MODE=random after the accounts.
 * Some of the hikers register one of the demo hikes below.
 */

const DEMO_HIKES = [
    { destination: "Viso Mozzo", route: "via the Chiaretto lake", points: ["Pian del Re", "Chiaretto lake"],
      departure: -2, return: 4 },          // active
    { destination: "Colle delle Traversette", route: "via the Po springs", points: ["Pian del Re", "Fiorenza lake"],
      departure: -6, return: -1 },         // active, overdue
    { destination: "Monte Granero", route: "along the ridge from the hut", points: [],
      departure: 24, return: 30 },         // registered
] as const;

const at = (hours: number | null): string | null =>
    hours === null ? null : DateTime.utc().plus({ hours }).toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'");

/**
 * Inserts one random demo hike for some of the hikers.
 * @param db The database being seeded, inside the reset transaction.
 * @param random Source of randomness in [0, 1), injectable for testing.
 */
export const insertRandomHikes = (db: Database.Database, random: Random = Math.random): void => {
    const hikers = db.prepare<[], { account_id: number }>("SELECT account_id FROM hiker ORDER BY account_id").all();
    const insertHike = db.prepare(`INSERT INTO hike (hiker_id, destination, route, planned_departure_at, expected_return_at)
                                   VALUES (?, ?, ?, ?, ?)`);
    const insertPoint = db.prepare("INSERT INTO passage_point (hike_id, position, name) VALUES (?, ?, ?)");

    for (const { account_id } of pickSome(random, hikers)) {
        const h = pickOne(random, DEMO_HIKES);
        const { lastInsertRowid: id } = insertHike.run(account_id, h.destination, h.route, at(h.departure), at(h.return));
        h.points.forEach((name, i) => insertPoint.run(id, i + 1, name));
    }
};