import express, { Request, Response } from "express";
import { createReservation } from "../controllers/reservation-controller";
import { CreateReservationRequestSchema, CreateReservationResponseDTO } from "../models/dto/reservation-dto";
import { requireRole } from "../services/auth-service";
import { sendAppError } from "../services/error-service";
import { validateBody } from "../services/middleware-service";

const router = express.Router();

// Create a reservation, with the dietary requirements of the party (hiker)
router.post("/", requireRole("hiker"), validateBody(CreateReservationRequestSchema), (req: Request, res: Response<CreateReservationResponseDTO>) => {
    try {
        res.status(201).json(createReservation(req.user!.id, req.body));
    } catch (err) {
        sendAppError(err, res);
    }
});

export default router;