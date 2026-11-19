export class Slot {
    public date: string;        // YYYY-MM-DD
    public start_time: string;  // HH:MM
    public duration: number;
    public menu: string | null;

    constructor(date: string, start_time: string, duration: number, menu: string | null = null) {
        this.date = date;
        this.start_time = start_time;
        this.duration = duration;
        this.menu = menu;
    }
}