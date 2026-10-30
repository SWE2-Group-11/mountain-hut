import express, { Request, Response } from "express";
import { sendBadRequestError } from "../services/error-service";
import { getSlots } from "../controllers/slot-controller";
import { GetSlotsRequestSchema, SlotDTO } from "../models/dto/slot-dto";

const router = express.Router();

// Slots of a day that can still be booked (public)
router.get("/", (req: Request, res: Response<SlotDTO[]>) => {
    const result = GetSlotsRequestSchema.safeParse(req.query);
    if (!result.success) {
        const issue = result.error.issues[0];
        return sendBadRequestError(`${issue.path.join(".")}: ${issue.message}`, res);
    }
    res.json(getSlots(result.data));
});

export default router;
