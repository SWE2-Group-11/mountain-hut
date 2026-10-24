import { AppError } from './app-error';

/**
 * HTTP 403 Forbidden Error
 */
export class ForbiddenError extends AppError {
    constructor(message: string = "Not allowed for this role") {
        super(403, "ForbiddenError", message);
    }
}