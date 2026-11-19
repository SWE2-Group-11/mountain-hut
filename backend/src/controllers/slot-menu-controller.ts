import { getPreviousMenus, updateSlotMenu } from "../dao/slot-dao";
import {
    SlotMenuDTO,
    type DefineMenuRequestDTO,
    type GetReusableMenusRequestDTO,
} from "../models/dto/slot-menu-dto";
import { NotFoundError } from "../models/errors/notfound-error";

/** Sets the menu of a slot identified by its date and start time. 
 * @param {DefineMenuRequestDTO} request - The request object containing the date, start time, and menu to be defined.
 * @returns {SlotMenuDTO} - The updated slot menu data transfer object.
 * @throws {NotFoundError} - If the slot with the specified date and start time is not found.
*/
export const defineMenu = ({ date, startTime, menu }: DefineMenuRequestDTO): SlotMenuDTO => {
    const slot = updateSlotMenu(date, startTime, menu);
    if(!slot) {
        throw new NotFoundError(`Slot not found`);
    }

    return new SlotMenuDTO(slot.date, slot.start_time, slot.menu);
};

/** Returns saved menus that can be reused as editable drafts for another slot.
 * @param {GetReusableMenusRequestDTO} request - The request object containing optional date range and limit for fetching reusable menus.
 * @returns {string[]} - An array of reusable menu strings.
*/
export const getReusableMenus = ({ from, to, limit }: GetReusableMenusRequestDTO): string[] =>
    getPreviousMenus(from ?? null, to ?? null, limit);
