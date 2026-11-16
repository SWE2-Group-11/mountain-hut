export type StaffRole = "employee" | "warden";
export type Role = "hiker" | StaffRole;

export abstract class Account {
    public id: number;
    public email: string;
    public password_salt: string;
    public password_hash: string;
    public must_change_password: boolean;
    public abstract readonly role: Role;

    constructor(id: number, email: string, password_salt: string, password_hash: string, must_change_password: boolean) {
        this.id = id;
        this.email = email;
        this.password_salt = password_salt;
        this.password_hash = password_hash;
        this.must_change_password = must_change_password;
    }
}

export class Hiker extends Account {
    public readonly role = "hiker";
    public full_name: string;
    public mobile_number: string;
    public notes: string | null;
    public emergency_contact: string | null;

    constructor(id: number, email: string, password_salt: string, password_hash: string, must_change_password: boolean,
                full_name: string, mobile_number: string, notes: string | null, emergency_contact: string | null) {
        super(id, email, password_salt, password_hash, must_change_password);
        this.full_name = full_name;
        this.mobile_number = mobile_number;
        this.notes = notes;
        this.emergency_contact = emergency_contact;
    }
}

export class Staff extends Account {
    public name: string;
    public role: StaffRole;

    constructor(id: number, email: string, password_salt: string, password_hash: string, must_change_password: boolean,
                name: string, role: StaffRole) {
        super(id, email, password_salt, password_hash, must_change_password);
        this.name = name;
        this.role = role;
    }
}