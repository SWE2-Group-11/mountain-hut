import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerHiker } from "../../controllers/account-controller";
import { createHikerAccount } from "../../dao/account-dao";
import { AccountResponseDTO, type AccountRegistrationRequestDTO } from "../../models/dto/account-dto";
import { Hiker } from "../../models/entities/account";
import { ConflictError } from "../../models/errors/conflict-error";

/*
UNIT tests for account-controller.
Covered: registerHiker (POST /accounts). The DAO is mocked, the response mapping is the real one.
*/

vi.mock("../../dao/account-dao", () => ({ createHikerAccount: vi.fn() }));

const ACCOUNT_ID = 7;

const REQUEST: AccountRegistrationRequestDTO = {
    fullname: "Mario Rossi",
    mobile_number: "+39 333 123 4567",
    email: "mario@mountainhut.test",
    password: "secret",
    notes: "Vegetarian",
    emergency_contact: "Anna Rossi +39 333 000 0000",
};

const created = (notes: string | null = REQUEST.notes!, emergency_contact: string | null = REQUEST.emergency_contact!) =>
    new Hiker(ACCOUNT_ID, REQUEST.email, "salt", "hash", false,
        REQUEST.fullname, REQUEST.mobile_number, notes, emergency_contact);

beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(createHikerAccount).mockReturnValue(created());
});

describe("POST /accounts — registerHiker controller", () => {
    it("creates the hiker account with the fields of the request", () => {
        registerHiker(REQUEST);

        expect(createHikerAccount).toHaveBeenCalledExactlyOnceWith({
            email: REQUEST.email,
            password: REQUEST.password,
            full_name: REQUEST.fullname,
            mobile_number: REQUEST.mobile_number,
            notes: REQUEST.notes,
            emergency_contact: REQUEST.emergency_contact,
        });
    });

    it("saves missing notes and emergency contact as null", () => {
        // api.md: null if omitted
        const { notes: _notes, emergency_contact: _contact, ...required } = REQUEST;
        vi.mocked(createHikerAccount).mockReturnValue(created(null, null));

        registerHiker(required);

        expect(createHikerAccount).toHaveBeenCalledWith(expect.objectContaining({
            notes: null, emergency_contact: null,
        }));
    });

    it("does not ask the hiker to change the password", () => {
        // the hiker chose the password while registering
        registerHiker(REQUEST);

        expect(vi.mocked(createHikerAccount).mock.calls[0][0]).not.toHaveProperty("must_change_password");
    });

    it("returns the id, the email and the hiker role of the new account", () => {
        const response = registerHiker(REQUEST);

        expect(response).toBeInstanceOf(AccountResponseDTO);
        expect(response).toEqual(new AccountResponseDTO(ACCOUNT_ID, REQUEST.email, "hiker"));
    });

    it("returns no password data", () => {
        const response = registerHiker(REQUEST);

        expect(response).not.toHaveProperty("password");
        expect(response).not.toHaveProperty("password_salt");
        expect(response).not.toHaveProperty("password_hash");
    });

    it("throws ConflictError when the email is already registered", () => {
        vi.mocked(createHikerAccount).mockReturnValue(null);

        expect(() => registerHiker(REQUEST)).toThrow(ConflictError);
        expect(() => registerHiker(REQUEST)).toThrow("An account with this email already exists");
    });

    it("lets a DAO failure through instead of swallowing it", () => {
        const boom = new Error("SQLITE_BUSY: database is locked");
        vi.mocked(createHikerAccount).mockImplementation(() => {
            throw boom;
        });

        expect(() => registerHiker(REQUEST)).toThrow(boom);
    });
});