import { DateTime } from "luxon";
import { z } from "zod";
import { HUT_TIMEZONE } from "../../config/config";
import { DateSchema } from "./slot-dto";

/**
 * Maximum number of target weeks in one copy request (one year).
 */
export const MAX_TARGET_WEEKS = 52;

/**
 * Checks that a YYYY-MM-DD date is a Monday in the hut's time zone.
 */
const isMonday = (value: string): boolean =>
    DateTime.fromISO(value, { zone: HUT_TIMEZONE }).weekday === 1;

/**
 * Validation schema for the first day (Monday) of a week, formatted YYYY-MM-DD.
 */
export const WeekStartSchema = DateSchema.refine(isMonday, "Must be a Monday, formatted YYYY-MM-DD");

/**
 * Validation schema for copying the schedule of a week into other weeks.
 * Used in POST /slots/copy-week
 */
export const CopyWeeklyScheduleRequestSchema = z
    .object({
        sourceWeekStart: WeekStartSchema,
        targetWeekStarts: z
            .array(WeekStartSchema)
            .min(1, "Provide at least one target week")
            .max(MAX_TARGET_WEEKS, `Provide at most ${MAX_TARGET_WEEKS} target weeks`)
            .refine(
                (weeks) => new Set(weeks).size === weeks.length,
                "Each target week can appear only once"
            ),
    })
    .refine(({ sourceWeekStart, targetWeekStarts }) => !targetWeekStarts.includes(sourceWeekStart), {
        path: ["targetWeekStarts"],
        message: "The source week cannot also be a target week",
    });

/**
 * Data Transfer Object for weekly schedule copy payloads, inferred from the schema.
 */
export type CopyWeeklyScheduleRequestDTO = z.infer<typeof CopyWeeklyScheduleRequestSchema>;

/**
 * Data Transfer Object for the result of a weekly schedule copy.
 */
export class CopyWeeklyScheduleResponseDTO {
    public sourceWeekStart: string;     // YYYY-MM-DD
    public targetWeekStarts: string[];  // YYYY-MM-DD
    public slotsPerWeek: number;

    constructor(sourceWeekStart: string, targetWeekStarts: string[], slotsPerWeek: number) {
        this.sourceWeekStart = sourceWeekStart;
        this.targetWeekStarts = targetWeekStarts;
        this.slotsPerWeek = slotsPerWeek;
    }
}
