import { AppError } from './app-error';

/**
 * HTTP 404 Not Found Error
 */
export class NotFoundError extends AppError {
    constructor(message: string = "Resource not found") {
        super(404, "NotFoundError", message);
    }
}