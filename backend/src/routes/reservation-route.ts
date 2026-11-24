import express, { NextFunction, Request, Response } from "express";
import {
    cancelReservation,
    createReservation,
    createStaffReservation,
    getReservations,
    updateReservation,
} from "../controllers/reservation-controller";
import {
    CreateReservationRequestSchema,
    CreateReservationResponseDTO,
    CreateStaffReservationRequestSchema,
    CreateStaffReservationResponseDTO,
    ReservationIdParamsDTO,
    ReservationIdParamsSchema,
    UpdateReservationRequestSchema,
    UpdateReservationResponseDTO,
    ReservationWithMenuResponseDTO,
} from "../models/dto/reservation-dto";
import { requireRole } from "../services/auth-service";
import { sendAppError } from "../services/error-service";
import { validateBody, validateParams } from "../services/middleware-service";

const router = express.Router();

const validateHikerReservation = validateBody(CreateReservationRequestSchema);
const validateStaffReservation = validateBody(CreateStaffReservationRequestSchema);

// Create a reservation, with the dietary requirements of the party.
// A hiker books for themself; employee book on behalf of the hiker given in the body.
router.post("/",
    requireRole("hiker", "employee", "warden"),
    (req: Request, res: Response, next: NextFunction) =>
        (req.user!.role === "hiker" ? validateHikerReservation : validateStaffReservation)(req, res, next),
    (req: Request, res: Response<CreateReservationResponseDTO | CreateStaffReservationResponseDTO>) => {
    try {
        res.status(201).json(req.user!.role === "hiker"
            ? createReservation(req.user!.id, req.body)
            : createStaffReservation(req.body));
    } catch (err) {
        sendAppError(err, res);
    }
});

// Active reservations of the logged-in hiker
router.get("/", requireRole("hiker"), (req: Request, res: Response<ReservationWithMenuResponseDTO[]>) => {
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

// Cancel a reservation of the logged-in hiker
router.delete("/:reservationId",
    requireRole("hiker"),
    validateParams(ReservationIdParamsSchema),
    (req: Request, res: Response) => {
    try {
        const { reservationId } = req.parsedParams as ReservationIdParamsDTO;
        cancelReservation(req.user!.id, reservationId);
        res.status(204).end();
    } catch (err) {
        sendAppError(err, res);
    }
});

export default router;
