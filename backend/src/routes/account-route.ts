import express, { Request, Response } from "express";
import { registerHiker } from "../controllers/account-controller";
import { searchStaffHikers } from "../controllers/reservation-controller";
import { AccountRegistrationRequestSchema, AccountResponseDTO } from "../models/dto/account-dto";
import { SearchStaffHikersRequestSchema, StaffHikerDTO } from "../models/dto/reservation-dto";
import { requireRole } from "../services/auth-service";
import { sendAppError } from "../services/error-service";
import { validateBody, validateQuery } from "../services/middleware-service";

const router = express.Router();

// Register a new hiker account
router.post("/", validateBody(AccountRegistrationRequestSchema), (req: Request, res: Response<AccountResponseDTO>) => {
    try {
        res.status(201).json(registerHiker(req.body));
    } catch (err) {
        sendAppError(err, res);
    }
});

// Search registered and temporary hikers by name, email and/or phone
router.get("/",
    requireRole("employee", "warden"),
    validateQuery(SearchStaffHikersRequestSchema),
    (req: Request, res: Response<StaffHikerDTO[]>) => {
    try {
        res.json(searchStaffHikers(req.parsedQuery));
    } catch (err) {
        sendAppError(err, res);
    }
});

export default router;
