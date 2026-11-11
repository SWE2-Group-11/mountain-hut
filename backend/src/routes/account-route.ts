import express, { Request, Response } from "express";
import { registerHiker } from "../controllers/account-controller";
import { AccountRegistrationRequestSchema, AccountResponseDTO } from "../models/dto/account-dto";
import { sendAppError } from "../services/error-service";
import { validateBody } from "../services/middleware-service";

const router = express.Router();

// Register a new hiker account
router.post("/", validateBody(AccountRegistrationRequestSchema), (req: Request, res: Response<AccountResponseDTO>) => {
    try {
        res.status(201).json(registerHiker(req.body));
    } catch (err) {
        sendAppError(err, res);
    }
});

export default router;
