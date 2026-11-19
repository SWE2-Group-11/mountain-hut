import { DateTime } from "luxon";
import { HUT_TIMEZONE } from "../config/config";
import { copyWeeklySchedule } from "../dao/schedule_dao";
import {
    CopyWeeklyScheduleRequestDTO,
    CopyWeeklyScheduleResponseDTO,
} from "../models/dto/weekly-schedule-dto";
import { BadRequestError } from "../models/errors/badrequest-error";
import { ConflictError } from "../models/errors/conflict-error";
import { NotFoundError } from "../models/errors/notfound-error";

/**
 * Copies the slots, tables and seats of a week into one or more later weeks.
 * Bookings are never copied. A target week with reservations is never changed: the whole copy
 * is refused and nothing is copied. A target week without reservations has its existing
 * schedule completely replaced. All the target weeks are copied together, or none is.
 * The route validates the body (Mondays, no duplicates, source not a target) and authorizes
 * employee/warden first.
 * @param request The source week and the target weeks (Mondays, YYYY-MM-DD).
 * @returns The copied weeks and the number of slots copied into each of them.
 * @throws BadRequestError if a target week has already started or is in the past (Europe/Rome).
 * @throws NotFoundError if the source week has no slots to copy.
 * @throws ConflictError if a target week has reservations.
 */
export const repeatWeeklySchedule = (
    request: CopyWeeklyScheduleRequestDTO
): CopyWeeklyScheduleResponseDTO => {
    const { sourceWeekStart, targetWeekStarts } = request;

    // Luxon weeks start on Monday, so this is the Monday of the current week in the hut.
    const currentWeekStart = DateTime.now().setZone(HUT_TIMEZONE).startOf("week").toFormat("yyyy-MM-dd");
    const startedWeek = targetWeekStarts.find((week) => week <= currentWeekStart);
    if (startedWeek) {
        throw new BadRequestError(
            `The week starting ${startedWeek} has already started or is in the past; only later weeks can receive a copy`
        );
    }

    const result = copyWeeklySchedule(sourceWeekStart, targetWeekStarts);

    switch (result.status) {
        case "source_empty":
            throw new NotFoundError(`The week starting ${sourceWeekStart} has no slots to copy`);
        case "target_has_bookings":
            throw new ConflictError(
                `The week starting ${result.weekStart} already has bookings, so its schedule cannot be replaced. Nothing was copied`
            );
        case "copied":
            return new CopyWeeklyScheduleResponseDTO(sourceWeekStart, result.targetWeekStart, result.slotsPerWeek);
    }
};
