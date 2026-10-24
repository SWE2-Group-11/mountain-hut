/**
 * Base class for operational API errors.
 */
export class AppError extends Error {
    public readonly statusCode: number;
    public override readonly name: string;

    constructor(statusCode: number, name: string, message: string) {
        super(message);
        this.statusCode = statusCode;
        this.name = name;
    }
}