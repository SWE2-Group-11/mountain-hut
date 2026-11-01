import express, { Request, Response } from "express";
import { requireRole } from "../services/auth-service";
import { sendBadRequestError } from "../services/error-service";
import { validateBody } from "../services/middleware-service";
import { createSlot, getConfigurations } from "../controllers/slot-controller";
import {
    CreateSlotRequestSchema,
    GetConfigurationsRequestSchema,
    SlotConfigurationDTO,
} from "../models/dto/slot-dto";

const router = express.Router();

// Saved configurations that can be reused (staff only)
router.get("/configurations", requireRole("employee", "warden"), (req: Request, res: Response<SlotConfigurationDTO[]>) => {
    const result = GetConfigurationsRequestSchema.safeParse(req.query);
    if (!result.success) {
        const issue = result.error.issues[0];
        return sendBadRequestError(`${issue.path.join(".")}: ${issue.message}`, res);
    }
    res.json(getConfigurations(result.data));
});

// Create a slot with its tables and seats (staff only)
router.post("/", requireRole("employee", "warden"), validateBody(CreateSlotRequestSchema), (req: Request, res: Response<SlotConfigurationDTO>) => {
    res.status(201).json(createSlot(req.body));
});

export default router;
