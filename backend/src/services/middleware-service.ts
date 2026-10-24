import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { sendBadRequestError } from "../services/error-service";

export const validateBody = (schema: z.ZodType) =>
    (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            const issue = result.error.issues[0];
            return sendBadRequestError(`${issue.path.join(".")}: ${issue.message}`, res);
        }
        req.body = result.data;
        next();
    };