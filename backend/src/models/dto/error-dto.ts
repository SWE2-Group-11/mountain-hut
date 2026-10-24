/**
 * Data Transfer Object for error responses.
 * Matches the required format: { code, name, message }
 */

export class ErrorDTO {
    public code: number;
    public name: string;
    public message: string;

    constructor(code: number, name: string, message: string) {
        this.code = code;
        this.name = name;
        this.message = message;
    }
}
