import { createHikerAccount } from "../dao/account-dao";
import { AccountRegistrationRequestDTO, AccountResponseDTO } from "../models/dto/account-dto";
import { ConflictError } from "../models/errors/conflict-error";
import { accountEntityToResponseDTO } from "../services/mapper-service";

/**
 * Registers a new account. Registrations are always hiker accounts.
 * @param request The request payload containing full name, mobile number, email, password and the optional notes and emergency contact.
 * @returns The created account (no password data).
 * @throws ConflictError if the email is already registered.
 */
export const registerHiker = (request: AccountRegistrationRequestDTO): AccountResponseDTO => {
    const { fullname, mobile_number, email, password, notes, emergency_contact } = request;
    const hiker = createHikerAccount({
        email,
        password,
        full_name: fullname,
        mobile_number,
        notes: notes ?? null,
        emergency_contact: emergency_contact ?? null,
    });
    if (!hiker) {
        throw new ConflictError("An account with this email already exists");
    }
    return accountEntityToResponseDTO(hiker);
};
