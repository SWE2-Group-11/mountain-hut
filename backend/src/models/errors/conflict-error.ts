import { AppError } from './app-error';

/**
 * HTTP 409 Conflict Error
 */
export class ConflictError extends AppError {
    constructor(message: string = "Conflict with the current state of the resource") {
        super(409, "ConflictError", message);
    }
}