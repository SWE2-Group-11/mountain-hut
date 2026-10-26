# API

Base URL: `http://localhost:3000/api/v1`

## Service

### POST /reservation

- **Description:** create the reservation to book a table for an authenticated user
- **Authentication:** required
- **Permissions:** user
- **Request Body:**
  - `date`: required date, formatted `YYYY-MM-DD`
  - `slot`: required slot
  - `partySize`: required positive integer
- **Responses:**
  - `201 Created`: booking created; returns the booking details
  - `400 Bad Request`: missing or invalid request fields
  - `401 Unauthorized`: user is not authenticated
  - `409 Conflict`: the requested capacity is no longer available
  - `500 Internal Server Error`: unexpected server error

### GET /slots

- **Description:** get the slots available for the selected date, including their booking availability
- **Authentication:** not required
- **Query parameters:**
  - `date`: required date, formatted `YYYY-MM-DD`
- **Responses:**
  - `200 OK`: returns the list of the available slots; returns [] if no slots are available
  - `400 Bad Request`: missing date or invalid date
  - `500 Internal Server Error`: unexpected server error