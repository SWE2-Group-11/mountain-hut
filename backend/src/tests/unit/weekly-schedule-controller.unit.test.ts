import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { repeatWeeklySchedule } from "../../controllers/weekly-schedule-controller";
import { copyWeeklySchedule } from "../../dao/schedule_dao";
import {
    CopyWeeklyScheduleResponseDTO,
    type CopyWeeklyScheduleRequestDTO,
} from "../../models/dto/weekly-schedule-dto";
import { BadRequestError } from "../../models/errors/badrequest-error";
import { ConflictError } from "../../models/errors/conflict-error";
import { NotFoundError } from "../../models/errors/notfound-error";

// Isolate persistence; keep the real week checks of the controller
vi.mock("../../dao/schedule_dao", () => ({ copyWeeklySchedule: vi.fn() }));

const CURRENT_WEEK = "2030-06-10";   // Monday of the faked "now"
const SOURCE_WEEK = "2030-06-03";
const NEXT_WEEK = "2030-06-17";
const WEEK_AFTER = "2030-06-24";
const SLOTS_PER_WEEK = 14;
const VALID_REQUEST: CopyWeeklyScheduleRequestDTO = {
    sourceWeekStart: SOURCE_WEEK,
    targetWeekStarts: [NEXT_WEEK, WEEK_AFTER],
};

beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-06-12T10:00:00Z"));   // Wednesday, Europe/Rome
    vi.mocked(copyWeeklySchedule).mockReturnValue({
        status: "copied",
        targetWeekStart: VALID_REQUEST.targetWeekStarts,
        slotsPerWeek: SLOTS_PER_WEEK,
    });
});

afterEach(() => vi.useRealTimers());

describe("POST /slots/copy-week — repeatWeeklySchedule controller", () => {
    it.each([
        { label: "one target week", targets: [NEXT_WEEK] },
        { label: "multiple target weeks", targets: [NEXT_WEEK, WEEK_AFTER] },
    ])("copies the source week and returns the result with $label", ({ targets }) => {
        vi.mocked(copyWeeklySchedule).mockReturnValue({
            status: "copied", targetWeekStart: targets, slotsPerWeek: SLOTS_PER_WEEK,
        });

        const response = repeatWeeklySchedule({ ...VALID_REQUEST, targetWeekStarts: targets });

        expect(copyWeeklySchedule).toHaveBeenCalledExactlyOnceWith(SOURCE_WEEK, targets);
        expect(response).toBeInstanceOf(CopyWeeklyScheduleResponseDTO);
        expect(response).toEqual({
            sourceWeekStart: SOURCE_WEEK,
            targetWeekStarts: targets,
            slotsPerWeek: SLOTS_PER_WEEK,
        });
    });

    it("allows a past week as the source of the copy", () => {
        const response = repeatWeeklySchedule({ ...VALID_REQUEST, sourceWeekStart: "2029-01-01" });

        expect(copyWeeklySchedule).toHaveBeenCalledTimes(1);
        expect(response.sourceWeekStart).toBe("2029-01-01");
    });

    it("allows the current week as the source of the copy", () => {
        repeatWeeklySchedule({ ...VALID_REQUEST, sourceWeekStart: CURRENT_WEEK });

        expect(copyWeeklySchedule).toHaveBeenCalledExactlyOnceWith(
            CURRENT_WEEK, VALID_REQUEST.targetWeekStarts,
        );
    });

    it.each([
        { label: "the current week", week: CURRENT_WEEK },
        { label: "a past week", week: "2030-05-27" },
    ])("rejects $label as a target with BadRequestError and does not copy", ({ week }) => {
        expect(() => repeatWeeklySchedule({ ...VALID_REQUEST, targetWeekStarts: [week] }))
            .toThrow(BadRequestError);
        expect(copyWeeklySchedule).not.toHaveBeenCalled();
    });

    it("copies none of the weeks if only one of the targets has already started", () => {
        expect(() => repeatWeeklySchedule({
            ...VALID_REQUEST, targetWeekStarts: [NEXT_WEEK, CURRENT_WEEK, WEEK_AFTER],
        })).toThrow(new RegExp(CURRENT_WEEK));
        expect(copyWeeklySchedule).not.toHaveBeenCalled();
    });

    it("still accepts next week on Sunday night in the hut time zone", () => {
        vi.setSystemTime(new Date("2030-06-16T21:59:59Z"));   // Sunday 23:59:59 Europe/Rome

        repeatWeeklySchedule({ ...VALID_REQUEST, targetWeekStarts: [NEXT_WEEK] });

        expect(copyWeeklySchedule).toHaveBeenCalledTimes(1);
    });

    it("rejects next week once it has started in the hut time zone, even if it is still Sunday in UTC", () => {
        vi.setSystemTime(new Date("2030-06-16T22:00:00Z"));   // Monday 00:00 Europe/Rome

        expect(() => repeatWeeklySchedule({ ...VALID_REQUEST, targetWeekStarts: [NEXT_WEEK] }))
            .toThrow(BadRequestError);
        expect(copyWeeklySchedule).not.toHaveBeenCalled();
    });

    it("throws NotFoundError if the source week has no slots to copy", () => {
        vi.mocked(copyWeeklySchedule).mockReturnValue({ status: "source_empty" });

        expect(() => repeatWeeklySchedule(VALID_REQUEST)).toThrow(NotFoundError);
        expect(() => repeatWeeklySchedule(VALID_REQUEST)).toThrow(new RegExp(SOURCE_WEEK));
    });

    it("throws ConflictError naming the target week that already has bookings", () => {
        vi.mocked(copyWeeklySchedule).mockReturnValue({
            status: "target_has_bookings", weekStart: WEEK_AFTER,
        });

        expect(() => repeatWeeklySchedule(VALID_REQUEST)).toThrow(ConflictError);
        expect(() => repeatWeeklySchedule(VALID_REQUEST)).toThrow(new RegExp(WEEK_AFTER));
        expect(copyWeeklySchedule).toHaveBeenCalledWith(SOURCE_WEEK, VALID_REQUEST.targetWeekStarts);
    });

    it("propagates a DAO failure for the global 500 handler", () => {
        const failure = new Error("simulated schedule copy failure");
        vi.mocked(copyWeeklySchedule).mockImplementation(() => { throw failure; });

        expect(() => repeatWeeklySchedule(VALID_REQUEST)).toThrow(failure);
    });
});