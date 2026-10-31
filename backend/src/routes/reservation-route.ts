import express, { Request, Response } from "express";
import { requireRole } from "../services/auth-service";
import { validateBody } from "../services/middleware-service";
import { createReservation } from "../controllers/reservation-controller";
import { hasBookingForSlot } from "../dao/booking-dao";
import { ConflictError } from "../models/errors/conflict-error";
import { CreateReservationRequestSchema, CreateReservationResponseDTO } from "../models/dto/reservation-dto";

const router = express.Router();

// Book a table for the logged-in hiker
router.post("/", requireRole("hiker"), validateBody(CreateReservationRequestSchema), (req: Request, res: Response<CreateReservationResponseDTO>) => {
    const hikerId = req.user!.id;
    const { date, slot } = req.body;

    // MH-01: only one booking per time slot on a date
    if (hasBookingForSlot(hikerId, date, slot)) {
        throw new ConflictError("You already have a booking for this slot");
    }

    res.status(201).json(createReservation(hikerId, req.body));
});

export default router;