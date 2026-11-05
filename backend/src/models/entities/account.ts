export type StaffRole = "employee" | "warden";
export type Role = "hiker" | StaffRole;

export abstract class Account {
    public id: number;
    public email: string;
    public password_salt: string;
    public password_hash: string;
    public abstract readonly role: Role;

    constructor(id: number, email: string, password_salt: string, password_hash: string) {
        this.id = id;
        this.email = email;
        this.password_salt = password_salt;
        this.password_hash = password_hash;
    }
}

export class Hiker extends Account {
    public readonly role = "hiker";
    public full_name: string;
    public mobile_number: string;
    public notes: string | null;
    public emergency_contact: string | null;

    constructor(id: number, email: string, password_salt: string, password_hash: string,
                full_name: string, mobile_number: string, notes: string | null, emergency_contact: string | null) {
        super(id, email, password_salt, password_hash);
        this.full_name = full_name;
        this.mobile_number = mobile_number;
        this.notes = notes;
        this.emergency_contact = emergency_contact;
    }
}

export class Staff extends Account {
    public name: string;
    public role: StaffRole;

    constructor(id: number, email: string, password_salt: string, password_hash: string,
                name: string, role: StaffRole) {
        super(id, email, password_salt, password_hash);
        this.name = name;
        this.role = role;
    }
}