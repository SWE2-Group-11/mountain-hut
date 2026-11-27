import { getPopularHikes, saveHike } from '../dao/hike-dao';
import type {
    GetPopularHikesRequestDTO,
    PopularHikeResponseDTO,
    RegisterHikeRequestDTO,
    RegisterHikeResponseDTO
} from '../models/dto/hike-dto';
import { BadRequestError } from '../models/errors/badrequest-error';
import { hikeToResponseDTO, popularHikeToResponseDTO } from '../services/mapper-service';

/**
 * Registers a planned hike for the authenticated hiker.
 * @param hikerId The account ID of the authenticated hiker.
 * @param request The validated itinerary and planned times in UTC.
 * @returns The saved hike with its generated ID and a null completion time.
 * @throws BadRequestError if the planned departure is at or before the current time.
 */
export const registerHike = (
    hikerId: number,
    request: RegisterHikeRequestDTO
): RegisterHikeResponseDTO => {
    if(Date.parse(request.plannedDepartureAt) <= Date.now())
        throw new BadRequestError("Planned departure must be in the future")

    const hike = saveHike(hikerId, {
        destination: request.destination,
        route: request.route,
        passage_points: request.passagePoints,
        planned_departure_at: request.plannedDepartureAt,
        expected_return_at: request.expectedReturnAt,
    })

    return hikeToResponseDTO(hike);
}

/**
 * Retrieves predefined hikes that can be used to fill in the registration form.
 * @param query The validated query with an optional limit. Omit it to return all hikes.
 * @returns The predefined hikes ordered by destination, with their passage points in route order.
 */
export const listPopularHikes = ({limit}: GetPopularHikesRequestDTO): PopularHikeResponseDTO[] => getPopularHikes(limit).map(popularHikeToResponseDTO)
