import {
    SlotMenuDTO,
    type DefineMenuRequestDTO,
    type GetReusableMenusRequestDTO,
} from "../models/dto/slot-menu-dto";
import { NotFoundError } from "../models/errors/notfound-error";

/** Updates only the menu of an existing slot, returning false if no slot matches. */
export type UpdateSlotMenu = (date: string, startTime: string, menu: string) => boolean;

/** Lists slots with a menu, ordered by date and start time descending, up to the given limit. */
export type ListSlotMenus = (limit: number) => {
    date: string;
    start_time: string;
    menu: string;
}[];

/** Sets or replaces the menu of a slot identified by its date and start time. */
export const defineMenu = (
    { date, startTime, menu }: DefineMenuRequestDTO,
    updateSlotMenu: UpdateSlotMenu
): SlotMenuDTO => {
    if (!updateSlotMenu(date, startTime, menu)) {
        throw new NotFoundError("Slot not found");
    }

    return new SlotMenuDTO(date, startTime, menu);
};

/** Returns saved menus that can be reused as editable drafts for another slot. */
export const getReusableMenus = (
    { limit }: GetReusableMenusRequestDTO,
    listSlotMenus: ListSlotMenus
): SlotMenuDTO[] =>
    listSlotMenus(limit).map(({ date, start_time, menu }) => new SlotMenuDTO(date, start_time, menu));
