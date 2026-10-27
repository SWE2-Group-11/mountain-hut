import { ErrorDTO } from '../models/dto/error-dto';
import { AccountResponseDTO } from '../models/dto/account-dto';
import { AppError } from '../models/errors/app-error';
import { Account } from '../models/entities/account';

/**
 * Maps an operational AppError or a generic internal error into an ErrorDTO instance.
 */
export const appErrorToDTO = (error: unknown): ErrorDTO => {
    let errorDTO: ErrorDTO;

    if (error instanceof AppError) {
        errorDTO = new ErrorDTO(
            error.statusCode,
            error.name,
            error.message
        );
    } else {
        // Fallback for unhandled internal server errors (500)
        errorDTO = new ErrorDTO(
            500,
            "InternalServerError",
            "An unexpected error occurred"
        );
    }

    return errorDTO;
};

export const accountEntityToResponseDTO = (account: Account): AccountResponseDTO => {
    return new AccountResponseDTO(account.id, account.username, account.role);
}