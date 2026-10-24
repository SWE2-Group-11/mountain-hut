import express, { Request, Response } from "express";
import { authenticateLocal } from "../services/auth-service";
import { sendUnauthorizedError } from "../services/error-service";
import { AccountLoginRequestSchema, AccountResponseDTO } from "../models/dto/account-dto";
import { validateBody } from "../services/middleware-service";

const router = express.Router();

// Login
router.post("/", validateBody(AccountLoginRequestSchema), authenticateLocal, (req: Request, res: Response<AccountResponseDTO>) => {
    res.status(201).json(req.user);
});

// Current session
router.get("/current", (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
        return sendUnauthorizedError("Not authenticated", res);
    }
    res.json(req.user);
});

// Logout
router.delete("/current", (req: Request, res: Response, next) => {
    req.logout((err) => {
        if (err) return next(err);
        res.status(204).end();
    });
});

export default router;