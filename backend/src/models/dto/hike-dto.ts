import {z} from "zod";

const UtcDateTimeSchema = z.iso.datetime({ precision: 0});

export const RegisterHikeRequestSchema = z.object({
    destination: z.string().trim().min(1),
    route: z.string().trim().min(1),
    passagePoints: z.array(z.string().trim().min(1)).default([]),
    plannedDepartureAt: UtcDateTimeSchema,
    expectedReturnAt: UtcDateTimeSchema,
}).refine(
    ({plannedDepartureAt, expectedReturnAt}) => expectedReturnAt > plannedDepartureAt,
    {path: ["expectedReturnAt"], message: "Expected return time must be after planned departure time"}
);

export type RegisterHikeRequestDTO = z.infer<typeof RegisterHikeRequestSchema>;

export const GetPopularHikesRequestSchema = z.object({
    limit: z.coerce.number().int().positive().optional(),
});

export type GetPopularHikesRequestDTO = z.infer<typeof GetPopularHikesRequestSchema>;

export type PopularHikeResponseDTO = {
    id: number,
    destination: string,
    route: string,
    passagePoints: string[],
};

export type RegisterHikeResponseDTO = PopularHikeResponseDTO & {
    plannedDepartureAt: string,
    expectedReturnAt: string,
    completedAt: string | null,
};