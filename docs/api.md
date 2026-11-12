# API

Base URL: `http://localhost:3000/api/v1`

## Accounts

### POST /accounts - Register a hiker account

- **Description:** registers a new account; every registered account is a hiker account. The user is not logged in by the registration
- **Authentication:** not required
- **Request body:**
  - `fullname`: required string with at least one non-space character; surrounding spaces are removed
  - `mobile_number`: required string with at least one non-space character; surrounding spaces are removed
  - `email`: required, valid email address; stored lowercase, so it is case-insensitive for registration and login
  - `password`: required, non-empty string; stored as a salted hash, never in plain text
  - `notes`: optional string, at most 200 characters after removing surrounding spaces; `null` if omitted
  - `emergency_contact`: optional string, at most 200 characters after removing surrounding spaces; `null` if omitted
  - Any other field (e.g. `role`) is ignored
- **Responses:**
  - `201 Created`: account created; returns `id`, `email` and `role` (always `"hiker"`)
  - `400 Bad Request`: missing or invalid request fields, or `notes`/`emergency_contact` longer than 200 characters
  - `409 Conflict`: an account (hiker or staff) with the same email already exists
  - `500 Internal Server Error`: unexpected server error

## Service

### GET /slots - Get slots for the selected date

- **Description:** get the slots available for the selected date, including their booking availability
- **Authentication:** not required
- **Query parameters:**
  - `date`: required date, formatted `YYYY-MM-DD`
- **Responses:**
  - `200 OK`: returns the list of the available slots; returns `[]` if no slots are available
  - `400 Bad Request`: missing date or invalid date
  - `500 Internal Server Error`: unexpected server error

### GET /slots/configurations - Get saved slots configurations

- **Description:** returns the table configurations of existing slots, so that they can be reused through `copyFrom` when creating a slot
- **Authentication:** required
- **Permissions:** employee, warden
- **Query parameters:**
  - `from`: optional inclusive start date, formatted `YYYY-MM-DD`
  - `to`: optional inclusive end date, formatted `YYYY-MM-DD`
  - `limit`: optional positive integer; defaults to 20, maximum 100
- **Ordering:** most recent dates first, with the latest start time first within the same date
- **Responses:**
  - `200 OK`: returns the list of configurations; returns `[]` if no configuration exists. Each configuration contains:
    - `date`: date of the slot, formatted `YYYY-MM-DD`
    - `startTime`: start time of the slot, formatted `HH:mm`
    - `endTime`: end time of the slot, formatted `HH:mm`
    - `tables`: array of objects, each containing `tableNumber` and `seats`
    - `totalSeats`: sum of the seats of all the tables
  - `400 Bad Request`: invalid `from`, `to` or `limit`, or `from` > `to`
  - `401 Unauthorized`: user is not authenticated
  - `403 Forbidden`: user does not have the required permissions
  - `500 Internal Server Error`: unexpected server error

### POST /slots - Create a slot

- **Description:** creates a slot for a specific date and time interval, with the tables and seats available in it
- **Authentication:** required
- **Permissions:** employee, warden
- **Request body:**
  - `date`: required, formatted `YYYY-MM-DD`
  - `startTime`: required, formatted `HH:mm`
  - `endTime`: required, formatted `HH:mm`, later than `startTime`
  - `tables`: non-empty array of objects
    - `tableNumber`: required positive integer, unique within the array
    - `seats`: required positive integer
  - `copyFrom`: object identifying an existing slot whose tables and seats are copied
    - `date`: required, formatted `YYYY-MM-DD`
    - `startTime`: required, formatted `HH:mm`
  - Exactly one of `tables` and `copyFrom` is required
- **Responses:**
  - `201 Created`: returns the created slot (`date`, `startTime`, `endTime`, `tables`, `totalSeats`)
  - `400 Bad Request`: missing fields, invalid values (including `endTime` not after `startTime` or duplicate `tableNumber`), or both or neither of `tables` and `copyFrom` provided
  - `401 Unauthorized`: user is not authenticated
  - `403 Forbidden`: user does not have the required permissions
  - `404 Not Found`: the slot referenced by `copyFrom` does not exist
  - `409 Conflict`: the slot overlaps an existing slot on the same date (slots that only touch, such as 12:00-13:00 and 13:00-14:00, do not overlap)
  - `500 Internal Server Error`: unexpected server error

### GET /slots/configurations - Get reusable table configurations

- **Description:** returns the table and seat configurations of existing slots, so that they can be reused through `copyFrom`
- **Authentication:** required
- **Permissions:** employee, warden
- **Query parameters:**
  - `from`: optional inclusive start date, formatted `YYYY-MM-DD`
  - `to`: optional inclusive end date, formatted `YYYY-MM-DD`
  - `limit`: optional positive integer; defaults to 20, maximum 100
- **Ordering:** most recent dates first, then latest start time first
- **Responses:**
  - `200 OK`: returns the list of configurations, each with `date`, `startTime`, `endTime`, `tables` (`tableNumber`, `seats`) and `totalSeats`; returns `[]` if no slot exists
  - `400 Bad Request`: `from` > `to`, or invalid `from`, `to` or `limit`
  - `401 Unauthorized`: user is not authenticated
  - `403 Forbidden`: user does not have the required permissions
  - `500 Internal Server Error`: unexpected server error

### POST /reservations - Create a reservation

- **Description:** create the reservation to book a table for an authenticated hiker, optionally declaring the dietary requirements of the party
- **Authentication:** required
- **Permissions:** hiker
- **Request body:**
  - `date`: required, formatted `YYYY-MM-DD`
  - `slot`: required, start time of the slot, formatted `HH:mm`
  - `partySize`: required positive integer
  - `requirements`: optional list of objects, each describing the dietary requirements of a subset of the party; if omitted, no dietary requirements are declared
    - `hasAllergies`: required boolean
    - `details`: required string with at least one non-space character, describing the people of the subset and their dietary restrictions or allergies (e.g. `"2 vegetarians"`)
- **Responses:**
  - `201 Created`: booking created; returns the booking details (`id`, `date`, `slot`, `partySize`, `seatings`) including the declared dietary requirements (`requirements`, each with `hasAllergies` and `details`)
  - `400 Bad Request`: missing or invalid request fields (including missing or empty `details` in a requirement), slot that does not exist, or slot that starts in less than 2 hours
  - `401 Unauthorized`: user is not authenticated
  - `403 Forbidden`: user does not have the required permissions
  - `409 Conflict`: the user already has a booking in the same slot (date and time), or the requested capacity is no longer available
  - `500 Internal Server Error`: unexpected server error

### PATCH /reservations/:reservationId - Update a reservation

- **Description:** updates a reservation belonging to the authenticated hiker
- **Authentication:** required
- **Permissions:** hiker
- **Path parameters:**
  - `reservationId`: required positive integer, reservation identifier
- **Request Body:**
  - `date`: optional date, formatted `YYYY-MM-DD`
  - `slot`: optional start time of the slot, formatted `HH:mm`
  - `partySize`: optional positive integer
  - `requirements`: optional list of objects; when provided, replaces all the previous requirements (an empty list removes them)
    - `hasAllergies`: required boolean
    - `details`: required string describing dietary restrictions or preferences
  - At least one field must be provided
- **Responses:**
  - `200 OK`: returns the updated reservation (`id`, `date`, `slot`, `partySize`, `seatings`, `requirements`)
  - `400 Bad Request`: invalid `reservationId`, empty body, invalid fields, change attempted less than 48 hours before the original slot, or requested slot starting in less than 2 hours
  - `401 Unauthorized`: user is not authenticated
  - `403 Forbidden`: user is not a hiker, or the reservation belongs to another user
  - `404 Not Found`: the reservation or requested slot does not exist
  - `409 Conflict`: the user already has a reservation in the requested slot, or insufficient availability
  - `500 Internal Server Error`: unexpected server error

### GET /reservations - Get the authenticated hiker's reservations

- **Description:** returns the active reservations (slot not started yet) belonging to the authenticated hiker
- **Authentication:** required
- **Permissions:** hiker
- **Responses:**
  - `200 OK`: returns the reservations ordered by slot date and time, each with `id`, `date`, `slot`, `partySize`, `seatings`, `requirements`; returns `[]` if no reservations match
  - `401 Unauthorized`: user is not authenticated
  - `403 Forbidden`: user is not a hiker
  - `500 Internal Server Error`: unexpected server error