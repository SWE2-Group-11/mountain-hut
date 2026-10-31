export class Booking {
    public id: number;
    public hiker_id: number;

    constructor(id: number, hiker_id: number) {
        this.id = id;
        this.hiker_id = hiker_id;
    }
}