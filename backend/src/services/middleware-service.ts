import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { sendBadRequestError } from "../services/error-service";

// req.parsedQuery: the query string validated by validateQuery
declare global {
    namespace Express {
        interface Request {
            parsedQuery: any;
        }
    }
}

/**
 * Sends a 400 Bad Request describing the first validation issue.
 */
const sendZodBadRequestError = (error: z.ZodError, res: Response): Response => {
    const issue = error.issues[0];
    return sendBadRequestError(`${issue.path.join(".")}: ${issue.message}`, res);
};

export const validateBody = (schema: z.ZodType) =>
    (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            return sendZodBadRequestError(result.error, res);
        }
        req.body = result.data;
        next();
    };

/**
 * Validates the query string with the given schema and stores the parsed value in req.parsedQuery.
 * Express 5 exposes req.query as read-only, so the parsed value cannot replace it.
 */
export const validateQuery = (schema: z.ZodType) =>
    (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req.query);
        if (!result.success) {
            return sendZodBadRequestError(result.error, res);
        }
        req.parsedQuery = result.data;
        next();
    };