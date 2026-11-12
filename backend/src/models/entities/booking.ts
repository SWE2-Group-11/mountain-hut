export class Booking {
    public id: number;
    public hiker_id: number | null;   // null for bookings of temporary hikers

    constructor(id: number, hiker_id: number | null) {
        this.id = id;
        this.hiker_id = hiker_id;
    }
}