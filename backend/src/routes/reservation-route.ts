import express, { Request, Response } from "express";
import {
    createReservation,
    getReservations,
    updateReservation,
} from "../controllers/reservation-controller";
import {
    CreateReservationRequestSchema,
    CreateReservationResponseDTO,
    ReservationIdParamsDTO,
    ReservationIdParamsSchema,
    UpdateReservationRequestSchema,
    UpdateReservationResponseDTO,
} from "../models/dto/reservation-dto";
import { requireRole } from "../services/auth-service";
import { sendAppError } from "../services/error-service";
import { validateBody, validateParams } from "../services/middleware-service";

const router = express.Router();

// Create a reservation, with the dietary requirements of the party (hiker)
router.post("/", requireRole("hiker"), validateBody(CreateReservationRequestSchema), (req: Request, res: Response<CreateReservationResponseDTO>) => {
    try {
        res.status(201).json(createReservation(req.user!.id, req.body));
    } catch (err) {
        sendAppError(err, res);
    }
});

// Active reservations of the logged-in hiker
router.get("/", requireRole("hiker"), (req: Request, res: Response<CreateReservationResponseDTO[]>) => {
    try {
        res.json(getReservations(req.user!.id));
    } catch (err) {
        sendAppError(err, res);
    }
});

// Change a reservation of the logged-in hiker
router.patch("/:reservationId",
    requireRole("hiker"),
    validateParams(ReservationIdParamsSchema),
    validateBody(UpdateReservationRequestSchema),
    (req: Request, res: Response<UpdateReservationResponseDTO>) => {
    try {
        const { reservationId } = req.parsedParams as ReservationIdParamsDTO;
        res.json(updateReservation(req.user!.id, reservationId, req.body));
    } catch (err) {
        sendAppError(err, res);
    }
});

export default router;
