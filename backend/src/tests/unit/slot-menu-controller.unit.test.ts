import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineMenu, getReusableMenus } from "../../controllers/slot-menu-controller";
import { getPreviousMenus, updateSlotMenu } from "../../dao/slot-dao";
import { SlotMenuDTO } from "../../models/dto/slot-menu-dto";
import { Slot } from "../../models/entities/slot";
import { NotFoundError } from "../../models/errors/notfound-error";

vi.mock("../../dao/slot-dao", () => ({ updateSlotMenu: vi.fn(), getPreviousMenus: vi.fn() }));

const DAY = "2030-06-15";
const START_TIME = "19:00";
const markdownMenu = "**Dinner**\n- *Polenta* with mushrooms\n  - gluten free\n- Apple strudel";

beforeEach(() => vi.resetAllMocks());

describe("PUT /slots/menu — defineMenu controller", () => {
    it.each([markdownMenu, null])("updates the slot and maps it to a SlotMenuDTO (menu: %j)", (menu) => {
        vi.mocked(updateSlotMenu).mockReturnValue(new Slot(DAY, START_TIME, 90, menu));

        const result = defineMenu({ date: DAY, startTime: START_TIME, menu });

        expect(updateSlotMenu).toHaveBeenCalledWith(DAY, START_TIME, menu);
        // Strict: duration must not leak into the response
        expect(result).toStrictEqual(new SlotMenuDTO(DAY, START_TIME, menu));
    });

    it("throws NotFoundError when the slot does not exist", () => {
        vi.mocked(updateSlotMenu).mockReturnValue(null);

        expect(() => defineMenu({ date: DAY, startTime: "07:00", menu: markdownMenu })).toThrow(NotFoundError);
    });
});

describe("GET /slots/menus — getReusableMenus controller", () => {
    it("forwards the date range and limit, returning the DAO menus as they are", () => {
        vi.mocked(getPreviousMenus).mockReturnValue([markdownMenu, "*Soup of the day*"]);

        expect(getReusableMenus({ from: "2030-06-01", to: "2030-06-30", limit: 5 }))
            .toEqual([markdownMenu, "*Soup of the day*"]);
        expect(getPreviousMenus).toHaveBeenCalledWith("2030-06-01", "2030-06-30", 5);
    });

    it("passes null for the missing date filters", () => {
        vi.mocked(getPreviousMenus).mockReturnValue([]);

        expect(getReusableMenus({ limit: 20 })).toEqual([]);
        expect(getPreviousMenus).toHaveBeenCalledWith(null, null, 20);
    });
});