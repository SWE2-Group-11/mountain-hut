export type Role = 'hiker' | 'employee' | 'warden';

export class Account {
    public id: number;
    public first_name: string;
    public last_name: string;
    public email: string;
    public password_salt: string;
    public password_hash: string;
    public role: Role;

    constructor(id: number, first_name: string, last_name: string, email: string,
                password_salt: string, password_hash: string, role: Role) {
        this.id = id;
        this.first_name = first_name;
        this.last_name = last_name;
        this.email = email;
        this.password_salt = password_salt;
        this.password_hash = password_hash;
        this.role = role;
    }
}