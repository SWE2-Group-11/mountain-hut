import { AppError } from './app-error';

/**
 * HTTP 400 Bad Request Error
 */
export class BadRequestError extends AppError {
    constructor(message: string = "Bad request error") {
        super(400, "BadRequestError", message);
    }
}