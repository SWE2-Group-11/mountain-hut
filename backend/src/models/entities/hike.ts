export class Hike {
    public id: number;
    public hiker_id: number;
    public destination: string;
    public route: string;
    public passage_points: string[];      // names in route order (position = index + 1)
    public planned_departure_at: string;  // UTC, YYYY-MM-DDTHH:MM:SSZ
    public expected_return_at: string;    // UTC, YYYY-MM-DDTHH:MM:SSZ
    public completed_at: string | null;   // null until completed or cancelled

    constructor(
        id: number,
        hiker_id: number,
        destination: string,
        route: string,
        passage_points: string[],
        planned_departure_at: string,
        expected_return_at: string,
        completed_at: string | null = null
    ) {
        this.id = id;
        this.hiker_id = hiker_id;
        this.destination = destination;
        this.route = route;
        this.passage_points = passage_points;
        this.planned_departure_at = planned_departure_at;
        this.expected_return_at = expected_return_at;
        this.completed_at = completed_at;
    }
}