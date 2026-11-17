import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { db, inTransaction } from "../../database/database";
import { copyWeeklySchedule, hasBookingsInWeek } from "../../dao/schedule_dao";

/*
UNIT tests for the DAO of MH-09 "Repeat a weekly schedule" (an employee copies the slots of one week into other weeks).
Covered: hasBookingsInWeek and copyWeeklySchedule.
The database is mocked: db.prepare gives back a fake statement for each SQL, picked by a keyword in the SQL,
and every get/run goes into one shared log, so we can check what is read and written and in which order.
The SQL itself (date shifting, Monday check, columns, DST, rollback) is covered by the integration tests.
*/

vi.mock("../../database/database", () => ({
    db: { prepare: vi.fn(), transaction: vi.fn() },
    inTransaction: vi.fn(),
}));

// all real Mondays
const SOURCE = "2026-11-02";
const T1 = "2026-11-09";
const T2 = "2026-11-16";
const T3 = "2026-11-23";
const TUESDAY = "2026-11-03";

// slots in the source week
const SLOTS = 14;

const boom = new Error("SQLITE_BUSY: database is locked");

// the statements of the DAO, recognised by a keyword in their SQL. Order matters: slot_table before slot
const ROUTES = [
    ["validate", /AS valid/],
    ["countSource", /COUNT\(\*\)/],
    ["bookings", /FROM seated_at/],
    ["deleteTables", /DELETE FROM slot_table/],
    ["deleteSlots", /DELETE FROM slot\b/],
    ["copyTables", /INSERT INTO slot_table/],
    ["copySlots", /INSERT INTO slot\b/],
] as const;

type Name = (typeof ROUTES)[number][0];
type Call = { name: Name; op: "get" | "run"; params: Record<string, unknown>; sql: string };

const nameOf = (sql: string): Name => {
    const route = ROUTES.find(([, pattern]) => pattern.test(sql));
    if (!route) throw new Error(`Unexpected SQL in the test: ${sql}`);
    return route[0];
};

// what get/run answer, per statement. Set with mockReturnValueOnce in call order
const answer = (): Record<Name, Mock> => ({
    validate: vi.fn(),
    countSource: vi.fn(),
    bookings: vi.fn(),
    deleteTables: vi.fn(),
    deleteSlots: vi.fn(),
    copyTables: vi.fn(),
    copySlots: vi.fn(),
});
const get = answer();
const run = answer();

let calls: Call[];
let prepared: string[];

// --- setup helpers ---

// n valid week starts (the source first, then each target)
const validWeeks = (n: number) => {
    for (let i = 0; i < n; i++) get.validate.mockReturnValueOnce({ valid: 1 });
};

const sourceSlots = (count: number) => get.countSource.mockReturnValueOnce({ count });

// one answer per target week: true = the week has a booking
const bookingsFound = (...found: boolean[]) =>
    found.forEach((f) => get.bookings.mockReturnValueOnce(f ? { found: 1 } : undefined));

// everything is valid, the source has slots and no target has bookings
const happyPath = (targets: string[], count = SLOTS) => {
    const unique = [...new Set(targets)];
    validWeeks(1 + unique.length);
    sourceSlots(count);
    bookingsFound(...unique.map(() => false));
};

// --- reading the log ---

const runs = () => calls.filter((c) => c.op === "run").map((c) => [c.name, c.params]);

const getsOf = (name: Name) => calls.filter((c) => c.op === "get" && c.name === name).map((c) => c.params);

// the 4 writes that replace one target week with the source week
const block = (target: string) => [
    ["deleteTables", { weekStart: target }],
    ["deleteSlots", { weekStart: target }],
    ["copySlots", { source: SOURCE, target }],
    ["copyTables", { source: SOURCE, target }],
];

const errorOf = (action: () => unknown): unknown => {
    try {
        action();
    } catch (error) {
        return error;
    }
    return undefined;
};

beforeEach(() => {
    vi.resetAllMocks();
    calls = [];
    prepared = [];
    vi.mocked(db.prepare).mockImplementation(((sql: string) => {
        prepared.push(sql);
        const name = nameOf(sql);
        return {
            get: (params: Record<string, unknown>) => {
                calls.push({ name, op: "get", params, sql });
                return get[name](params);
            },
            run: (params: Record<string, unknown>) => {
                calls.push({ name, op: "run", params, sql });
                return run[name](params);
            },
        };
    }) as any);
    vi.mocked(db.transaction).mockImplementation(((callback: () => unknown) => callback) as any);
    vi.mocked(inTransaction).mockImplementation(((callback: () => unknown) => callback()) as any);
});

describe("hasBookingsInWeek", () => {
    it("returns true when the week has a booking", () => {
        // a week with bookings must not be overwritten by a copy
        bookingsFound(true);

        const result = hasBookingsInWeek(T1);

        expect(result).toBe(true);
    });

    it("returns false when the week has no booking", () => {
        // an empty week can be replaced; this was always true before the MH-136 fix
        bookingsFound(false);

        const result = hasBookingsInWeek(T1);

        expect(result).toBe(false);
    });

    it("looks for the bookings of the given week", () => {
        // bookings are stored as seats in seated_at, and the check must use the week asked for
        bookingsFound(false);

        hasBookingsInWeek(T1);

        expect(prepared).toHaveLength(1);
        expect(prepared[0]).toMatch(/FROM seated_at/);
        expect(getsOf("bookings")).toEqual([{ weekStart: T1 }]);
    });

    it("only reads and never writes", () => {
        // it is just a check: it must not change any data
        bookingsFound(true);

        hasBookingsInWeek(T1);

        expect(runs()).toEqual([]);
    });

    it("passes a database error to the caller", () => {
        // the caller must know the check failed, not get a wrong answer
        get.bookings.mockImplementationOnce(() => {
            throw boom;
        });

        const error = errorOf(() => hasBookingsInWeek(T1));

        expect(error).toBe(boom);
    });
});

describe("copyWeeklySchedule: transaction", () => {
    it("runs everything in one transaction", () => {
        // the JSDoc says all target weeks are copied in the same transaction
        happyPath([T1, T2]);

        copyWeeklySchedule(SOURCE, [T1, T2]);

        expect(inTransaction).toHaveBeenCalledTimes(1);
    });

    it("touches the database only inside the transaction", () => {
        // if the transaction never runs its callback, nothing must be read or written outside of it
        vi.mocked(inTransaction).mockReturnValue({ status: "source_empty" } as any);

        const result = copyWeeklySchedule(SOURCE, [T1]);

        expect(result).toEqual({ status: "source_empty" });
        expect(db.prepare).not.toHaveBeenCalled();
        expect(calls).toEqual([]);
    });

    it("passes a transaction error to the caller", () => {
        // e.g. BEGIN IMMEDIATE fails because the database is busy
        vi.mocked(inTransaction).mockImplementation(() => {
            throw boom;
        });

        const error = errorOf(() => copyWeeklySchedule(SOURCE, [T1]));

        expect(error).toBe(boom);
    });
});

describe("copyWeeklySchedule: input rules", () => {
    it("refuses an empty list of target weeks", () => {
        // the story is about copying a week into another week: at least one target is needed
        const error = errorOf(() => copyWeeklySchedule(SOURCE, []));

        expect(error).toBeInstanceOf(RangeError);
        expect(db.prepare).not.toHaveBeenCalled();
        expect(runs()).toEqual([]);
    });

    it("refuses to copy a week into itself", () => {
        // copying a week into itself would delete it first and then copy nothing
        validWeeks(2);
        sourceSlots(SLOTS);
        bookingsFound(false);

        const error = errorOf(() => copyWeeklySchedule(SOURCE, [SOURCE]));

        expect(error).toBeInstanceOf(RangeError);
        expect(runs()).toEqual([]);
    });

    it("refuses the whole copy if one of the targets is the source", () => {
        // the copy is all-or-nothing: the valid target must not be copied either
        happyPath([T1, SOURCE]);

        const error = errorOf(() => copyWeeklySchedule(SOURCE, [T1, SOURCE]));

        expect(error).toBeInstanceOf(RangeError);
        expect(runs()).toEqual([]);
    });

    it("refuses a source week that does not start on a Monday", () => {
        // the JSDoc says dates must be Mondays in YYYY-MM-DD format
        get.validate.mockReturnValueOnce({ valid: 0 });
        validWeeks(1);
        sourceSlots(SLOTS);
        bookingsFound(false);

        const error = errorOf(() => copyWeeklySchedule(TUESDAY, [T1]));

        expect(error).toBeInstanceOf(RangeError);
        expect(getsOf("countSource")).toEqual([]);
        expect(getsOf("bookings")).toEqual([]);
        expect(runs()).toEqual([]);
    });

    it("refuses a source date when the check returns no row", () => {
        // a missing answer must not count as a valid date
        get.validate.mockReturnValueOnce(undefined);
        validWeeks(1);
        sourceSlots(SLOTS);
        bookingsFound(false);

        const error = errorOf(() => copyWeeklySchedule("02/11/2026", [T1]));

        expect(error).toBeInstanceOf(RangeError);
        expect(runs()).toEqual([]);
    });

    it("refuses a target week that does not start on a Monday", () => {
        // a target must be a Monday too, otherwise the days would be shifted
        validWeeks(1);
        get.validate.mockReturnValueOnce({ valid: 0 });
        sourceSlots(SLOTS);
        bookingsFound(false);

        const error = errorOf(() => copyWeeklySchedule(SOURCE, [TUESDAY]));

        expect(error).toBeInstanceOf(RangeError);
        expect(runs()).toEqual([]);
    });

    it("refuses the whole copy if only the second target is invalid", () => {
        // all-or-nothing: the first, valid target must not be copied
        validWeeks(2);
        get.validate.mockReturnValueOnce({ valid: 0 });
        sourceSlots(SLOTS);
        bookingsFound(false, false);

        const error = errorOf(() => copyWeeklySchedule(SOURCE, [T1, "2026-02-30"]));

        expect(error).toBeInstanceOf(RangeError);
        expect(runs()).toEqual([]);
    });

    it("checks the source week first, then every target week", () => {
        // every date given by the employee must be checked
        happyPath([T1, T2]);

        copyWeeklySchedule(SOURCE, [T1, T2]);

        expect(getsOf("validate")).toEqual([{ weekStart: SOURCE }, { weekStart: T1 }, { weekStart: T2 }]);
    });
});

describe("copyWeeklySchedule: duplicate targets", () => {
    it("copies a week listed twice only once", () => {
        // the same target week twice is the same request: it must be copied once and reported once
        happyPath([T1, T1, T2]);

        const result = copyWeeklySchedule(SOURCE, [T1, T1, T2]);

        expect(runs()).toEqual([...block(T1), ...block(T2)]);
        expect(getsOf("bookings")).toEqual([{ weekStart: T1 }, { weekStart: T2 }]);
        expect(result).toEqual({ status: "copied", targetWeekStart: [T1, T2], slotsPerWeek: SLOTS });
    });
});

describe("copyWeeklySchedule: empty source week", () => {
    it("does nothing when the source week has no slots", () => {
        // copying an empty week would only wipe the targets
        validWeeks(2);
        sourceSlots(0);
        bookingsFound(false);

        const result = copyWeeklySchedule(SOURCE, [T1]);

        expect(result).toEqual({ status: "source_empty" });
        expect(runs()).toEqual([]);
    });

    it("counts the slots of the source week", () => {
        // the number of slots copied per week comes from the source week
        happyPath([T1]);

        copyWeeklySchedule(SOURCE, [T1]);

        expect(getsOf("countSource")).toEqual([{ weekStart: SOURCE }]);
    });
});

describe("copyWeeklySchedule: targets with bookings", () => {
    it("refuses when the target week has bookings", () => {
        // the JSDoc says a target is replaced only if it has no bookings
        validWeeks(2);
        sourceSlots(SLOTS);
        bookingsFound(true);

        const result = copyWeeklySchedule(SOURCE, [T1]);

        expect(result).toEqual({ status: "target_has_bookings", weekStart: T1 });
        expect(runs()).toEqual([]);
    });

    it("checks every target before changing any of them", () => {
        // the first target must not be replaced if the second one has bookings
        validWeeks(3);
        sourceSlots(SLOTS);
        bookingsFound(false, true);

        const result = copyWeeklySchedule(SOURCE, [T1, T2]);

        expect(result).toEqual({ status: "target_has_bookings", weekStart: T2 });
        expect(runs()).toEqual([]);
    });

    it("checks the bookings of each target week before the first write", () => {
        // every target is checked, and all checks happen before anything is deleted
        happyPath([T1, T2]);

        copyWeeklySchedule(SOURCE, [T1, T2]);

        expect(getsOf("bookings")).toEqual([{ weekStart: T1 }, { weekStart: T2 }]);
        const lastCheck = calls.map((c) => c.name).lastIndexOf("bookings");
        const firstWrite = calls.findIndex((c) => c.op === "run");
        expect(lastCheck).toBeLessThan(firstWrite);
    });

    it("names the first target week that has bookings", () => {
        // the employee needs to know which week blocks the copy
        validWeeks(4);
        sourceSlots(SLOTS);
        bookingsFound(false, true, true);

        const result = copyWeeklySchedule(SOURCE, [T1, T2, T3]);

        expect(result).toEqual({ status: "target_has_bookings", weekStart: T2 });
    });
});

describe("copyWeeklySchedule: copy", () => {
    it("replaces the target week with the source schedule", () => {
        // old tables, then old slots are deleted (tables point to slots), then slots and tables are copied
        happyPath([T1]);

        copyWeeklySchedule(SOURCE, [T1]);

        expect(runs()).toEqual(block(T1));
    });

    it("copies the schedule into several weeks, one after the other", () => {
        // the story: repeat a schedule across multiple weeks
        happyPath([T1, T2, T3]);

        copyWeeklySchedule(SOURCE, [T1, T2, T3]);

        expect(runs()).toEqual([...block(T1), ...block(T2), ...block(T3)]);
    });

    it("returns the copied weeks and the number of slots per week", () => {
        // the caller shows the employee what was copied
        happyPath([T1, T2]);

        const result = copyWeeklySchedule(SOURCE, [T1, T2]);

        expect(result).toEqual({ status: "copied", targetWeekStart: [T1, T2], slotsPerWeek: SLOTS });
    });

    it("never copies or deletes bookings", () => {
        // the JSDoc says bookings are never copied: only slots and tables are written
        happyPath([T1, T2]);

        copyWeeklySchedule(SOURCE, [T1, T2]);

        const bookingWrites = prepared.filter((sql) =>
            /(INSERT INTO|DELETE FROM|UPDATE)\s+(seated_at|booking|temporary_hiker|dietary_requirement)\b/i.test(sql),
        );
        expect(bookingWrites).toEqual([]);
    });

    it("binds every named parameter each statement uses", () => {
        // a name used in the SQL but not bound makes the statement throw (MH-136 bug 1)
        happyPath([T1, T2]);

        copyWeeklySchedule(SOURCE, [T1, T2]);

        for (const call of calls) {
            const used = [...call.sql.matchAll(/@(\w+)/g)].map((m) => m[1]);
            for (const name of used) {
                expect(call.params, `${call.name} uses @${name}`).toHaveProperty(name);
            }
        }
    });
});

describe("copyWeeklySchedule: database errors", () => {
    it("passes an error from the copy to the caller and stops", () => {
        // the transaction must roll back, so nothing after the error may run
        happyPath([T1, T2]);
        run.copySlots.mockImplementationOnce(() => {
            throw boom;
        });

        const error = errorOf(() => copyWeeklySchedule(SOURCE, [T1, T2]));

        expect(error).toBe(boom);
        expect(runs()).toEqual(block(T1).slice(0, 3));
    });

    it("passes an error from the booking check to the caller", () => {
        // if the check fails, the target must not be replaced
        validWeeks(2);
        sourceSlots(SLOTS);
        get.bookings.mockImplementationOnce(() => {
            throw boom;
        });

        const error = errorOf(() => copyWeeklySchedule(SOURCE, [T1]));

        expect(error).toBe(boom);
        expect(runs()).toEqual([]);
    });

    it("passes a database error through and not as a RangeError", () => {
        // the JSDoc keeps the two apart: RangeError means bad input, a database error must stay what it is
        get.validate.mockImplementationOnce(() => {
            throw boom;
        });

        const error = errorOf(() => copyWeeklySchedule(SOURCE, [T1]));

        expect(error).toBe(boom);
        expect(error).not.toBeInstanceOf(RangeError);
    });
});
