import { describe, it, expect, vi, beforeEach } from "vitest";
import { db, inTransaction } from "../../database/database";
import { getBooking, saveBooking, type TemporaryHikerInput } from "../../dao/booking-dao";
import { getHikerById, searchHikersFilter, type HikerProfile } from "../../dao/hiker-dao";
import { createHikerAccount, type HikerInput } from "../../dao/account-dao";
import { replaceRequirements, getDietaryRequirementsByBooking, type RequirementInput } from "../../dao/dietary-requirement-dao";
import { generatePasswordHash } from "../../services/password-service";
import { Booking } from "../../models/entities/booking";
import { SeatedAt } from "../../models/entities/seated_at";
import { Hiker } from "../../models/entities/account";
import { DietaryRequirement } from "../../models/entities/dietary_requirement";

/*
UNIT tests for the DAO of MH-07 "Reserve for a hiker" (an employee books a table for a hiker).
Covered: saveBooking and getBooking for a temporary hiker, getHikerById, searchHikersFilter,
and createHikerAccount with "must change password" (account created by staff).
The database is mocked.
*/

vi.mock("../../database/database", () => ({
    db: { prepare: vi.fn(), transaction: vi.fn() },
    inTransaction: vi.fn(),
}));

vi.mock("../../dao/dietary-requirement-dao", () => ({
    getDietaryRequirementsByBooking: vi.fn(),
    replaceRequirements: vi.fn(),
}));

vi.mock("../../services/password-service", () => ({
    generatePasswordHash: vi.fn(),
    hashPassword: vi.fn(),
}));

const DATE = "2026-11-02";
const START = "19:00";
const BOOKING_ID = 42;
const HIKER_ID = 5;
const ACCOUNT_ID = 7;

const TEMP: TemporaryHikerInput = { full_name: "Paolo Verdi", mobile_number: "+39 340 111 2233" };

const statement = { all: vi.fn(), run: vi.fn(), get: vi.fn() };

type Write = { table: string; params: unknown[] };
let writes: Write[];
let lastSql: string;
let prepared: string[];

const tableOf = (sql: string): string => /INSERT INTO (\w+)/.exec(sql)?.[1] ?? sql;

const table = (table_number: number, seats: number, free_seats = seats) => ({ table_number, seats, free_seats });

const requirement = (allergy_flag: boolean, description: string): RequirementInput => ({ allergy_flag, description });

const REQUIREMENTS = [requirement(true, "1 peanut allergy"), requirement(false, "2 vegetarians")];

const bookTemporary = (party_size: number, requirements?: RequirementInput[], hiker: TemporaryHikerInput = TEMP) =>
    saveBooking(hiker, DATE, START, party_size, requirements);

const boom = new Error("SQLITE_BUSY: database is locked");

beforeEach(() => {
    vi.resetAllMocks();
    writes = [];
    lastSql = "";
    prepared = [];
    vi.mocked(db.prepare).mockImplementation(((sql: string) => {
        lastSql = sql;
        prepared.push(sql);
        return statement;
    }) as any);
    vi.mocked(db.transaction).mockImplementation(((callback: () => unknown) => callback) as any);
    vi.mocked(inTransaction).mockImplementation(((callback: () => unknown) => callback()) as any);
    vi.mocked(getDietaryRequirementsByBooking).mockReturnValue([]);
    statement.run.mockImplementation(((...params: unknown[]) => {
        writes.push({ table: tableOf(lastSql), params });
        return { changes: 1, lastInsertRowid: BOOKING_ID };
    }) as any);
});

describe("saveBooking: temporary hiker (MH-07)", () => {
    it("returns a booking with no hiker account for a temporary hiker", () => {
        // a temporary hiker has no account, so the booking is not linked to one
        statement.all.mockReturnValue([table(1, 4)]);

        const result = bookTemporary(2)!;

        expect(result.booking).toBeInstanceOf(Booking);
        expect(result.booking).toEqual(new Booking(BOOKING_ID, null));
    });

    it("saves the booking with an empty hiker id and creates no account", () => {
        // the story says a temporary hiker cannot log in: no account or hiker profile must be created
        statement.all.mockReturnValue([table(1, 4)]);

        bookTemporary(2);

        expect(writes[0]).toEqual({ table: "booking", params: [null] });
        expect(writes.map((w) => w.table)).not.toContain("account");
        expect(writes.map((w) => w.table)).not.toContain("hiker");
    });

    it("saves the name and phone of the temporary hiker linked to the new booking", () => {
        // the employee must find out later who the booking is for
        statement.all.mockReturnValue([table(1, 4)]);

        bookTemporary(2);

        const saved = writes.filter((w) => w.table === "temporary_hiker");
        expect(saved).toEqual([{ table: "temporary_hiker", params: [BOOKING_ID, "Paolo Verdi", "+39 340 111 2233"] }]);
    });

    it("saves a temporary hiker without a phone number", () => {
        // the story says the phone is optional. Only the name is required
        statement.all.mockReturnValue([table(1, 4)]);

        bookTemporary(2, [], { full_name: "Paolo Verdi", mobile_number: null });

        const saved = writes.find((w) => w.table === "temporary_hiker");
        expect(saved!.params).toEqual([BOOKING_ID, "Paolo Verdi", null]);
    });

    it("saves the temporary hiker right after the booking and before the seats", () => {
        // the temporary hiker refers to the booking, so the booking must exist first
        statement.all.mockReturnValue([table(1, 4), table(2, 6)]);

        bookTemporary(9);

        expect(writes).toEqual([
            { table: "booking", params: [null] },
            { table: "temporary_hiker", params: [BOOKING_ID, "Paolo Verdi", "+39 340 111 2233"] },
            { table: "seated_at", params: [BOOKING_ID, DATE, START, 2, 6] },
            { table: "seated_at", params: [BOOKING_ID, DATE, START, 1, 3] },
        ]);
    });

    it("saves one seating per assigned table for a temporary hiker", () => {
        // a temporary hiker gets the same table arrangement as a registered one
        statement.all.mockReturnValue([table(1, 4), table(2, 6)]);

        const result = bookTemporary(9)!;

        expect(statement.run).toHaveBeenCalledTimes(4);
        expect(result.seatings).toEqual([
            new SeatedAt(BOOKING_ID, DATE, START, 2, 6),
            new SeatedAt(BOOKING_ID, DATE, START, 1, 3),
        ]);
    });

    it("saves the dietary requirements for the booking of a temporary hiker", () => {
        // the reservation details are the same whoever the hiker is
        statement.all.mockReturnValue([table(1, 4)]);
        const expected = REQUIREMENTS.map((r, i) => new DietaryRequirement(i + 1, BOOKING_ID, r.allergy_flag, r.description));
        vi.mocked(replaceRequirements).mockReturnValue(expected);

        const result = bookTemporary(3, REQUIREMENTS)!;

        expect(replaceRequirements).toHaveBeenCalledTimes(1);
        expect(replaceRequirements).toHaveBeenCalledWith(BOOKING_ID, REQUIREMENTS);
        const lastWrite = Math.max(...statement.run.mock.invocationCallOrder);
        expect(vi.mocked(replaceRequirements).mock.invocationCallOrder[0]).toBeGreaterThan(lastWrite);
        expect(result.dietary_requirements).toEqual(expected);
    });

    it("does not touch the requirements when a temporary hiker declares none", () => {
        // a quick reservation without requirements is valid
        statement.all.mockReturnValue([table(1, 4)]);

        const result = bookTemporary(2, [])!;

        expect(replaceRequirements).not.toHaveBeenCalled();
        expect(result.dietary_requirements).toEqual([]);
    });

    it("returns null and saves nothing for a temporary hiker when the slot is full", () => {
        // no booking means no temporary hiker either: nothing must be left behind
        statement.all.mockReturnValue([table(1, 4), table(2, 6, 3)]);

        const result = bookTemporary(8, REQUIREMENTS);

        expect(result).toBeNull();
        expect(statement.run).not.toHaveBeenCalled();
        expect(replaceRequirements).not.toHaveBeenCalled();
    });

    it("returns null and saves nothing for a temporary hiker with a party of 0 or fewer people", () => {
        // a party must have at least one person
        statement.all.mockReturnValue([table(1, 4)]);

        const forZero = bookTemporary(0);
        const forNegative = bookTemporary(-1);

        expect(forZero).toBeNull();
        expect(forNegative).toBeNull();
        expect(statement.run).not.toHaveBeenCalled();
    });

    it("does not save a temporary hiker when the booking is for a registered hiker", () => {
        // a booking belongs to a hiker or to a temporary hiker, never both
        statement.all.mockReturnValue([table(1, 4)]);

        const result = saveBooking(HIKER_ID, DATE, START, 2)!;

        expect(prepared.some((sql) => sql.includes("temporary_hiker"))).toBe(false);
        expect(writes[0]).toEqual({ table: "booking", params: [HIKER_ID] });
        expect(result.booking).toEqual(new Booking(BOOKING_ID, HIKER_ID));
    });

    it("saves the temporary hiker inside the transaction", () => {
        // the transaction never runs its callback: nothing must be written outside of it
        vi.mocked(db.transaction).mockReturnValue((() => null) as any);

        bookTemporary(2, REQUIREMENTS);

        expect(db.transaction).toHaveBeenCalledTimes(1);
        expect(statement.run).not.toHaveBeenCalled();
        expect(replaceRequirements).not.toHaveBeenCalled();
    });

    it("lets a failure while saving the temporary hiker through instead of swallowing it", () => {
        // the error must reach the transaction, which then undoes the booking
        statement.all.mockReturnValue([table(1, 4)]);
        statement.run
            .mockImplementationOnce(((...params: unknown[]) => {
                writes.push({ table: tableOf(lastSql), params });
                return { changes: 1, lastInsertRowid: BOOKING_ID };
            }) as any)
            .mockImplementationOnce(() => {
                throw boom;
            });

        const act = () => bookTemporary(2, REQUIREMENTS);

        expect(act).toThrow(boom);
        expect(prepared.some((sql) => sql.includes("seated_at") && sql.includes("INSERT"))).toBe(false);
        expect(replaceRequirements).not.toHaveBeenCalled();
    });
});

describe("getHikerById (unit)", () => {
    const MARIO: HikerProfile = {
        id: 3,
        booking_id: null,
        full_name: "Mario Rossi",
        mobile_number: "+39 333 123 4567",
        email: "mario@mountainhut.test",
    };

    it("returns the profile of a registered hiker", () => {
        // the employee books for a hiker who is already in the system
        statement.get.mockReturnValue(MARIO);

        const result = getHikerById(3);

        expect(result).toEqual(MARIO);
    });

    it("looks the hiker up by account id", () => {
        // the hiker profile and the email are in two tables, so both must be read
        statement.get.mockReturnValue(MARIO);

        getHikerById(3);

        expect(statement.get).toHaveBeenCalledWith(3);
        expect(prepared[0]).toMatch(/FROM hiker/);
        expect(prepared[0]).toMatch(/JOIN account/);
    });

    it("returns null when no hiker has that id", () => {
        // null, not undefined, so the caller can answer "hiker not found"
        statement.get.mockReturnValue(undefined);

        const result = getHikerById(999);

        expect(result).toBeNull();
    });

    it("lets a database failure through instead of swallowing it", () => {
        // a broken database must give an error, not look like "hiker not found"
        statement.get.mockImplementation(() => {
            throw boom;
        });

        const act = () => getHikerById(3);

        expect(act).toThrow(boom);
    });
});

describe("searchHikersFilter (unit)", () => {
    const REGISTERED: HikerProfile = {
        id: 3,
        booking_id: null,
        full_name: "Mario Rossi",
        mobile_number: "+39 333 123 4567",
        email: "mario@mountainhut.test",
    };
    const TEMPORARY: HikerProfile = {
        id: null,
        booking_id: 4,
        full_name: "Paolo Verdi",
        mobile_number: "+39 340 111 2233",
        email: null,
    };

    // the named parameters given to the query
    const paramsOf = () => statement.all.mock.calls[0][0];

    beforeEach(() => {
        statement.all.mockReturnValue([]);
    });

    it("returns the hikers found by the query, registered and temporary", () => {
        // the story says the hiker can already be in the system, with or without an account
        statement.all.mockReturnValue([REGISTERED, TEMPORARY]);

        const result = searchHikersFilter({ name: "r" });

        expect(result).toEqual([REGISTERED, TEMPORARY]);
    });

    it("returns an empty list when nobody matches", () => {
        // a new hiker is not in the system yet
        const result = searchHikersFilter({ name: "Nobody" });

        expect(result).toEqual([]);
    });

    it("searches the name as a partial match", () => {
        // the employee may know only part of the name
        searchHikersFilter({ name: "ross" });

        expect(paramsOf()).toEqual({ name: "%ross%", phone: null, email: null });
    });

    it("searches the phone ignoring spaces", () => {
        // a phone number can be written with or without spaces
        searchHikersFilter({ phone: "333 123" });

        expect(paramsOf()).toEqual({ name: null, phone: "%333123%", email: null });
    });

    it("searches the email as an exact match", () => {
        // an email identifies exactly one account
        searchHikersFilter({ email: "mario@mountainhut.test" });

        expect(paramsOf()).toEqual({ name: null, phone: null, email: "mario@mountainhut.test" });
    });

    it("passes every given criterion so they are combined", () => {
        // more criteria narrow the search down
        searchHikersFilter({ name: "Mario", phone: "333", email: "mario@mountainhut.test" });

        expect(paramsOf()).toEqual({ name: "%Mario%", phone: "%333%", email: "mario@mountainhut.test" });
    });

    it("matches % and _ in the name literally", () => {
        // these characters are wildcards in SQL: typed by the employee, they must not match everything
        searchHikersFilter({ name: "50%_off" });

        expect(paramsOf().name).toBe("%50\\%\\_off%");
    });

    it("matches a backslash in the name literally", () => {
        // the backslash is the escape character, so it must be escaped too
        searchHikersFilter({ name: "a\\b" });

        expect(paramsOf().name).toBe("%a\\\\b%");
    });

    it("treats an empty name or phone as no filter", () => {
        // an empty text must not be used as a criterion
        searchHikersFilter({ name: "", phone: "", email: "mario@mountainhut.test" });

        expect(paramsOf()).toEqual({ name: null, phone: null, email: "mario@mountainhut.test" });
    });

    it("leaves temporary hikers out when searching by email", () => {
        // a temporary hiker has no email, so an email search can only find registered hikers
        searchHikersFilter({ email: "mario@mountainhut.test" });

        const sql = prepared[0];
        expect(sql).toMatch(/FROM temporary_hiker t\s+WHERE @email IS NULL/);
    });

    it("returns at most 50 hikers ordered by name", () => {
        // a short, sorted list is easier for the employee to read
        searchHikersFilter({ name: "a" });

        const sql = prepared[0];
        expect(sql).toMatch(/ORDER BY full_name/);
        expect(sql).toMatch(/LIMIT 50/);
    });

    it("lets a database failure through instead of swallowing it", () => {
        // a broken database must give an error, not look like "nobody found"
        statement.all.mockImplementation(() => {
            throw boom;
        });

        const act = () => searchHikersFilter({ name: "Mario" });

        expect(act).toThrow(boom);
    });
});

describe("getBooking: temporary hiker (MH-07)", () => {
    it("returns a booking with no hiker account for a temporary hiker", () => {
        // a booking made for a temporary hiker must still be readable
        statement.get.mockReturnValue({ id: BOOKING_ID, hiker_id: null });
        statement.all.mockReturnValue([new SeatedAt(BOOKING_ID, DATE, START, 1, 2)]);

        const result = getBooking(BOOKING_ID)!;

        expect(result.booking).toEqual(new Booking(BOOKING_ID, null));
        expect(result.party_size).toBe(2);
        expect(result).toMatchObject({ date: DATE, start_time: START });
    });
});

describe("createHikerAccount: account created by staff (MH-07)", () => {
    const INPUT: HikerInput = {
        email: "new.hiker@mountainhut.test",
        password: "initial-password",
        full_name: "New Hiker",
        mobile_number: "+39 300 000 0000",
        notes: "Arrived by phone",
        emergency_contact: null,
    };

    beforeEach(() => {
        vi.mocked(generatePasswordHash).mockReturnValue({ salt: "salt", hash: "hash" });
        statement.get.mockReturnValue(undefined);
        statement.run.mockImplementation(((...params: unknown[]) => {
            writes.push({ table: tableOf(lastSql), params });
            return { changes: 1, lastInsertRowid: ACCOUNT_ID };
        }) as any);
    });

    it("creates the account with \"must change password\" when staff asks for it", () => {
        // the password is chosen by staff, so the hiker must change it at the first login
        const result = createHikerAccount({ ...INPUT, must_change_password: true })!;

        expect(writes[0]).toEqual({ table: "account", params: [INPUT.email, "salt", "hash", 1] });
        expect(result).toBeInstanceOf(Hiker);
        expect(result.must_change_password).toBe(true);
    });

    it("does not ask to change the password by default", () => {
        // a hiker who registers alone chose the password, so nothing changes for them
        const result = createHikerAccount(INPUT)!;

        expect(writes[0].params[3]).toBe(0);
        expect(result.must_change_password).toBe(false);
    });

    it("does not ask to change the password when set to false", () => {
        // false must be saved as 0, the value the database accepts
        const result = createHikerAccount({ ...INPUT, must_change_password: false })!;

        expect(writes[0].params[3]).toBe(0);
        expect(result.must_change_password).toBe(false);
    });

    it("saves the hiker details linked to the new account", () => {
        // the story asks for a regular hiker profile that can later use the web interface
        const result = createHikerAccount({ ...INPUT, must_change_password: true })!;

        expect(writes).toHaveLength(2);
        expect(writes[1]).toEqual({
            table: "hiker",
            params: [ACCOUNT_ID, "New Hiker", "+39 300 000 0000", "Arrived by phone", null],
        });
        expect(result).toEqual(new Hiker(ACCOUNT_ID, INPUT.email, "salt", "hash", true,
            "New Hiker", "+39 300 000 0000", "Arrived by phone", null));
    });

    it("returns null and creates nothing when the email is taken", () => {
        // the hiker may already be registered: a second account must not be created
        statement.get.mockReturnValue({ 1: 1 });

        const result = createHikerAccount({ ...INPUT, must_change_password: true });

        expect(result).toBeNull();
        expect(statement.get).toHaveBeenCalledWith(INPUT.email);
        expect(statement.run).not.toHaveBeenCalled();
    });

    it("creates the account inside a transaction", () => {
        // the transaction never runs its callback: nothing must be written outside of it
        vi.mocked(inTransaction).mockReturnValue(null);

        createHikerAccount({ ...INPUT, must_change_password: true });

        expect(inTransaction).toHaveBeenCalledTimes(1);
        expect(statement.get).not.toHaveBeenCalled();
        expect(statement.run).not.toHaveBeenCalled();
    });
});