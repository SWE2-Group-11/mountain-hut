import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "../../database/database";
import { getDietaryRequirementsByBooking, replaceRequirements } from "../../dao/dietary-requirement-dao";
import { DietaryRequirement } from "../../models/entities/dietary_requirement";

/*
UNIT tests for dietary_requirement-dao.
The database is mocked: we check how data is queried, converted, and saved.
The SQL itself is covered by the integration tests.
*/

vi.mock("../../database/database", () => ({
    db: { prepare: vi.fn() },
}));

const BOOKING_ID = 42;
const ROW_ID = 1;

const statement = { all: vi.fn(), run: vi.fn() };

beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(db.prepare).mockReturnValue(statement as any);
    statement.run.mockReturnValue({ changes: 1, lastInsertRowid: ROW_ID });
});

describe("getDietaryRequirementsByBooking (unit)", () => {
    it("returns an empty array if no requirements are found for the booking", () => {
        statement.all.mockReturnValue([]);

        const result = getDietaryRequirementsByBooking(BOOKING_ID);

        expect(result).toEqual([]);
    });

    it("queries the requirements for the requested booking ID", () => {
        statement.all.mockReturnValue([]);

        getDietaryRequirementsByBooking(BOOKING_ID);

        expect(statement.all).toHaveBeenCalledWith(BOOKING_ID);
    });

    it("maps database integers (0/1) to entity booleans and returns DietaryRequirement instances", () => {
        statement.all.mockReturnValue([
            { id: 1, booking_id: BOOKING_ID, allergy_flag: 1, description: "Peanuts allergy" },
            { id: 2, booking_id: BOOKING_ID, allergy_flag: 0, description: "Vegetarian" }
        ]);

        const result = getDietaryRequirementsByBooking(BOOKING_ID);

        expect(result).toHaveLength(2);
        
        expect(result[0]).toBeInstanceOf(DietaryRequirement);
        expect(result[0]).toEqual(new DietaryRequirement(1, BOOKING_ID, true, "Peanuts allergy"));

        expect(result[1]).toBeInstanceOf(DietaryRequirement);
        expect(result[1]).toEqual(new DietaryRequirement(2, BOOKING_ID, false, "Vegetarian"));
    });
});

describe("replaceRequirements (unit)", () => {
    it("deletes existing requirements and inserts the new ones mapping booleans to integers", () => {
        statement.run
            .mockReturnValueOnce({ changes: 1 })                       // Per la DELETE iniziale
            .mockReturnValueOnce({ changes: 1, lastInsertRowid: 10 })  // Primo INSERT
            .mockReturnValueOnce({ changes: 1, lastInsertRowid: 11 }); // Secondo INSERT

        const inputs = [
            { allergy_flag: true, description: "Gluten free" },
            { allergy_flag: false, description: "No seafood" }
        ];

        const result = replaceRequirements(BOOKING_ID, inputs);

        expect(statement.run).toHaveBeenCalledTimes(3);
        expect(statement.run).toHaveBeenNthCalledWith(1, BOOKING_ID);
        expect(statement.run).toHaveBeenNthCalledWith(2, BOOKING_ID, 1, "Gluten free");
        expect(statement.run).toHaveBeenNthCalledWith(3, BOOKING_ID, 0, "No seafood");

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual(new DietaryRequirement(10, BOOKING_ID, true, "Gluten free"));
        expect(result[1]).toEqual(new DietaryRequirement(11, BOOKING_ID, false, "No seafood"));
    });

    it("clears all requirements without adding new ones if an empty array is passed", () => {
        statement.run.mockReturnValue({ changes: 1 });

        const result = replaceRequirements(BOOKING_ID, []);

        expect(statement.run).toHaveBeenCalledTimes(1);
        expect(statement.run).toHaveBeenCalledWith(BOOKING_ID);
        
        expect(result).toEqual([]);
    });

    it("lets a database failure through instead of swallowing it", () => {
        const boom = new Error("Database locked or constraint failed");
        statement.run.mockImplementation(() => {
            throw boom;
        });

        expect(() => replaceRequirements(BOOKING_ID, [{ allergy_flag: true, description: "Test" }])).toThrow(boom);
    });
});
