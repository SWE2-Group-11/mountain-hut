import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listPopularHikes, registerHike } from "../../controllers/hike-controller";
import { getPopularHikes, saveHike } from "../../dao/hike-dao";
import { type RegisterHikeRequestDTO } from "../../models/dto/hike-dto";
import { Hike } from "../../models/entities/hike";
import { PopularHike } from "../../models/entities/popular_hike";
import { BadRequestError } from "../../models/errors/badrequest-error";

// Isolate persistence; keep real response mapping
vi.mock("../../dao/hike-dao", () => ({ saveHike: vi.fn(), getPopularHikes: vi.fn() }));

const NOW = "2030-06-15T08:00:00Z";
const HIKER_ID = 7;
const REQUEST: RegisterHikeRequestDTO = {
    destination: "Viso Mozzo",
    route: "via the Chiaretto lake",
    passagePoints: ["Pian del Re", "Chiaretto lake"],
    plannedDepartureAt: "2030-06-15T09:00:00Z",
    expectedReturnAt: "2030-06-15T15:00:00Z",
};

beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
});

afterEach(() => vi.useRealTimers());

describe("POST /hikes — registerHike controller", () => {
    it("saves the hike with DAO field names and returns the mapped DTO", () => {
        vi.mocked(saveHike).mockReturnValue(new Hike(1, HIKER_ID, REQUEST.destination, REQUEST.route,
            [...REQUEST.passagePoints], REQUEST.plannedDepartureAt, REQUEST.expectedReturnAt, null));

        expect(registerHike(HIKER_ID, REQUEST)).toStrictEqual({ id: 1, ...REQUEST, completedAt: null });
        expect(saveHike).toHaveBeenCalledExactlyOnceWith(HIKER_ID, {
            destination: REQUEST.destination,
            route: REQUEST.route,
            passage_points: REQUEST.passagePoints,
            planned_departure_at: REQUEST.plannedDepartureAt,
            expected_return_at: REQUEST.expectedReturnAt,
        });
    });

    it.each([NOW, "2030-06-15T07:59:59Z"])(
        "rejects a departure at or before now (%s) with BadRequestError and does not save",
        (plannedDepartureAt) => {
            expect(() => registerHike(HIKER_ID, { ...REQUEST, plannedDepartureAt })).toThrow(BadRequestError);
            expect(saveHike).not.toHaveBeenCalled();
        },
    );

    it("accepts a departure one second after now", () => {
        vi.mocked(saveHike).mockReturnValue(new Hike(1, HIKER_ID, "d", "r", [], "2030-06-15T08:00:01Z", "2030-06-15T09:00:00Z"));

        expect(() => registerHike(HIKER_ID, { ...REQUEST, plannedDepartureAt: "2030-06-15T08:00:01Z" })).not.toThrow();
    });

    it("propagates DAO failures for the global 500 handler", () => {
        const failure = new Error("simulated insert failure");
        vi.mocked(saveHike).mockImplementation(() => { throw failure; });

        expect(() => registerHike(HIKER_ID, REQUEST)).toThrow(failure);
    });
});

describe("GET /hikes/popular — listPopularHikes controller", () => {
    it.each([3, undefined])("passes limit %s to the DAO", (limit) => {
        vi.mocked(getPopularHikes).mockReturnValue([]);

        expect(listPopularHikes({ limit })).toEqual([]);
        expect(getPopularHikes).toHaveBeenCalledExactlyOnceWith(limit);
    });

    it("maps each popular hike to a DTO, keeping DAO order", () => {
        vi.mocked(getPopularHikes).mockReturnValue([
            new PopularHike(2, "Colle delle Traversette", "via the Po springs", ["Pian del Re", "Fiorenza lake"]),
            new PopularHike(1, "Viso Mozzo", "via the Chiaretto lake", []),
        ]);

        expect(listPopularHikes({})).toStrictEqual([
            { id: 2, destination: "Colle delle Traversette", route: "via the Po springs", passagePoints: ["Pian del Re", "Fiorenza lake"] },
            { id: 1, destination: "Viso Mozzo", route: "via the Chiaretto lake", passagePoints: [] },
        ]);
    });
});