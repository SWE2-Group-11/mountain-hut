import Database from "better-sqlite3";
import { DateTime } from "luxon";
import { pickOne, pickSome, type Random } from "./random";

/*
 * Random demo hikes, seeded in SEED_MODE=random after the accounts.
 * Some of the hikers register one of the demo hikes below.
 */

const DEMO_HIKES = [
    { destination: "Viso Mozzo", route: "via the Chiaretto lake", points: ["Pian del Re", "Chiaretto lake"],
      expected: 4, departed: -2, arrived: null },            // active
    { destination: "Colle delle Traversette", route: "via the Po springs", points: ["Pian del Re", "Fiorenza lake"],
      expected: -1, departed: -6, arrived: null },           // active, overdue
    { destination: "Monte Granero", route: "along the ridge from the hut", points: [],
      expected: 24, departed: null, arrived: null },         // registered, not departed yet
] as const;

const at = (hours: number | null): string | null =>
    hours === null ? null : DateTime.utc().plus({ hours }).toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'");

/**
 * Inserts one random demo hike for some of the hikers.
 * @param db The database being seeded, inside the reset transaction.
 * @param random Source of randomness in [0, 1), injectable for testing.
 */
export const insertRandomHikes = (db: Database.Database, random: Random = Math.random): void => {
    const hikers = db.prepare<[], { account_id: number }>("SELECT account_id FROM hiker").all();
    const insertHike = db.prepare(`INSERT INTO hike (hiker_id, destination, route, expected_arrival_at, departed_at, arrived_at)
                                   VALUES (?, ?, ?, ?, ?, ?)`);
    const insertPoint = db.prepare("INSERT INTO passage_point (hike_id, position, name) VALUES (?, ?, ?)");

    for (const { account_id } of pickSome(random, hikers)) {
        const h = pickOne(random, DEMO_HIKES);
        const { lastInsertRowid: id } = insertHike.run(account_id, h.destination, h.route, at(h.expected), at(h.departed), at(h.arrived));
        h.points.forEach((name, i) => insertPoint.run(id, i + 1, name));
    }
};