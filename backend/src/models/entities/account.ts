export type Role = "manager" | "device";

export class Account {
    public id: number;
    public username: string;
    public salt: string;
    public hash: string;
    public role: Role;

    constructor(id: number, username: string, salt: string, hash: string, role: Role) {
        this.id = id;
        this.username = username;
        this.salt = salt;
        this.hash = hash;
        this.role = role;
    }
}