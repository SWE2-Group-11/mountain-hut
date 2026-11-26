import { describe, expect, it } from "vitest";
import { DefineMenuRequestSchema, GetReusableMenusRequestSchema } from "../../models/dto/slot-menu-dto";
import { GetConfigurationsRequestSchema } from "../../models/dto/slot-dto";

const BODY = { date: "2030-06-15", startTime: "19:00", menu: "**Dinner**\n- *Polenta*\n  - gluten free" };

describe("DefineMenuRequestSchema", () => {
    it.each([BODY.menu, "  - indented item", null])("accepts the menu %j unchanged", (menu) => {
        expect(DefineMenuRequestSchema.parse({ ...BODY, menu })).toEqual({ ...BODY, menu });
    });

    it.each(["", "   ", "\n\t"])("rejects the blank menu %j", (menu) => {
        const result = DefineMenuRequestSchema.safeParse({ ...BODY, menu });

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].message).toBe("The menu must not be blank");
    });

    it.each([undefined, 42, ["menu"]])("rejects a missing or non-string menu: %j", (menu) => {
        // Removing a menu requires an explicit null
        expect(DefineMenuRequestSchema.safeParse({ ...BODY, menu }).success).toBe(false);
    });

    it.each([{ date: "2030-02-30" }, { startTime: "24:00" }])(
        "rejects an invalid slot key %o",
        (override) => {
            expect(DefineMenuRequestSchema.safeParse({ ...BODY, ...override }).success).toBe(false);
        },
    );
});

describe("GetReusableMenusRequestSchema", () => {
    it("reuses GetConfigurationsRequestSchema (already covered in slot-dto tests)", () => {
        expect(GetReusableMenusRequestSchema).toBe(GetConfigurationsRequestSchema);
    });
});