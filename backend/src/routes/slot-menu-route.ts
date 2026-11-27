import express, { Request, Response } from "express";
import { defineMenu, getReusableMenus } from "../controllers/slot-menu-controller";
import {
    DefineMenuRequestSchema,
    GetReusableMenusRequestSchema,
    SlotMenuDTO,
} from "../models/dto/slot-menu-dto";
import { requireRole } from "../services/auth-service";
import { validateBody, validateQuery } from "../services/middleware-service";

const router = express.Router();

// Reusable menus of existing slots
router.get(
    "/menus",
    requireRole("employee", "warden"),
    validateQuery(GetReusableMenusRequestSchema),
    (req: Request, res: Response<string[]>) => {

        res.json(getReusableMenus(req.parsedQuery));
    });

// Define (or replace) the menu of a slot
router.put(
    "/menu",
    requireRole("employee", "warden"),
    validateBody(DefineMenuRequestSchema),
    (req: Request, res: Response<SlotMenuDTO>) => {

        res.json(defineMenu(req.body));
    });

export default router;