import { AppError } from './app-error';

/**
 * HTTP 401 Unauthorized Error
 */
export class UnauthorizedError extends AppError {
    constructor(message: string = "Authentication required") {
        super(401, "UnauthorizedError", message);
    }
}