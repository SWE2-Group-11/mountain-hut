import { db, inTransaction } from '../database/database';

export type copyWeeklyScheduleResult = 
|{
    status: 'copied'
    targetWeekStart: string[]
    slotsPerWeek: number
} 
| {status: "source_empty"}
| {
    status: "target_has_bookings"
    weekStart: string
}

type WeekParams = { weekStart: string };
type CopyParams = { source: string; target: string };

/**
 * Checks if there are any bookings in the week starting at the given date.
 */
export const hasBookingsInWeek = (weekStart: string): boolean => {
    const row = db.prepare<WeekParams, {found: number}>(`
        SELECT 1 AS found
        FROM seated_at
        WHERE slot_date >= @weekStart
        AND slot_date < date(@weekStart, '+7 days')
        LIMIT 1
    `).get({ weekStart })?.found === 1;

    return row !== undefined;
}

/**
 * Copies slot times, durations and table capacities to each target week.
 *
 * Existing target schedules are completely replaced only if they
 * contain no bookings. Bookings are never copied.
 *
 * All target weeks are copied in the same transaction.
 * Dates must be Mondays in YYYY-MM-DD format.
 *
 * Invalid arguments throw RangeError; database errors propagate.
 */
export const copyWeeklySchedule = (
    sourceWeekStart: string, 
    targetWeekStarts: string[]
): copyWeeklyScheduleResult => inTransaction(() => {
    const targets = [...new Set(targetWeekStarts)];

    if(targets.length === 0 || targets.includes(sourceWeekStart)) {
        throw new RangeError("Provide at least one target week that is not the source week");
    }

    const validWeekStart = db.prepare<WeekParams, {valid: number}>(`
        SELECT COALESCE(
            date(@weekstart, '+o days') = @weekstart
            AND strftime('%w', @weekstart) = '1',
            0
        ) AS valid
    `);

    for(const weekStart of [sourceWeekStart, ...targets]) {
        if(validWeekStart.get({ weekStart })?.valid !== 1) {
            throw new RangeError(`Week starts must be Mondays in YYYY-MM-DD format`);
        };
    }

    const source = db.prepare<WeekParams, {count: number}>(`
        SELECT COUNT(*) AS count
        FROM slot
        WHERE date >= @weekStart
        AND date < date(@weekStart, '+7 days')
    `).get({ weekStart: sourceWeekStart })!;

    if (source.count === 0) {
        return { status: "source_empty" };
    }

    // Check every destination before replacing any schedule.
    for (const weekStart of targets) {
        if (hasBookingsInWeek(weekStart)) {
            return { status: "target_has_bookings", weekStart };
        }
    }

    const deleteTables = db.prepare<WeekParams>(`
        DELETE FROM slot_table
        WHERE slot_date >= @weekStart
        AND slot_date < date(@weekStart, '+7 days')
    `);

    const deleteSlots = db.prepare<WeekParams>(`
        DELETE FROM slot
        WHERE date >= @weekStart
        AND date < date(@weekStart, '+7 days')
    `);

    const copySlots = db.prepare<CopyParams>(`
        INSERT INTO slot (date, start_time, duration)
        SELECT date(
            s.date,
            CAST((julianday(@target) - julianday(@source)) AS INTEGER) || ' days'
        ),
        s.start_time,
        s.duration
        FROM slot s
        WHERE s.date >= @source
        AND s.date < date(@source, '+7 days')
    `);

    const copyTables = db.prepare<CopyParams>(`
        INSERT INTO slot_table (slot_date, start_time, table_number, seats)
        SELECT date(
            st.date,
            CAST((julianday(@target) - julianday(@source)) AS INTEGER) || ' days'
        ),
        st.start_time,
        st.table_number,
        st.seats
        FROM slot_table st
        WHERE st.slot_date >= @source
        AND st.slot_date < date(@source, '+7 days')
    `);
    
    for (const weekStart of targets) {
        // Delete any existing schedule for the target week, then copy the source schedule.
        deleteTables.run({ weekStart });
        deleteSlots.run({ weekStart });

        copySlots.run({ source: sourceWeekStart, target: weekStart });
        copyTables.run({ source: sourceWeekStart, target: weekStart });
    }

    return { status: 'copied', targetWeekStart: targets, slotsPerWeek: source.count };
});