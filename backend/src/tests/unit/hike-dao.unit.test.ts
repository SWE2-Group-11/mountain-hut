import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "../../database/database";
import { getPopularHikes, saveHike, getHikesByHiker, HikeInput } from "../../dao/hike-dao";
import { Hike } from "../../models/entities/hike";
import { PopularHike } from "../../models/entities/popular_hike";

/*
UNIT tests for hike-dao.
The database is mocked: we check the parameters passed to the query and how rows are mapped.
The SQL itself is covered by the integration tests.
*/

vi.mock("../../database/database", () => ({ db: { prepare: vi.fn(), transaction: vi.fn() } }));

const statement = { get: vi.fn(), all: vi.fn(), run: vi.fn() };

beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(db.prepare).mockReturnValue(statement as any);
    vi.mocked(db.transaction).mockImplementation(((fn: () => unknown) => fn) as any);
});

describe("getPopularHikes (unit)", () => {
    const hikeRows = [
        { id: 2, destination: "Monte Granero", route: "along the ridge" },
        { id: 1, destination: "Viso Mozzo", route: "via the Chiaretto lake" },
    ];
    const pointRows = [
        { popular_hike_id: 1, name: "Pian del Re" },
        { popular_hike_id: 1, name: "Chiaretto lake" },
    ];

    it("returns each popular hike with its own passage points, keeping the order", () => {
        // 1st all() = hikes, 2nd all() = passage points of all the hikes
        statement.all.mockReturnValueOnce(hikeRows).mockReturnValueOnce(pointRows);

        expect(getPopularHikes()).toStrictEqual([
            new PopularHike(2, "Monte Granero", "along the ridge", []),
            new PopularHike(1, "Viso Mozzo", "via the Chiaretto lake", ["Pian del Re", "Chiaretto lake"]),
        ]);
    });

    it("passes the limit to both queries", () => {
        statement.all.mockReturnValue([]);

        getPopularHikes(5);

        expect(statement.all).toHaveBeenNthCalledWith(1, 5);
        expect(statement.all).toHaveBeenNthCalledWith(2, 5);
    });

    it("passes a negative limit when none is given (no limit in SQLite)", () => {
        statement.all.mockReturnValue([]);

        getPopularHikes();

        expect(statement.all).toHaveBeenNthCalledWith(1, -1);
        expect(statement.all).toHaveBeenNthCalledWith(2, -1);
    });

    it("returns an empty list when there is no popular hike", () => {
        statement.all.mockReturnValue([]);

        expect(getPopularHikes()).toEqual([]);
    });
});

describe("saveHike (unit)", () => {
    const input: HikeInput = {
        destination: "Viso Mozzo",
        route: "via the Chiaretto lake",
        passage_points: ["Pian del Re", "Chiaretto lake"],
        planned_departure_at: "2026-11-02T07:00:00Z",
        expected_return_at: "2026-11-02T15:00:00Z",
    };

    it("inserts the hike first, then one row per passage point in route order, in a transaction", () => {
        statement.run.mockReturnValueOnce({ lastInsertRowid: BigInt(7) });

        saveHike(3, input);

        expect(db.transaction).toHaveBeenCalledTimes(1);
        expect(statement.run).toHaveBeenCalledTimes(3);
        expect(statement.run).toHaveBeenNthCalledWith(1,
            3, "Viso Mozzo", "via the Chiaretto lake", "2026-11-02T07:00:00Z", "2026-11-02T15:00:00Z");
        expect(statement.run).toHaveBeenNthCalledWith(2, 7, 1, "Pian del Re");
        expect(statement.run).toHaveBeenNthCalledWith(3, 7, 2, "Chiaretto lake");
    });

    it("returns the new hike with the generated id and no completion time", () => {
        statement.run.mockReturnValueOnce({ lastInsertRowid: BigInt(7) });

        const hike = saveHike(3, input);

        expect(hike).toStrictEqual(new Hike(7, 3, "Viso Mozzo", "via the Chiaretto lake",
            ["Pian del Re", "Chiaretto lake"], "2026-11-02T07:00:00Z", "2026-11-02T15:00:00Z", null));
        expect(hike.passage_points).not.toBe(input.passage_points);
    });

    it("inserts only the hike when it has no passage points", () => {
        statement.run.mockReturnValueOnce({ lastInsertRowid: BigInt(7) });

        expect(saveHike(3, { ...input, passage_points: [] }).passage_points).toEqual([]);
        expect(statement.run).toHaveBeenCalledTimes(1);
    });

    it("lets a database failure through instead of swallowing it", () => {
        const boom = new Error("UNIQUE constraint failed");
        statement.run
            .mockReturnValueOnce({ lastInsertRowid: BigInt(7) }) // hike inserted
            .mockImplementationOnce(() => {
                throw boom; // first passage point fails
            });

        expect(() => saveHike(3, input)).toThrow(boom);
    });
});

describe("getHikesByHiker (unit)", () => {
    const hikeRows = [
        { id: 9, hiker_id: 3, destination: "Monte Granero", route: "along the ridge",
          planned_departure_at: "2026-11-05T07:00:00Z", expected_return_at: "2026-11-05T15:00:00Z", completed_at: null },
        { id: 7, hiker_id: 3, destination: "Viso Mozzo", route: "via the Chiaretto lake",
          planned_departure_at: "2026-11-02T07:00:00Z", expected_return_at: "2026-11-02T15:00:00Z",
          completed_at: "2026-11-02T14:00:00Z" },
    ];
    const pointRows = [
        { hike_id: 7, name: "Pian del Re" },
        { hike_id: 7, name: "Chiaretto lake" },
    ];

    it("returns each hike with its own passage points and completion time, keeping the order", () => {
        // 1st all() = hikes, 2nd all() = passage points of all the hikes
        statement.all.mockReturnValueOnce(hikeRows).mockReturnValueOnce(pointRows);

        expect(getHikesByHiker(3)).toStrictEqual([
            new Hike(9, 3, "Monte Granero", "along the ridge", [],
                "2026-11-05T07:00:00Z", "2026-11-05T15:00:00Z", null),
            new Hike(7, 3, "Viso Mozzo", "via the Chiaretto lake", ["Pian del Re", "Chiaretto lake"],
                "2026-11-02T07:00:00Z", "2026-11-02T15:00:00Z", "2026-11-02T14:00:00Z"),
        ]);
    });

    it("queries both the hikes and the passage points by hiker", () => {
        statement.all.mockReturnValue([]);

        getHikesByHiker(3);

        expect(statement.all).toHaveBeenNthCalledWith(1, 3);
        expect(statement.all).toHaveBeenNthCalledWith(2, 3);
    });

    it("returns an empty list when the hiker has no hike", () => {
        statement.all.mockReturnValue([]);

        expect(getHikesByHiker(3)).toEqual([]);
    });

    it("lets a database failure through instead of swallowing it", () => {
        const boom = new Error("database is locked");
        statement.all.mockImplementation(() => {
            throw boom;
        });

        expect(() => getHikesByHiker(3)).toThrow(boom);
    });
});