import { db } from "../database/database";
import { DietaryRequirement } from "../models/entities/dietary_requirement";

export type RequirementInput = {
    allergy_flag: boolean;
    description: string;
};

/**
 * Retrieves the dietary requirements of a booking.
 * @param booking_id The id of the booking.
 * @returns The dietary requirements ordered by id (empty if none).
 */
export const getDietaryRequirementsByBooking = (booking_id: number): DietaryRequirement[] => {
    const sql = `SELECT id, booking_id, allergy_flag, description
                 FROM dietary_requirement
                 WHERE booking_id = ?
                 ORDER BY id`;
    return db.prepare<[number], {id: number; booking_id: number; allergy_flag: number; description: string}>(sql)
        .all(booking_id)
        .map((r) => new DietaryRequirement(r.id, r.booking_id, r.allergy_flag === 1, r.description));
};

/**
 * Replaces all the dietary requirements of a booking with the given ones.
 * @param booking_id The id of the booking.
 * @param requirements The new dietary requirements; an empty array removes them all.
 * @returns The created dietary requirements with their generated ids.
 */
export const replaceRequirements = (
    booking_id: number,
    requirements: RequirementInput[]
): DietaryRequirement[] => {
    db.prepare("DELETE FROM dietary_requirement WHERE booking_id = ?").run(booking_id);
    const insert = db.prepare(
        "INSERT INTO dietary_requirement (booking_id, allergy_flag, description) VALUES (?, ?, ?)");
    return requirements.map((r) => {
        const result = insert.run(booking_id, r.allergy_flag ? 1 : 0, r.description);
        const id = Number(result.lastInsertRowid);
        return new DietaryRequirement(id, booking_id, r.allergy_flag, r.description);
    });
};