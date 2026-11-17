import { z } from "zod";
import { Role } from "../entities/account";
import { PASSWORD_MIN_LENGTH } from "../../config/config";

export class AccountResponseDTO {
    public id: number;
    public email: string;
    public role: Role;
    public must_change_password: boolean;

    constructor(id: number, email: string, role: Role, must_change_password: boolean) {
        this.id = id;
        this.email = email;
        this.role = role;
        this.must_change_password = must_change_password;
    }
}

const EmailSchema = z.string().trim().toLowerCase().pipe(z.email());
const NewPasswordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(128);

export const AccountLoginRequestSchema = z.object({
    // what is this hideous thing doing: checking if email is a string,
    // trimming leading and ending spaces and lowercase the entire thing.
    // THEN pipe() passes the result to the email format checker
    email: EmailSchema,
    password: z.string().min(1),
});

export const AccountRegistrationRequestSchema = z.object({
    fullname: z.string().trim().min(1),
    mobile_number: z.string().trim().min(1),
    notes: z.string().trim().max(200).optional(),
    emergency_contact: z.string().trim().max(200).optional(),
    email: EmailSchema,
    password: z.string().min(1),
});

export const ChangePasswordRequestSchema = z.object({
    current_password: z.string().min(1),
    new_password: NewPasswordSchema,
}).refine((body) => body.current_password !== body.new_password, {
    path: ["new_password"],
    message: "Must differ from the current password",
});

export const ForgotPasswordRequestSchema = z.object({
    email: EmailSchema,
});

export const ResetPasswordRequestSchema = z.object({
    token: z.string().min(1).max(256),
    new_password: NewPasswordSchema,
});

export type AccountRegistrationRequestDTO = z.infer<typeof AccountRegistrationRequestSchema>;

export type AccountLoginRequestDTO = z.infer<typeof AccountLoginRequestSchema>;

export type ChangePasswordRequestDTO = z.infer<typeof ChangePasswordRequestSchema>;

export type ForgotPasswordRequestDTO = z.infer<typeof ForgotPasswordRequestSchema>;

export type ResetPasswordRequestDTO = z.infer<typeof ResetPasswordRequestSchema>;
