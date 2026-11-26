import { db } from "../database/database";
import { Hike } from "../models/entities/hike";
import { PopularHike } from "../models/entities/popular_hike";

export type HikeInput = {
    destination: string;
    route: string;
    passage_points: string[];       // names in route order, validated by the caller
    planned_departure_at: string;   // UTC, YYYY-MM-DDTHH:MM:SSZ
    expected_return_at: string;     // UTC, YYYY-MM-DDTHH:MM:SSZ, after planned_departure_at
};

type HikeRow = {
    id: number;
    hiker_id: number;
    destination: string;
    route: string;
    planned_departure_at: string;
    expected_return_at: string;
    completed_at: string | null;
};

// Groups passage point rows, already ordered by parent and position, into parent id -> names
const groupNames = <T extends { name: string }>(rows: T[], parentId: (row: T) => number): Map<number, string[]> => {
    const groups = new Map<number, string[]>();
    for (const row of rows) {
        const id = parentId(row);
        const names = groups.get(id) ?? [];
        names.push(row.name);
        groups.set(id, names);
    }
    return groups;
};

/**
 * Retrieves the predefined hikes a hiker can start from.
 * @param limit The maximum number of popular hikes to return, a positive integer
 * validated by the caller; all of them if omitted.
 * @returns At most `limit` popular hikes with their passage points in route order,
 * ordered by destination (empty if none).
 */
export const getPopularHikes = (limit?: number): PopularHike[] => {
    const sqlLimit = limit ?? -1;   // in SQLite a negative LIMIT means no limit

    const hikes = db.prepare<[number], { id: number; destination: string; route: string }>(
        `SELECT id, destination, route
         FROM popular_hike
         ORDER BY destination, id
         LIMIT ?`).all(sqlLimit);

    const points = groupNames(
        db.prepare<[number], { popular_hike_id: number; name: string }>(
            `SELECT hp.popular_hike_id, p.name
             FROM has_pop_passage_point hp
             JOIN pop_passage_point p ON p.id = hp.pop_passage_point_id
             WHERE hp.popular_hike_id IN (
                 SELECT id FROM popular_hike ORDER BY destination, id LIMIT ?
             )
             ORDER BY hp.popular_hike_id, hp.position`).all(sqlLimit),
        (r) => r.popular_hike_id);

    return hikes.map((h) => new PopularHike(h.id, h.destination, h.route, points.get(h.id) ?? []));
};

/**
 * Persists a new hike with its passage points, atomically.
 * @param hiker_id The account id of the hiker registering the hike.
 * @param input The hike data, validated by the caller.
 * @returns The new hike with its generated id, its passage points and no completion time.
 */
export const saveHike = (hiker_id: number, input: HikeInput): Hike =>
    db.transaction(() => {
        const result = db.prepare(
            `INSERT INTO hike (hiker_id, destination, route, planned_departure_at, expected_return_at)
             VALUES (?, ?, ?, ?, ?)`)
            .run(hiker_id, input.destination, input.route, input.planned_departure_at, input.expected_return_at);
        const id = Number(result.lastInsertRowid);

        const insertPoint = db.prepare("INSERT INTO passage_point (hike_id, position, name) VALUES (?, ?, ?)");
        input.passage_points.forEach((name, i) => insertPoint.run(id, i + 1, name));

        return new Hike(id, hiker_id, input.destination, input.route, [...input.passage_points],
            input.planned_departure_at, input.expected_return_at, null);
    })();

/**
 * Retrieves all the hikes registered by a hiker, in any state.
 * @param hiker_id The account id of the hiker.
 * @returns The hikes with their passage points in route order,
 * most recent departure first (empty if none).
 */
export const getHikesByHiker = (hiker_id: number): Hike[] => {
    const rows = db.prepare<[number], HikeRow>(
        `SELECT id, hiker_id, destination, route, planned_departure_at, expected_return_at, completed_at
         FROM hike
         WHERE hiker_id = ?
         ORDER BY planned_departure_at DESC, id DESC`).all(hiker_id);

    const points = groupNames(
        db.prepare<[number], { hike_id: number; name: string }>(
            `SELECT pp.hike_id, pp.name
             FROM passage_point pp
             JOIN hike h ON h.id = pp.hike_id
             WHERE h.hiker_id = ?
             ORDER BY pp.hike_id, pp.position`).all(hiker_id),
        (r) => r.hike_id);

    return rows.map((r) => new Hike(r.id, r.hiker_id, r.destination, r.route, points.get(r.id) ?? [],
        r.planned_departure_at, r.expected_return_at, r.completed_at));
};