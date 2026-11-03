import express, { Request, Response } from "express";
import { z } from "zod";
import { createSlot, getConfigurations, getSlots } from "../controllers/slot-controller";
import {
    CreateSlotRequestSchema,
    GetConfigurationsRequestSchema,
    GetSlotsRequestSchema,
    SlotConfigurationDTO,
    SlotDTO,
} from "../models/dto/slot-dto";
import { requireRole } from "../services/auth-service";
import { sendAppError, sendBadRequestError } from "../services/error-service";
import { validateBody } from "../services/middleware-service";

const router = express.Router();

/**
 * Parses the query string with the given schema.
 * Express 5 exposes req.query as read-only, so the parsed value is returned instead of reassigned.
 */
const parseQuery = <S extends z.ZodType>(schema: S, req: Request, res: Response): z.output<S> | null => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
        const issue = result.error.issues[0];
        sendBadRequestError(`${issue.path.join(".")}: ${issue.message}`, res);
        return null;
    }
    return result.data;
};

// Slots of a date, with their availability
router.get("/", (req: Request, res: Response<SlotDTO[]>) => {
    const query = parseQuery(GetSlotsRequestSchema, req, res);
    if (!query) return;
    try {
        res.json(getSlots(query));
    } catch (err) {
        sendAppError(err, res);
    }
});

// Reusable table configurations
router.get("/configurations", requireRole("employee", "warden"), (req: Request, res: Response<SlotConfigurationDTO[]>) => {
    const query = parseQuery(GetConfigurationsRequestSchema, req, res);
    if (!query) return;
    try {
        res.json(getConfigurations(query));
    } catch (err) {
        sendAppError(err, res);
    }
});

// Create a slot
router.post("/", requireRole("employee", "warden"), validateBody(CreateSlotRequestSchema), (req: Request, res: Response<SlotConfigurationDTO>) => {
    try {
        res.status(201).json(createSlot(req.body));
    } catch (err) {
        sendAppError(err, res);
    }
});

export default router;
