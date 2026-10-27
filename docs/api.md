# API

Base URL: `http://localhost:3000/api/v1`

## Service

### POST /reservations

- **Description:** create the reservation to book a table for an authenticated user
- **Authentication:** required
- **Permissions:** user
- **Request Body:**
  - `date`: required date, formatted `YYYY-MM-DD`
  - `slot`: required slot
  - `partySize`: required positive integer
  - `requirements`: optional object containing dietary requirements; if omitted, no dietary requirements are declared
    - `hasAllergies`: optional boolean
    - `details`: optional string describing dietary restrictions, preferences and affected party members; required and not empty when `hasAllergies` is true
- **Responses:**
  - `201 Created`: booking created; returns the booking details, including any declared dietary requirements
  - `400 Bad Request`: missing or invalid request fields, including missing allergy details when `hasAllergies` is true
  - `401 Unauthorized`: user is not authenticated
  - `409 Conflict`: the requested capacity is no longer available
  - `500 Internal Server Error`: unexpected server error

### GET /slots

- **Description:** get the slots available for the selected date, including their booking availability
- **Authentication:** not required
- **Query parameters:**
  - `date`: required date, formatted `YYYY-MM-DD`
- **Responses:**
  - `200 OK`: returns the list of the available slots; returns `[]` if no slots are available
  - `400 Bad Request`: missing date or invalid date
  - `500 Internal Server Error`: unexpected server error

### GET /slots/configurations

- **Description:** returns the saved configurations that can be reused
- **Authentication:** required
- **Permissions:** employee, warden
- **Responses:**
  - `200 OK`: returns the list of configurations, including identifiers, tables and seat capacity; returns `[]` if no configuration exists
  - `401 Unauthorized`: user is not authenticated
  - `403 Forbidden`: user does not have the required permissions
  - `500 Internal Server Error`: unexpected server error

### POST /slots

- **Description:** creates a slot for a specific date and time
  interval, with its table and seat configuration
- **Authentication:** required
- **Permissions:** employee or warden
- **Request body:**
  - `date`: required, formatted as `YYYY-MM-DD`
  - `startTime`: required, formatted as `HH:mm`
  - `endTime`: required, formatted as `HH:mm`
  - `configuration`: a new table and seat configuration
  - `configurationId`: identifier of a saved configuration
  - Exactly one of `configuration` and `configurationId` is required
- **Possible responses:**
  - `201 Created`: returns the created slot, including its identifier
  - `400 Bad Request`: missing fields, invalid values or both
    configuration options provided
  - `401 Unauthorized`: user is not authenticated
  - `403 Forbidden`: user does not have the required permissions
  - `404 Not Found`: a referenced configuration or table does not exist
  - `409 Conflict`: the slot conflicts with an existing one,
    according to the agreed scheduling rules
  - `500 Internal Server Error`: unexpected server error

### GET /slots/:slotId/availability — Check booking availability

- **Description:** checks whether the selected slot can accommodate the requested party size
- **Authentication:** not required
- **Path parameters:**
  - `slotId`: required identifier of the selected slot
- **Query parameters:**
  - `partySize`: required positive integer
- **Possible responses:**
  - `200 OK`: returns the availability result `available` which is false if the party cannot be accommodated or the slot is closed
  - `400 Bad Request`: invalid slot identifier or missing,
    invalid or non-positive party size
  - `404 Not Found`: the slot does not exist
  - `500 Internal Server Error`: unexpected server error