import { z } from "zod";
import { DateSchema, TimeSchema } from "./slot-dto";

export const DefineMenuRequestSchema = z.object({
    date: DateSchema,
    startTime: TimeSchema,
    // Validate without trimming, since leading spaces can be meaningful in Markdown.
    menu: z.string().refine((menu) => menu.trim().length > 0, "The menu must not be blank"),
});

export type DefineMenuRequestDTO = z.infer<typeof DefineMenuRequestSchema>;

export const GetReusableMenusRequestSchema = z.object({
    limit: z.coerce.number().int().positive().max(100).default(20),
});

export type GetReusableMenusRequestDTO = z.infer<typeof GetReusableMenusRequestSchema>;

export class SlotMenuDTO {
    constructor(
        public date: string,
        public startTime: string,
        public menu: string
    ) {}
}
