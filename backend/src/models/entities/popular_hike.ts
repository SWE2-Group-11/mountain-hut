export class PopularHike {
    public id: number;
    public destination: string;
    public route: string;
    public passage_points: string[];  // names in route order (position = index + 1)

    constructor(id: number, destination: string, route: string, passage_points: string[]) {
        this.id = id;
        this.destination = destination;
        this.route = route;
        this.passage_points = passage_points;
    }
}