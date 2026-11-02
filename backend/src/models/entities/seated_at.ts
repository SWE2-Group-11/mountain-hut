export class SeatedAt {
    public booking_id: number;
    public slot_date: string;        // YYYY-MM-DD
    public slot_start_time: string;  // HH:MM
    public table_number: number;
    public assigned_seats: number;

    constructor(booking_id: number, slot_date: string, slot_start_time: string,
                table_number: number, assigned_seats: number) {
        this.booking_id = booking_id;
        this.slot_date = slot_date;
        this.slot_start_time = slot_start_time;
        this.table_number = table_number;
        this.assigned_seats = assigned_seats;
    }
}