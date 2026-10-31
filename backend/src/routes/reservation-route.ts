import express, { Request, Response } from "express";
import { requireRole } from "../services/auth-service";
import { validateBody } from "../services/middleware-service";
import { createReservation } from "../controllers/reservation-controller";
import { CreateReservationRequestSchema, CreateReservationResponseDTO } from "../models/dto/reservation-dto";

const router = express.Router();

// Book a table for the logged-in hiker
router.post("/", requireRole("hiker"), validateBody(CreateReservationRequestSchema), (req: Request, res: Response<CreateReservationResponseDTO>) => {
    res.status(201).json(createReservation(req.user!.id, req.body));
});

export default router;
