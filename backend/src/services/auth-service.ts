import { Request, Response, NextFunction } from "express";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { getAccountByCredentials } from "../dao/account-dao";
import { Role } from "../models/entities/account";
import { AccountResponseDTO } from "../models/dto/account-dto";
import { accountEntityToResponseDTO } from "./mapper-service";
import { sendForbiddenError, sendUnauthorizedError } from "./error-service";

// Type of req.user: what Passport keeps in the session (never salt or hash)
declare global {
    namespace Express {
        interface User extends AccountResponseDTO {}
    }
}

passport.use(new LocalStrategy((username, password, cb) => {
    try {
        const account = getAccountByCredentials(username, password);
        if (!account) {
            return cb(null, false, { message: "Incorrect username or password" });
        }
        return cb(null, accountEntityToResponseDTO(account));
    } catch (err) {
        return cb(err);
    }
}));

passport.serializeUser((user: Express.User, cb) => {
    cb(null, user);
});

passport.deserializeUser((user: Express.User, cb) => {
    cb(null, user);
});

/**
 * Logs in with username and password.
 * On failure it answers 401 in ErrorDTO format instead of Passport's plain "Unauthorized".
 */
export const authenticateLocal = (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate("local", (err: unknown, user: Express.User | false, info?: { message: string }) => {
        if (err) return next(err);
        if (!user) {
            return sendUnauthorizedError(info?.message ?? "Incorrect username or password", res);
        }
        req.login(user, (err) => (err ? next(err) : next()));
    })(req, res, next);
};

/**
 * Allows the request only if the session belongs to one of the given roles.
 * 401 if not logged in, 403 if logged in with another role.
 */
export const requireRole = (...roles: Role[]) =>
    (req: Request, res: Response, next: NextFunction) => {
        if (!req.isAuthenticated()) {
            return sendUnauthorizedError("Not authenticated", res);
        }
        if (!roles.includes(req.user.role)) {
            return sendForbiddenError("Not allowed for this role", res);
        }
        next();
    };

export const authenticateSession = passport.authenticate("session");