import { z } from "zod";
import { Role } from "../entities/account";

export class AccountResponseDTO {
    public id: number;
    public email: string;
    public role: Role;

    constructor(id: number, email: string, role: Role) {
        this.id = id;
        this.email = email;
        this.role = role;
    }
}

export const AccountLoginRequestSchema = z.object({
    // what is this hideous thing doing: checking if email is a string,
    // trimming leading and ending spaces and lowercase the entire thing.
    // THEN pipe() passes the result to the email format checker
    email: z.string().trim().toLowerCase().pipe(z.email()),
    password: z.string().min(1),
});

export const AccountRegistrationRequestSchema = z.object({
    fullname: z.string().trim().min(1),
    mobile_number: z.string().trim().min(1),
    notes: z.string().trim().max(200).optional(),
    emergency_contact: z.string().trim().max(200).optional(),
    email: z.string().trim().toLowerCase().pipe(z.email()),
    password: z.string().min(1),
});

export type AccountRegistrationRequestDTO = z.infer<typeof AccountRegistrationRequestSchema>;

export type AccountLoginRequestDTO = z.infer<typeof AccountLoginRequestSchema>;