export class SlotTable {
    public slot_date: string;        // YYYY-MM-DD
    public slot_start_time: string;  // HH:MM
    public table_number: number;
    public seats: number;

    constructor(slot_date: string, slot_start_time: string, table_number: number, seats: number) {
        this.slot_date = slot_date;
        this.slot_start_time = slot_start_time;
        this.table_number = table_number;
        this.seats = seats;
    }
}