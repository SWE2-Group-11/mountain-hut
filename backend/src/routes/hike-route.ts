import express, { type Request, type Response } from "express";
import { listPopularHikes, registerHike } from "../controllers/hike-controller";
import {
    GetPopularHikesRequestSchema,
    RegisterHikeRequestSchema,
    type PopularHikeResponseDTO,
    type RegisterHikeResponseDTO
} from "../models/dto/hike-dto";
import { requireRole } from "../services/auth-service";
import { validateBody, validateQuery } from "../services/middleware-service";

const router = express.Router();

// Register a planned hike for the authenticated user
router.post(
    "/",
    requireRole("hiker"),
    validateBody(RegisterHikeRequestSchema),
    (req: Request, res: Response<RegisterHikeResponseDTO>) => {
        const hike = registerHike(req.user!.id, req.body);
        res.status(201).json(hike);
    }
);

// List predefined hikes fro the registration form
router.get(
    "/popular",
    requireRole("hiker"),
    validateQuery(GetPopularHikesRequestSchema),
    (req: Request, res: Response<PopularHikeResponseDTO[]>) => {
        res.json(listPopularHikes(req.parsedQuery));
    }
);

export default router;