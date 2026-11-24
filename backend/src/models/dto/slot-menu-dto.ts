import { z } from "zod";
import { DateSchema, TimeSchema, GetConfigurationsRequestSchema } from "./slot-dto";

export const DefineMenuRequestSchema = z.object({
    date: DateSchema,
    startTime: TimeSchema,
    // Validate without trimming, since leading spaces can be meaningful in Markdown.
    menu: z.string().refine((menu) => menu.trim().length > 0, "The menu must not be blank").nullable(),
});

export type DefineMenuRequestDTO = z.infer<typeof DefineMenuRequestSchema>;

export const GetReusableMenusRequestSchema = GetConfigurationsRequestSchema;

export type GetReusableMenusRequestDTO = z.infer<typeof GetReusableMenusRequestSchema>;

export class SlotMenuDTO {
    constructor(
        public date: string,
        public startTime: string,
        public menu: string | null
    ) {}
}
