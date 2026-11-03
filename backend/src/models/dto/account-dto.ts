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
    email: z.email(),
    password: z.string().min(1),
});

export type AccountLoginRequestDTO = z.infer<typeof AccountLoginRequestSchema>;