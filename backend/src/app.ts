import express, { Request, Response, NextFunction } from "express";
import session from "express-session";
import morgan from "morgan";
import cors from "cors";
import { ROUTES, CLIENT_ORIGIN, SESSION_SECRET } from "./config/config";
import { authenticateSession, requireRole } from "./services/auth-service";
import authRouter from "./routes/auth-route";
import servicesRoute from "./routes/services-route";
import ticketsRoute from "./routes/tickets-route";
import { sendAppError, sendNotFoundError, sendBadRequestError } from "./services/error-service";

// Init express
export const app = express();

// Middlewares
app.use(morgan("dev"));

app.use(cors({
    origin: CLIENT_ORIGIN,
    optionsSuccessStatus: 200,
    credentials: true
}));
app.use(express.json());

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

app.use(authenticateSession);

// Unknown routes → 404 in ErrorDTO format
app.use((req: Request, res: Response) => {
    sendNotFoundError("Route not found", res);
});

// Unhandled errors (e.g. malformed JSON) → ErrorDTO format
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError && "body" in err) {
        return sendBadRequestError("Malformed JSON body", res);
    }
    sendAppError(err, res);
});