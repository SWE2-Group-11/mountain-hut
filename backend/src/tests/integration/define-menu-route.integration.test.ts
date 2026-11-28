import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../app";
import { db } from "../../database/database";
import { resetTestDatabase, dayFromToday, loginAs, MARIO, EMPLOYEE, ALPINE_MENU, DINNER_MENU } from "../helpers";

/*
 * Define menus (MH-10): PUT /api/v1/slots/menu and GET /api/v1/slots/menus.
 * Everything is real: session, route, validation, controller, DAO, SQL, in-memory database.
 *
 * Seed (reset before every test), every slot on a day from tomorrow:
 *  - D1 12:00  ALPINE_MENU
 *  - D1 13:00  ALPINE_MENU   (the same text as 12:00: a menu shared by two slots)
 *  - D1 19:30  DINNER_MENU
 *  - D2 12:00  no menu
 * Mario has a booking at D1 12:00.
 *
 * The server does not refuse a change to the menu of a slot that has already started: that rule is only
 * enforced by the page, so it is not tested here.
 */

const MENU_URL = "/api/v1/slots/menu";
const MENUS_URL = "/api/v1/slots/menus";
const SLOTS_URL = "/api/v1/slots";
const AVAILABILITY_URL = "/api/v1/slots/availability";
const RESERVATIONS_URL = "/api/v1/reservations";
const WARDEN = "warden@mountainhut.test";

// Computed once with the real clock
const D1 = dayFromToday(1);
const D2 = dayFromToday(2);

const NEW_MENU = "**Summer Menu**\n- Gazpacho\n  - with croutons\n- *Peach tart*";

const menuInDb = (date: string, startTime: string): string | null | undefined =>
    db.prepare<[string, string], { menu: string | null }>("SELECT menu FROM slot WHERE date = ? AND start_time = ?")
        .get(date, startTime)?.menu;

const slotCount = (): number =>
    db.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM slot").get()!.n;

const bookingCount = (): number =>
    db.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM booking").get()!.n;

/** Every seed slot still has the menu it started with. */
const expectSeedMenus = () => {
    expect(menuInDb(D1, "12:00")).toBe(ALPINE_MENU);
    expect(menuInDb(D1, "13:00")).toBe(ALPINE_MENU);
    expect(menuInDb(D1, "19:30")).toBe(DINNER_MENU);
    expect(menuInDb(D2, "12:00")).toBeNull();
};

describe("Define menus", () => {
    beforeEach(() => {
        resetTestDatabase();
    });

    describe("PUT /api/v1/slots/menu", () => {
        describe("access control", () => {
            it("answers 401 when nobody is logged in", async () => {
                const res = await request(app).put(MENU_URL).send({ date: D2, startTime: "12:00", menu: NEW_MENU });

                expect(res.status).toBe(401);
                expect(res.body).toMatchObject({ code: 401, message: "Not authenticated" });
                expectSeedMenus();
            });

            it("answers 403 to a hiker", async () => {
                const hiker = await loginAs(MARIO);

                const res = await hiker.put(MENU_URL).send({ date: D2, startTime: "12:00", menu: NEW_MENU });

                expect(res.status).toBe(403);
                expect(res.body).toMatchObject({ code: 403, message: "Not allowed for this role" });
                expectSeedMenus();
            });

            it.each([
                ["an employee", EMPLOYEE],
                ["the warden", WARDEN],
            ])("lets %s define a menu", async (_label, email) => {
                const staff = await loginAs(email);

                const res = await staff.put(MENU_URL).send({ date: D2, startTime: "12:00", menu: NEW_MENU });

                expect(res.status).toBe(200);
                expect(menuInDb(D2, "12:00")).toBe(NEW_MENU);
            });
        });

        describe("defining, changing and removing a menu", () => {
            it("sets the menu of a slot that has none and answers with the stored menu", async () => {
                const staff = await loginAs(EMPLOYEE);

                const res = await staff.put(MENU_URL).send({ date: D2, startTime: "12:00", menu: NEW_MENU });

                expect(res.status).toBe(200);
                expect(res.body).toEqual({ date: D2, startTime: "12:00", menu: NEW_MENU });
                expect(menuInDb(D2, "12:00")).toBe(NEW_MENU);
            });

            it("replaces the menu a slot already has", async () => {
                const staff = await loginAs(EMPLOYEE);

                const res = await staff.put(MENU_URL).send({ date: D1, startTime: "19:30", menu: NEW_MENU });

                expect(res.status).toBe(200);
                expect(res.body.menu).toBe(NEW_MENU);
                expect(menuInDb(D1, "19:30")).toBe(NEW_MENU);
            });

            it("keeps the text exactly as sent: bold, italic, nested list, spaces and line breaks", async () => {
                // The page stores Markdown and shows it formatted: the server must not trim or reformat it.
                const staff = await loginAs(EMPLOYEE);
                const menu = "  **Bold** and *italic*\n\n- Item\n  - Sub item\n    - Third level\n\n  trailing spaces  \n";

                const res = await staff.put(MENU_URL).send({ date: D2, startTime: "12:00", menu });

                expect(res.status).toBe(200);
                expect(res.body.menu).toBe(menu);
                expect(menuInDb(D2, "12:00")).toBe(menu);
            });

            it("accepts a menu of exactly 5000 characters", async () => {
                const staff = await loginAs(EMPLOYEE);
                const menu = "a".repeat(5000);

                const res = await staff.put(MENU_URL).send({ date: D2, startTime: "12:00", menu });

                expect(res.status).toBe(200);
                expect(menuInDb(D2, "12:00")).toBe(menu);
            });

            it("removes the menu when it is null", async () => {
                const staff = await loginAs(EMPLOYEE);

                const res = await staff.put(MENU_URL).send({ date: D1, startTime: "19:30", menu: null });

                expect(res.status).toBe(200);
                expect(res.body).toEqual({ date: D1, startTime: "19:30", menu: null });
                expect(menuInDb(D1, "19:30")).toBeNull();
            });

            it("changing a menu that two slots share changes only that slot", async () => {
                // 12:00 and 13:00 have the same Alpine menu: editing 13:00 must leave 12:00 as it was.
                const staff = await loginAs(EMPLOYEE);

                const res = await staff.put(MENU_URL).send({ date: D1, startTime: "13:00", menu: NEW_MENU });

                expect(res.status).toBe(200);
                expect(menuInDb(D1, "13:00")).toBe(NEW_MENU);
                expect(menuInDb(D1, "12:00")).toBe(ALPINE_MENU);
                expect(menuInDb(D1, "19:30")).toBe(DINNER_MENU);
                expect(menuInDb(D2, "12:00")).toBeNull();
            });

            it("removing a menu that two slots share removes it from that slot only", async () => {
                const staff = await loginAs(EMPLOYEE);

                const res = await staff.put(MENU_URL).send({ date: D1, startTime: "12:00", menu: null });

                expect(res.status).toBe(200);
                expect(menuInDb(D1, "12:00")).toBeNull();
                expect(menuInDb(D1, "13:00")).toBe(ALPINE_MENU);
            });

            it("shows the new menu to the public list of slots and to the availability check", async () => {
                const staff = await loginAs(EMPLOYEE);
                await staff.put(MENU_URL).send({ date: D2, startTime: "12:00", menu: NEW_MENU });

                const list = await request(app).get(SLOTS_URL).query({ date: D2 });
                const availability = await request(app)
                    .get(AVAILABILITY_URL)
                    .query({ date: D2, slot: "12:00", partySize: 1 });

                expect(list.body.find((s: { start_time: string }) => s.start_time === "12:00").menu).toBe(NEW_MENU);
                expect(availability.body.menu).toBe(NEW_MENU);
            });

            it("shows the new menu on a booking that was made before, and leaves the booking as it was", async () => {
                // Mario booked D1 12:00: the menu is read from the slot, so he sees the change.
                const staff = await loginAs(EMPLOYEE);
                const before = bookingCount();
                await staff.put(MENU_URL).send({ date: D1, startTime: "12:00", menu: NEW_MENU });
                const mario = await loginAs(MARIO);

                const res = await mario.get(RESERVATIONS_URL);

                const booking = res.body.find((b: { id: number }) => b.id === 1);
                expect(booking).toMatchObject({ id: 1, menu: NEW_MENU });
                expect(bookingCount()).toBe(before);
            });
        });

        describe("a slot that does not exist (404)", () => {
            it.each([
                ["a day without slots", dayFromToday(40), "12:00"],
                ["a start time that no slot has on that day", D1, "14:00"],
            ])("answers 404 for %s and creates nothing", async (_label, date, startTime) => {
                const staff = await loginAs(EMPLOYEE);
                const before = slotCount();

                const res = await staff.put(MENU_URL).send({ date, startTime, menu: NEW_MENU });

                expect(res.status).toBe(404);
                expect(res.body).toMatchObject({ code: 404 });
                expect(slotCount()).toBe(before);
                expectSeedMenus();
            });
        });

        describe("validation (400)", () => {
            it.each([
                ["an empty menu", { menu: "" }],
                ["a menu of spaces and line breaks", { menu: "   \n \t " }],
                ["a menu of 5001 characters", { menu: "a".repeat(5001) }],
                ["a menu that is not text", { menu: 123 }],
                ["a missing menu", { menu: undefined }],
                ["a missing date", { date: undefined }],
                ["a missing start time", { startTime: undefined }],
                ["a date that does not exist", { date: "2030-02-30" }],
                ["a date in another format", { date: "28-11-2030" }],
                ["a start time with one digit for the hour", { startTime: "9:00" }],
                ["a start time that is not a time", { startTime: "25:00" }],
            ])("refuses %s and changes nothing", async (_label, change) => {
                const staff = await loginAs(EMPLOYEE);
                const body = { date: D1, startTime: "19:30", menu: NEW_MENU, ...change };

                const res = await staff.put(MENU_URL).send(body);

                expect(res.status).toBe(400);
                expect(res.body).toMatchObject({ code: 400 });
                expectSeedMenus();
            });

            it("refuses a request without a body", async () => {
                const staff = await loginAs(EMPLOYEE);

                const res = await staff.put(MENU_URL);

                expect(res.status).toBe(400);
                expectSeedMenus();
            });
        });
    });

    describe("GET /api/v1/slots/menus", () => {
        describe("access control", () => {
            it("answers 401 when nobody is logged in", async () => {
                const res = await request(app).get(MENUS_URL);

                expect(res.status).toBe(401);
                expect(res.body).toMatchObject({ code: 401, message: "Not authenticated" });
            });

            it("answers 403 to a hiker", async () => {
                const hiker = await loginAs(MARIO);

                const res = await hiker.get(MENUS_URL);

                expect(res.status).toBe(403);
                expect(res.body).toMatchObject({ code: 403, message: "Not allowed for this role" });
            });

            it.each([
                ["an employee", EMPLOYEE],
                ["the warden", WARDEN],
            ])("lets %s read the menus", async (_label, email) => {
                const staff = await loginAs(email);

                const res = await staff.get(MENUS_URL);

                expect(res.status).toBe(200);
            });
        });

        describe("the menus that can be reused", () => {
            it("lists each menu once, the one of the latest slot first", async () => {
                // Alpine is in two slots but appears once; Dinner (19:30) is the latest slot.
                const staff = await loginAs(EMPLOYEE);

                const res = await staff.get(MENUS_URL);

                expect(res.body).toEqual([DINNER_MENU, ALPINE_MENU]);
            });

            it("puts a menu just defined for a later day first", async () => {
                const staff = await loginAs(EMPLOYEE);
                await staff.put(MENU_URL).send({ date: D2, startTime: "12:00", menu: NEW_MENU });

                const res = await staff.get(MENUS_URL);

                expect(res.body).toEqual([NEW_MENU, DINNER_MENU, ALPINE_MENU]);
            });

            it("does not list a menu that no slot has any more", async () => {
                const staff = await loginAs(EMPLOYEE);
                await staff.put(MENU_URL).send({ date: D1, startTime: "19:30", menu: null });

                const res = await staff.get(MENUS_URL);

                expect(res.body).toEqual([ALPINE_MENU]);
            });

            it("keeps listing a menu while at least one slot still has it", async () => {
                const staff = await loginAs(EMPLOYEE);
                await staff.put(MENU_URL).send({ date: D1, startTime: "12:00", menu: null });

                const res = await staff.get(MENUS_URL);

                expect(res.body).toEqual([DINNER_MENU, ALPINE_MENU]);
            });

            it("reusing a menu copies it to another slot and leaves the first slot unchanged", async () => {
                // The page reads the list, then saves the picked text on another slot.
                const staff = await loginAs(EMPLOYEE);
                const [picked] = (await staff.get(MENUS_URL)).body;

                const res = await staff.put(MENU_URL).send({ date: D2, startTime: "12:00", menu: picked });

                expect(res.status).toBe(200);
                expect(menuInDb(D2, "12:00")).toBe(DINNER_MENU);
                expect(menuInDb(D1, "19:30")).toBe(DINNER_MENU);
                expect((await staff.get(MENUS_URL)).body).toEqual([DINNER_MENU, ALPINE_MENU]);
            });

            it("a reused menu can be changed for one slot without changing the other", async () => {
                const staff = await loginAs(EMPLOYEE);
                await staff.put(MENU_URL).send({ date: D2, startTime: "12:00", menu: DINNER_MENU });

                await staff.put(MENU_URL).send({ date: D2, startTime: "12:00", menu: `${DINNER_MENU}\n- Coffee` });

                expect(menuInDb(D2, "12:00")).toBe(`${DINNER_MENU}\n- Coffee`);
                expect(menuInDb(D1, "19:30")).toBe(DINNER_MENU);
            });
        });

        describe("filters", () => {
            it("keeps only the menus of slots from the date given", async () => {
                const staff = await loginAs(EMPLOYEE);
                await staff.put(MENU_URL).send({ date: D2, startTime: "12:00", menu: NEW_MENU });

                const res = await staff.get(MENUS_URL).query({ from: D2 });

                expect(res.body).toEqual([NEW_MENU]);
            });

            it("keeps only the menus of slots up to the date given", async () => {
                const staff = await loginAs(EMPLOYEE);
                await staff.put(MENU_URL).send({ date: D2, startTime: "12:00", menu: NEW_MENU });

                const res = await staff.get(MENUS_URL).query({ to: D1 });

                expect(res.body).toEqual([DINNER_MENU, ALPINE_MENU]);
            });

            it("returns no menus when no slot in the range has one", async () => {
                const staff = await loginAs(EMPLOYEE);

                const res = await staff.get(MENUS_URL).query({ from: D2, to: D2 });

                expect(res.status).toBe(200);
                expect(res.body).toEqual([]);
            });

            it("returns at most the number of menus asked for, the most recent ones", async () => {
                const staff = await loginAs(EMPLOYEE);

                const res = await staff.get(MENUS_URL).query({ limit: 1 });

                expect(res.body).toEqual([DINNER_MENU]);
            });

            it.each([
                ["a limit of 0", { limit: 0 }],
                ["a limit above 100", { limit: 101 }],
                ["a limit that is not a number", { limit: "many" }],
                ["a date that does not exist", { from: "2030-02-30" }],
                ["a start date after the end date", { from: D2, to: D1 }],
            ])("refuses %s", async (_label, query) => {
                const staff = await loginAs(EMPLOYEE);

                const res = await staff.get(MENUS_URL).query(query);

                expect(res.status).toBe(400);
                expect(res.body).toMatchObject({ code: 400 });
            });
        });
    });
});