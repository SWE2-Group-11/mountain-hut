import { DateTime } from "luxon";
import { createHikerAccount, getAccountById, updatePassword } from "../dao/account-dao";
import { getHikerByEmail } from "../dao/hiker-dao";
import { consumeResetToken, issueResetToken } from "../dao/password-reset-dao";
import { PASSWORD_RESET_COOLDOWN_MINUTES, PASSWORD_RESET_TTL_HOURS } from "../config/config";
import { notifyPasswordResetRequested } from "../notifications/password-reset";
import {
    AccountRegistrationRequestDTO,
    AccountResponseDTO,
    ChangePasswordRequestDTO,
    ResetPasswordRequestDTO,
} from "../models/dto/account-dto";
import { BadRequestError } from "../models/errors/badrequest-error";
import { ConflictError } from "../models/errors/conflict-error";
import { NotFoundError } from "../models/errors/notfound-error";
import { UnauthorizedError } from "../models/errors/unauthorized-error";
import { accountEntityToResponseDTO } from "../services/mapper-service";
import { generatePasswordHash, generateResetToken, hashResetToken, verifyPassword } from "../services/password-service";

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

/**
 * Changes the password of the logged-in account after checking the current one.
 * Clears the "must change password" flag and invalidates pending reset links.
 * @returns The updated account, to be stored in the session.
 * @throws UnauthorizedError if the current password is wrong.
 * @throws NotFoundError if the account no longer exists.
 */
export const changePassword = (accountId: number, { current_password, new_password }: ChangePasswordRequestDTO): AccountResponseDTO => {
    const account = getAccountById(accountId);
    if (!account) {
        throw new NotFoundError("Account not found");
    }
    if (!verifyPassword(current_password, account.password_salt, account.password_hash)) {
        throw new UnauthorizedError("Current password is incorrect");
    }
    // The account can be deleted between the read and the update
    if (!updatePassword(accountId, new_password)) {
        throw new NotFoundError("Account not found");
    }
    account.must_change_password = false;
    return accountEntityToResponseDTO(account);
};

/**
 * Emails a reset link to the hiker registered with this email. Does nothing, without telling
 * the caller, if no hiker has this email or a link was sent less than the cooldown ago.
 */
export const requestPasswordReset = (email: string): void => {
    const hiker = getHikerByEmail(email);
    if (!hiker?.id || !hiker.email) {
        return;
    }

    const now = DateTime.utc();
    const token = generateResetToken();
    const issued = issueResetToken({
        account_id: hiker.id,
        token_hash: hashResetToken(token),
        created_at: now.toJSDate(),
        expires_at: now.plus({ hours: PASSWORD_RESET_TTL_HOURS }).toJSDate(),
    }, now.minus({ minutes: PASSWORD_RESET_COOLDOWN_MINUTES }).toJSDate());

    if (issued) {
        void notifyPasswordResetRequested({ email: hiker.email, full_name: hiker.full_name }, token);
    }
};

/**
 * Sets a new password through the token of a reset link. The token works only once.
 * @throws BadRequestError if the token is unknown, already used, replaced by a newer one or expired.
 */
export const resetPassword = ({ token, new_password }: ResetPasswordRequestDTO): void => {
    // Hashed before the lookup, so valid and invalid tokens take the same time
    const passwordHash = generatePasswordHash(new_password);
    if (!consumeResetToken(hashResetToken(token), passwordHash, new Date())) {
        throw new BadRequestError("Invalid or expired reset link");
    }
};
