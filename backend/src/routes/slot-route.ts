import express, { Request, Response } from "express";
import {
    createSlot,
    getAvailability,
    getConfigurations,
    getSlots
} from "../controllers/slot-controller";
import {
    CreateSlotRequestSchema,
    GetAvailabilityRequestSchema,
    GetAvailabilityResponseDTO,
    GetConfigurationsRequestSchema,
    GetSlotsRequestSchema,
    SlotConfigurationDTO,
    SlotDTO,
} from "../models/dto/slot-dto";
import { requireRole } from "../services/auth-service";
import { validateBody, validateQuery } from "../services/middleware-service";
import { repeatWeeklySchedule } from "../controllers/weekly-schedule-controller";
import {
    CopyWeeklyScheduleRequestSchema,
    CopyWeeklyScheduleResponseDTO,
} from "../models/dto/weekly-schedule-dto";
import { defineMenu, getReusableMenus } from "../controllers/slot-menu-controller";
import {
    DefineMenuRequestSchema,
    GetReusableMenusRequestSchema,
    SlotMenuDTO,
} from "../models/dto/slot-menu-dto";

const router = express.Router();


// Slots of a date, with their availability
router.get(
    "/",
    validateQuery(GetSlotsRequestSchema),
    (req: Request, res: Response<SlotDTO[]>) => {

        res.json(getSlots(req.parsedQuery));
    });

// Reusable table configurations
router.get(
    "/configurations",
    requireRole("employee", "warden"),
    validateQuery(GetConfigurationsRequestSchema),
    (req: Request, res: Response<SlotConfigurationDTO[]>) => {

        res.json(getConfigurations(req.parsedQuery));
    });

// Create a slot
router.post(
    "/",
    requireRole("employee", "warden"),
    validateBody(CreateSlotRequestSchema),
    (req: Request, res: Response<SlotConfigurationDTO>) => {

        res.status(201).json(createSlot(req.body));
    });

// Availability of a slot for a party, with one possible table arrangement
router.get(
    "/availability",
    validateQuery(GetAvailabilityRequestSchema),
    (req: Request, res: Response<GetAvailabilityResponseDTO>) => {

        res.json(getAvailability(req.parsedQuery));
    });

// Copy the schedule of a week into one or more later weeks
router.post(
    "/copy-week",
    requireRole("employee", "warden"),
    validateBody(CopyWeeklyScheduleRequestSchema),
    (req: Request, res: Response<CopyWeeklyScheduleResponseDTO>) => {

        res.status(201).json(repeatWeeklySchedule(req.body));
    });

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
