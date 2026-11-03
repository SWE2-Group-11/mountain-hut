import { type CreateSlotRequestDTO } from "../../models/dto/slot-dto";
import { describe, expect, it } from "vitest";
import {
    DateSchema,
    CreateSlotRequestSchema,
    GetConfigurationsRequestSchema,
    GetAvailabilityRequestSchema,
    GetSlotsRequestSchema,
} from "../../models/dto/slot-dto";

const DAY = "2030-06-15";

describe("DateSchema — shared calendar-date validation", () => {
    it.each([
        "2030-06-15",
        "2028-02-29",
        "2030-01-01",
        "2030-12-31",
    ])("accepts the real calendar date %s", (date) => {
        expect(DateSchema.safeParse(date).success).toBe(true);
    });

    it.each([
        "2026-02-30",
        "2027-02-29",
        "2030-04-31",
        "2030-13-01",
        "2030-00-01",
        "2030-06-00",
        "2030-06-32",
        "15-06-2030",
        "2030-6-15",
        "2030-06-5",
        "2030-06-15T12:00:00",
        "",
    ])("rejects the invalid date %s", (date) => {
        expect(DateSchema.safeParse(date).success).toBe(false);
    });

    it.each([null, undefined, 20300615, true])(
        "rejects a date with the wrong type: %s",
        (date) => {
            expect(DateSchema.safeParse(date).success).toBe(false);
        },
    );
});

describe("GET /slots — GetSlotsRequestSchema", () => {
    it("accepts the required query date", () => {
        expect(GetSlotsRequestSchema.parse({ date: DAY })).toEqual({ date: DAY });
    });

    it("rejects a missing query date", () => {
        expect(GetSlotsRequestSchema.safeParse({}).success).toBe(false);
    });

    it.each(["", "2030-02-30", "15/06/2030"])(
        "rejects the invalid query date %s",
        (date) => {
            expect(GetSlotsRequestSchema.safeParse({ date }).success).toBe(false);
        },
    );

    it("rejects a repeated query date represented as an array", () => {
        expect(GetSlotsRequestSchema.safeParse({
            date: [DAY, "2030-06-16"],
        }).success).toBe(false);
    });
});

describe("GET /slots/availability — GetAvailabilityRequestSchema", () => {
    // Query values always arrive as strings
    const QUERY = { date: DAY, slot: "12:00", partySize: "4" };

    it("accepts the query and turns partySize into a number", () => {
        // Why: the controller and the DAO expect a numeric party size
        const result = GetAvailabilityRequestSchema.safeParse(QUERY);

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toEqual({ date: DAY, slot: "12:00", partySize: 4 });
        }
    });

    it.each(["date", "slot", "partySize"])(
        "rejects a missing query parameter: %s",
        (field) => {
            // Why: all three parameters are required by api.md
            const query: Record<string, unknown> = { ...QUERY };
            delete query[field];

            expect(GetAvailabilityRequestSchema.safeParse(query).success).toBe(false);
        },
    );

    it.each(["00:00", "09:30", "12:00", "23:59"])(
        "accepts the HH:mm time %s",
        (slot) => {
            // Why: slot start times are stored as zero-padded HH:mm
            expect(GetAvailabilityRequestSchema.safeParse({
                ...QUERY, slot,
            }).success).toBe(true);
        },
    );

    it.each(["24:00", "12:60", "9:30", "12:00:00", "12:00x", ""])(
        "rejects an invalid or non-padded time: %s",
        (slot) => {
            // Why: a badly formatted time could never match a stored slot
            expect(GetAvailabilityRequestSchema.safeParse({
                ...QUERY, slot,
            }).success).toBe(false);
        },
    );

    it.each(["2026-02-30", "2030-6-15", "15/06/2030", ""])(
        "rejects the invalid query date %s",
        (date) => {
            // Why: the shared DateSchema must be applied here too
            expect(GetAvailabilityRequestSchema.safeParse({
                ...QUERY, date,
            }).success).toBe(false);
        },
    );

    it.each(["1", "4", "20"])(
        "accepts the positive integer partySize %s",
        (partySize) => {
            // Why: any positive whole number of people is a valid party
            expect(GetAvailabilityRequestSchema.safeParse({
                ...QUERY, partySize,
            }).success).toBe(true);
        },
    );

    it.each(["0", "-1", "2.5", "abc", "", " ", "true"])(
        "rejects a non-positive, fractional or non-numeric partySize: %s",
        (partySize) => {
            // Why: these cannot be a number of people
            expect(GetAvailabilityRequestSchema.safeParse({
                ...QUERY, partySize,
            }).success).toBe(false);
        },
    );

    it.each([
        { field: "partySize", value: ["2", "3"] },
        { field: "date", value: [DAY, "2030-06-16"] },
    ])("rejects a repeated query $field represented as an array", ({ field, value }) => {
        // Why: ?partySize=2&partySize=3 is ambiguous and must not be guessed
        expect(GetAvailabilityRequestSchema.safeParse({
            ...QUERY, [field]: value,
        }).success).toBe(false);
    });

    it("drops unknown query parameters", () => {
        // Why: extra values like hiker_id must never reach the controller
        const result = GetAvailabilityRequestSchema.parse({
            ...QUERY, extra: "x", hiker_id: "1",
        });

        expect(result).toEqual({ date: DAY, slot: "12:00", partySize: 4 });
        expect(result).not.toHaveProperty("hiker_id");
    });
});

describe("GetAvailabilityRequestSchema: strict partySize (fix MH-55)", () => {
    const CLEAR_MESSAGE = "partySize must be a positive integer";
    const query = (partySize: unknown) => ({ date: DAY, slot: "12:00", partySize });

    it.each(["0x10", "1e2", " 7 ", "07", "4.0"])(
        "rejects the partySize %j, which is not written as plain digits",
        (partySize) => {
            // before the fix, Number() turned these into valid numbers (16, 100, 7, 7, 4)
            // Arrange
            const input = query(partySize);

            // Act
            const result = GetAvailabilityRequestSchema.safeParse(input);

            // Assert
            expect(result.success).toBe(false);
        },
    );

    it("rejects a repeated partySize represented as an array", () => {
        // ?partySize=4&partySize=5 arrives as an array: before the fix ["4"] became 4
        // Arrange
        const input = query(["4"]);

        // Act
        const result = GetAvailabilityRequestSchema.safeParse(input);

        // Assert
        expect(result.success).toBe(false);
    });

    it("rejects a partySize given as a number", () => {
        // query values always arrive as strings, so a number means the input is not a query
        // Arrange
        const input = query(4);

        // Act
        const result = GetAvailabilityRequestSchema.safeParse(input);

        // Assert
        expect(result.success).toBe(false);
    });

    it("rejects a missing partySize with the clear message", () => {
        // the user must read a helpful message, not "received NaN"
        // Arrange
        const input = { date: DAY, slot: "12:00" };

        // Act
        const result = GetAvailabilityRequestSchema.safeParse(input);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.issues[0].message).toBe(CLEAR_MESSAGE);
    });

    it.each([
        ["1", 1],
        ["12", 12],
    ])("accepts the partySize %j and turns it into the number %d", (partySize, expected) => {
        // the controller and the DAO work with a number, not with a string
        // Arrange
        const input = query(partySize);

        // Act
        const result = GetAvailabilityRequestSchema.safeParse(input);

        // Assert
        expect(result.success).toBe(true);
        expect(result.data?.partySize).toBe(expected);
        expect(typeof result.data?.partySize).toBe("number");
    });

    it("rejects a partySize above the safe integer range", () => {
        // "99999999999999999999" is only digits, but as a number it can't be stored exactly (it becomes 1e20)
        // Arrange
        const input = query("99999999999999999999");

        // Act
        const result = GetAvailabilityRequestSchema.safeParse(input);

        // Assert
        expect(result.success).toBe(false);
    });
});

// api.md: POST /slots request body
describe("CreateSlotRequestSchema", () => {
    const base = { date: "2026-12-01", startTime: "12:00", endTime: "14:00" };
    const tables = [{ tableNumber: 1, seats: 4 }, { tableNumber: 2, seats: 2 }];
    const copyFrom = { date: "2026-11-30", startTime: "12:00" };

    it("accepts a body with tables", () => {
        expect(CreateSlotRequestSchema.safeParse({ ...base, tables }).success).toBe(true);
    });

    it("accepts a body with copyFrom", () => {
        expect(CreateSlotRequestSchema.safeParse({ ...base, copyFrom }).success).toBe(true);
    });

    it("rejects both tables and copyFrom", () => {
        expect(CreateSlotRequestSchema.safeParse({ ...base, tables, copyFrom }).success).toBe(false);
    });

    it("rejects neither tables nor copyFrom", () => {
        expect(CreateSlotRequestSchema.safeParse(base).success).toBe(false);
    });

    it.each(["date", "startTime", "endTime"])("rejects a missing %s", (field) => {
        const body: Record<string, unknown> = { ...base, tables };
        delete body[field];
        expect(CreateSlotRequestSchema.safeParse(body).success).toBe(false);
    });

    it.each(["2026-13-01", "2026-02-30", "01-12-2026", "2026-12-1"])("rejects invalid date %s", (date) => {
        expect(CreateSlotRequestSchema.safeParse({ ...base, date, tables }).success).toBe(false);
    });

    it.each(["24:00", "12:60", "9:00", "12-00"])("rejects invalid time %s", (startTime) => {
        expect(CreateSlotRequestSchema.safeParse({ ...base, startTime, endTime: "23:59", tables }).success).toBe(false);
    });

    it("rejects endTime equal to startTime", () => {
        expect(CreateSlotRequestSchema.safeParse({ ...base, endTime: "12:00", tables }).success).toBe(false);
    });

    it("rejects endTime before startTime", () => {
        expect(CreateSlotRequestSchema.safeParse({ ...base, endTime: "11:00", tables }).success).toBe(false);
    });

    it("rejects an empty tables array", () => {
        expect(CreateSlotRequestSchema.safeParse({ ...base, tables: [] }).success).toBe(false);
    });

    it("rejects duplicate tableNumber", () => {
        const dup = [{ tableNumber: 1, seats: 4 }, { tableNumber: 1, seats: 2 }];
        expect(CreateSlotRequestSchema.safeParse({ ...base, tables: dup }).success).toBe(false);
    });

    it.each([
        [{ tableNumber: 0, seats: 4 }],
        [{ tableNumber: -1, seats: 4 }],
        [{ tableNumber: 1.5, seats: 4 }],
        [{ tableNumber: 1, seats: 0 }],
        [{ tableNumber: 1, seats: 2.5 }],
        [{ tableNumber: "1", seats: 4 }],
        [{ seats: 4 }],
        [{ tableNumber: 1 }],
    ])("rejects invalid table %o", (table) => {
        expect(CreateSlotRequestSchema.safeParse({ ...base, tables: [table] }).success).toBe(false);
    });

    it("rejects the old tableId field name", () => {
        expect(CreateSlotRequestSchema.safeParse({ ...base, tables: [{ tableId: 1, seats: 4 }] }).success).toBe(false);
    });

    it.each([
        { startTime: "12:00" },
        { date: "2026-11-30" },
        { date: "2026-02-30", startTime: "12:00" },
        { date: "2026-11-30", startTime: "25:00" },
    ])("rejects invalid copyFrom %o", (cf) => {
        expect(CreateSlotRequestSchema.safeParse({ ...base, copyFrom: cf }).success).toBe(false);
    });
});

// api.md: GET /slots/configurations query parameters
describe("GetConfigurationsRequestSchema", () => {
    it("defaults limit to 20 when nothing is given", () => {
        const result = GetConfigurationsRequestSchema.safeParse({});
        expect(result.success).toBe(true);
        expect(result.data).toEqual({ limit: 20 });
    });

    it("coerces limit from a query string", () => {
        expect(GetConfigurationsRequestSchema.parse({ limit: "5" }).limit).toBe(5);
    });

    it("accepts limit 100 and rejects 101", () => {
        expect(GetConfigurationsRequestSchema.safeParse({ limit: "100" }).success).toBe(true);
        expect(GetConfigurationsRequestSchema.safeParse({ limit: "101" }).success).toBe(false);
    });

    it.each(["0", "-1", "1.5", "abc"])("rejects invalid limit %s", (limit) => {
        expect(GetConfigurationsRequestSchema.safeParse({ limit }).success).toBe(false);
    });

    it("accepts from equal to to (inclusive range)", () => {
        expect(GetConfigurationsRequestSchema.safeParse({ from: "2026-12-01", to: "2026-12-01" }).success).toBe(true);
    });

    it("accepts only from or only to", () => {
        expect(GetConfigurationsRequestSchema.safeParse({ from: "2026-12-01" }).success).toBe(true);
        expect(GetConfigurationsRequestSchema.safeParse({ to: "2026-12-01" }).success).toBe(true);
    });

    it("rejects from after to", () => {
        expect(GetConfigurationsRequestSchema.safeParse({ from: "2026-12-02", to: "2026-12-01" }).success).toBe(false);
    });

    it.each([{ from: "2026-02-30" }, { to: "not-a-date" }])("rejects invalid date %o", (q) => {
        expect(GetConfigurationsRequestSchema.safeParse(q).success).toBe(false);
    });
});

const CAPACITY_DAY = "2030-06-15";
const CAPACITY_SOURCE = { date: "2030-06-14", startTime: "19:00" };
const CAPACITY_TABLES = [{ tableNumber: 3, seats: 4 }, { tableNumber: 7, seats: 6 }];
const CAPACITY_REQUEST = {
    date: CAPACITY_DAY, startTime: "12:15", endTime: "14:00", tables: CAPACITY_TABLES,
} satisfies CreateSlotRequestDTO;

describe("CreateSlotRequestSchema — validation boundaries", () => {
    it.each([null, undefined, [], "slot"].map((body) => ({ body })))("rejects a non-object body: $body", ({ body }) => {
        expect(CreateSlotRequestSchema.safeParse(body).success).toBe(false);
    });

    it("accepts a real leap day", () => {
        expect(CreateSlotRequestSchema.safeParse({ ...CAPACITY_REQUEST, date: "2032-02-29" }).success).toBe(true);
    });

    it.each([null, 20300615])("rejects a date that is not a string: %j", (date) => {
        expect(CreateSlotRequestSchema.safeParse({ ...CAPACITY_REQUEST, date }).success).toBe(false);
    });

    it.each(["12:00:00", "12:00x", "", null, 1200])("rejects malformed startTime %j", (startTime) => {
        expect(CreateSlotRequestSchema.safeParse({ ...CAPACITY_REQUEST, startTime }).success).toBe(false);
    });

    it.each(["24:00", "12:60", "9:30", "12:00:00", "12:00x", "", null, 1200])("validates endTime independently: %j", (endTime) => {
        expect(CreateSlotRequestSchema.safeParse({ ...CAPACITY_REQUEST, startTime: "00:00", endTime }).success).toBe(false);
    });

    it.each([
        { startTime: "00:00", endTime: "00:01" },
        { startTime: "23:58", endTime: "23:59" },
        { startTime: "00:00", endTime: "23:59" },
    ])("accepts same-day boundary interval $startTime–$endTime", (interval) => {
        expect(CreateSlotRequestSchema.safeParse({ ...CAPACITY_REQUEST, ...interval }).success).toBe(true);
    });

    it("rejects an interval crossing midnight", () => {
        expect(CreateSlotRequestSchema.safeParse({ ...CAPACITY_REQUEST, startTime: "23:00", endTime: "01:00" }).success).toBe(false);
    });

    it.each([
        { label: "null tables", tables: null },
        { label: "null copyFrom", copyFrom: null },
    ])("rejects $label", ({ label: _label, ...source }) => {
        expect(CreateSlotRequestSchema.safeParse({
            date: CAPACITY_DAY, startTime: "12:15", endTime: "14:00", ...source,
        }).success).toBe(false);
    });

    it.each([{}, "tables", [null]].map((tables) => ({ tables })))("rejects invalid table collection $tables", ({ tables }) => {
        expect(CreateSlotRequestSchema.safeParse({ ...CAPACITY_REQUEST, tables }).success).toBe(false);
    });

    it.each([
        { field: "tableNumber", value: null }, { field: "tableNumber", value: true },
        { field: "seats", value: -1 }, { field: "seats", value: "4" },
        { field: "seats", value: null }, { field: "seats", value: true },
    ])("rejects table $field=$value", ({ field, value }) => {
        expect(CreateSlotRequestSchema.safeParse({
            ...CAPACITY_REQUEST, tables: [{ tableNumber: 1, seats: 4, [field]: value }],
        }).success).toBe(false);
    });

    it("accepts equal capacities on distinct table numbers, including one seat", () => {
        expect(CreateSlotRequestSchema.safeParse({
            ...CAPACITY_REQUEST, tables: [{ tableNumber: 1, seats: 1 }, { tableNumber: 2, seats: 1 }],
        }).success).toBe(true);
    });

    it.each([
        [], "previous-slot", { date: [CAPACITY_SOURCE.date], startTime: "19:00" },
        { date: CAPACITY_SOURCE.date, startTime: ["19:00"] },
    ].map((copyFrom) => ({ copyFrom })))("rejects malformed or repeated copy source $copyFrom", ({ copyFrom }) => {
        expect(CreateSlotRequestSchema.safeParse({
            date: CAPACITY_DAY, startTime: "12:15", endTime: "14:00", copyFrom,
        }).success).toBe(false);
    });

    it("removes unknown body and nested table fields", () => {
        expect(CreateSlotRequestSchema.parse({
            ...CAPACITY_REQUEST, role: "warden", tables: [{ tableNumber: 1, seats: 4, availableSeats: 99 }],
        })).toEqual({ ...CAPACITY_REQUEST, tables: [{ tableNumber: 1, seats: 4 }] });
    });
});

describe("GetConfigurationsRequestSchema — query validation", () => {
    it("accepts the minimum limit, parsed from the query string", () => {
        expect(GetConfigurationsRequestSchema.parse({ limit: "1" })).toEqual({ limit: 1 });
    });

    it.each(["", " "])("rejects an empty limit: %j", (limit) => {
        expect(GetConfigurationsRequestSchema.safeParse({ limit }).success).toBe(false);
    });

    describe.each(["from", "to"] as const)("%s", (field) => {
        it.each([null, [CAPACITY_DAY]].map((value) => ({ value })))("rejects a non-string or repeated date $value", ({ value }) => {
            expect(GetConfigurationsRequestSchema.safeParse({ [field]: value }).success).toBe(false);
        });
    });

    it("drops unknown query fields", () => {
        expect(GetConfigurationsRequestSchema.parse({ offset: "10", hiker_id: "1" })).toEqual({ limit: 20 });
    });
});
