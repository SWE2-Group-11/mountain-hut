import express, { NextFunction, Request, Response } from "express";
import { changePassword, registerHiker, requestPasswordReset, resetPassword } from "../controllers/account-controller";
import { searchStaffHikers } from "../controllers/reservation-controller";
import {
    AccountRegistrationRequestSchema,
    AccountResponseDTO,
    ChangePasswordRequestSchema,
    ForgotPasswordRequestSchema,
    ResetPasswordRequestSchema,
} from "../models/dto/account-dto";
import { SearchStaffHikersRequestSchema, StaffHikerDTO } from "../models/dto/reservation-dto";
import { requireAuthenticated, requireRole } from "../services/auth-service";
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

// Change the password of the logged-in account; also allowed while a temporary password must be changed
router.put("/current/password",
    requireAuthenticated,
    validateBody(ChangePasswordRequestSchema),
    (req: Request, res: Response<AccountResponseDTO>, next: NextFunction) => {
    let account: AccountResponseDTO;
    try {
        account = changePassword(req.user!.id, req.body);
    } catch (err) {
        return sendAppError(err, res);
    }
    // The session keeps a copy of the account: refresh it so the flag is cleared
    req.login(account, (err) => (err ? next(err) : res.json(account)));
});

// Ask for a password reset email; same answer whether or not the email is registered
router.post("/password-reset", validateBody(ForgotPasswordRequestSchema), (req: Request, res: Response) => {
    try {
        requestPasswordReset(req.body.email);
        res.status(202).end();
    } catch (err) {
        sendAppError(err, res);
    }
});

// Set a new password with the token of a reset email
router.post("/password-reset/confirm", validateBody(ResetPasswordRequestSchema), (req: Request, res: Response) => {
    try {
        resetPassword(req.body);
        res.status(204).end();
    } catch (err) {
        sendAppError(err, res);
    }
});

export default router;
