import { z } from "zod";
import { Role } from "../entities/account";

export class AccountResponseDTO {
    public id: number;
    public username: string;
    public role: Role;

    constructor(id: number, username: string, role: Role) {
        this.id = id;
        this.username = username;
        this.role = role;
    }
}

export const AccountLoginRequestSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
});

export type AccountLoginRequestDTO = z.infer<typeof AccountLoginRequestSchema>;