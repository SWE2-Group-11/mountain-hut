export class DietaryRequirement {
    public id: number;
    public booking_id: number;
    public allergy_flag: boolean;  // 0/1
    public description: string;

    constructor(id: number, booking_id: number, allergy_flag: boolean, description: string) {
        this.id = id;
        this.booking_id = booking_id;
        this.allergy_flag = allergy_flag;
        this.description = description;
    }
}