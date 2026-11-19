import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { z } from "zod";
import { validateParams } from "../../services/middleware-service";

const schema = z.object({
    reservationId: z.coerce.number().int().positive(),
});

function makeContext(reservationId: string) {
    const req = {
        params: { reservationId },
    } as unknown as Request;

    const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    } as unknown as Response;

    return { req, res, next: vi.fn() };
}

describe("validateParams", () => {
    it("stores parsed data, preserves raw params and calls next once", () => {
        const { req, res, next } = makeContext("42");
        const rawParams = req.params;

        validateParams(schema)(req, res, next);

        expect(req.parsedParams).toEqual({ reservationId: 42 });

        expect(req.params).toBe(rawParams);
        expect(req.params).toEqual({ reservationId: "42" });

        expect(next).toHaveBeenCalledExactlyOnceWith();
        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
    });

    it("answers 400 without calling next when validation fails", () => {
        const { req, res, next } = makeContext("invalid");

        validateParams(schema)(req, res, next);

        expect(res.status).toHaveBeenCalledExactlyOnceWith(400);
        expect(res.json).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                code: 400,
                name: "BadRequestError",
                message: expect.stringContaining("reservationId"),
            })
        );

        expect(req.parsedParams).toBeUndefined();
        expect(next).not.toHaveBeenCalled();
    });
});