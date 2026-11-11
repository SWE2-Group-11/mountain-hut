import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { app } from "../../app";
import { resetTestDatabase, dayFromToday, huTime, loginAs, MARIO } from "../helpers";

const SLOTS_URL = "/api/v1/slots";

describe("GET /api/v1/slots", () => {
    const tomorrow = dayFromToday(1);
    const dayAfter = dayFromToday(2);

    beforeEach(() => {
        resetTestDatabase();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("is public and lists the bookable slots of a day with their seats", async () => {
        const res = await request(app).get(SLOTS_URL).query({ date: tomorrow });

        expect(res.status).toBe(200);
        expect(res.body).toEqual([
            { date: tomorrow, start_time: "12:00", duration: 60, total_seats: 16, available_seats: 7 },
            { date: tomorrow, start_time: "13:00", duration: 60, total_seats: 16, available_seats: 16 },
            { date: tomorrow, start_time: "19:30", duration: 90, total_seats: 16, available_seats: 12 },
        ]);
    });

    it("lists the slots of another day", async () => {
        const res = await request(app).get(SLOTS_URL).query({ date: dayAfter });

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0]).toMatchObject({ start_time: "12:00", available_seats: 13 });
    });

    it("returns an empty list when the day has no slots", async () => {
        const res = await request(app).get(SLOTS_URL).query({ date: dayFromToday(30) });

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    it("does not list a slot that is full", async () => {
        const mario = await loginAs(MARIO);
        const full = await mario.post("/api/v1/reservations").send({ date: tomorrow, slot: "13:00", partySize: 16 });
        expect(full.status).toBe(201);

        const res = await request(app).get(SLOTS_URL).query({ date: tomorrow });

        expect(res.body.map((s: { start_time: string }) => s.start_time)).toEqual(["12:00", "19:30"]);
    });

    it("does not list a slot that starts in less than 2 hours", async () => {
        // 10:30 in the hut: the 12:00 slot closed at 10:00, the 13:00 slot closes at 11:00
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(huTime(tomorrow, "10:30"));

        const res = await request(app).get(SLOTS_URL).query({ date: tomorrow });

        expect(res.status).toBe(200);
        expect(res.body.map((s: { start_time: string }) => s.start_time)).toEqual(["13:00", "19:30"]);
    });

    it("still lists a slot exactly 2 hours before it starts", async () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(huTime(tomorrow, "10:00"));

        const res = await request(app).get(SLOTS_URL).query({ date: tomorrow });

        expect(res.body.map((s: { start_time: string }) => s.start_time)).toContain("12:00");
    });

    it.each([
        ["a missing date", {}],
        ["a wrong format", { date: "31-10-2026" }],
        ["text", { date: "tomorrow" }],
        ["a date that does not exist", { date: "2026-02-30" }],
    ])("answers 400 for %s", async (_label, query) => {
        const res = await request(app).get(SLOTS_URL).query(query);

        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ code: 400, name: expect.any(String), message: expect.any(String) });
    });
});