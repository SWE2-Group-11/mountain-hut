import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "../../database/database";
import { getHikerById, searchHikersFilter } from "../../dao/hiker-dao";

/*
UNIT tests for hiker-dao.
Covered: the cases of getHikerById and searchHikersFilter not already covered in reserve-for-hiker-dao.unit.test.ts
(query shape, no criteria, phone normalisation and escaping, email passed as is).
The database is mocked.
*/

vi.mock("../../database/database", () => ({
    db: { prepare: vi.fn() },
}));

const statement = { all: vi.fn(), get: vi.fn() };
let prepared: string[];

// the named parameters given to the search query
const paramsOf = () => statement.all.mock.calls[0][0];

beforeEach(() => {
    vi.resetAllMocks();
    prepared = [];
    vi.mocked(db.prepare).mockImplementation(((sql: string) => {
        prepared.push(sql);
        return statement;
    }) as any);
    statement.all.mockReturnValue([]);
    statement.get.mockReturnValue(undefined);
});

describe("getHikerById (unit)", () => {
    it("reads only registered hikers, never temporary ones", () => {
        // a temporary hiker has no account id, so it cannot be found by id
        getHikerById(3);

        expect(prepared[0]).not.toMatch(/temporary_hiker/);
        expect(prepared[0]).toMatch(/WHERE h\.account_id = \?/);
    });

    it("returns no booking id for a registered hiker", () => {
        // booking_id identifies only temporary hikers
        getHikerById(3);

        expect(prepared[0]).toMatch(/NULL AS booking_id/);
    });
});

describe("searchHikersFilter (unit)", () => {
    it("passes no criterion when none is given", () => {
        // the route requires at least one criterion: the DAO itself does not filter anything
        searchHikersFilter({});

        expect(paramsOf()).toEqual({ name: null, phone: null, email: null });
    });

    it("searches registered and temporary hikers in a single query", () => {
        searchHikersFilter({ name: "Mario" });

        expect(prepared).toHaveLength(1);
        expect(prepared[0]).toMatch(/FROM hiker h/);
        expect(prepared[0]).toMatch(/UNION ALL/);
        expect(prepared[0]).toMatch(/FROM temporary_hiker t/);
    });

    it("compares the stored phone numbers without spaces", () => {
        // a typed "333123" must find a stored "+39 333 123 4567"
        searchHikersFilter({ phone: "333123" });

        expect(prepared[0]).toMatch(/REPLACE\(h\.mobile_number, ' ', ''\)/);
        expect(prepared[0]).toMatch(/REPLACE\(t\.mobile_number, ' ', ''\)/);
    });

    it("removes every kind of whitespace from the typed phone", () => {
        searchHikersFilter({ phone: " 333\t123\n45 " });

        expect(paramsOf().phone).toBe("%33312345%");
    });

    it("matches % and _ in the phone literally", () => {
        // these characters are wildcards in SQL: typed by the employee, they must not match everything
        searchHikersFilter({ phone: "33%_" });

        expect(paramsOf().phone).toBe("%33\\%\\_%");
    });

    it("keeps the spaces inside the name", () => {
        // "Mario Rossi" must not match "MarioRossi" or "Mario Bianchi Rossi"
        searchHikersFilter({ name: "Mario Rossi" });

        expect(paramsOf().name).toBe("%Mario Rossi%");
    });

    it("passes the email as is, without wildcards or escaping", () => {
        // the email is an exact match: it is not a LIKE pattern
        searchHikersFilter({ email: "mario_1%@mountainhut.test" });

        expect(paramsOf().email).toBe("mario_1%@mountainhut.test");
    });

    it("declares the backslash as the escape character of every LIKE", () => {
        // without ESCAPE the escaped wildcards would still be wildcards
        searchHikersFilter({ name: "a" });

        expect(prepared[0].match(/LIKE @\w+ ESCAPE '\\'/g)).toHaveLength(4);
    });
});