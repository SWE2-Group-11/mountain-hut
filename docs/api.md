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
  - `password`: required string, 8 to 128 characters (`PASSWORD_MIN_LENGTH`/`PASSWORD_MAX_LENGTH` in `backend/src/config/config.ts`); stored as a salted hash, never in plain text. Login accepts any non-empty password, so the limits never lock out existing accounts
  - `notes`: optional string, at most 200 characters after removing surrounding spaces; `null` if omitted
  - `emergency_contact`: optional string, at most 200 characters after removing surrounding spaces; `null` if omitted
  - Any other field (e.g. `role`) is ignored
- **Responses:**
  - `201 Created`: account created; returns `id`, `email`, `role` (always `"hiker"`) and `must_change_password` (always `false`)
  - `400 Bad Request`: missing or invalid request fields, a password shorter than 8 or longer than 128 characters, or `notes`/`emergency_contact` longer than 200 characters
  - `409 Conflict`: an account (hiker or staff) with the same email already exists
  - `500 Internal Server Error`: unexpected server error

### GET /accounts - Search hiker profiles

- **Description:** searches hiker profiles: registered hikers and temporary hikers (hikers without an account, created by a staff booking). Staff accounts are never returned
- **Authentication:** required
- **Permissions:** employee, warden
- **Query parameters:** at least one is required; when several are given they are combined with AND. Any other parameter is rejected
  - `name`: partial, case-insensitive match on the full name; surrounding spaces are removed
  - `phone`: partial match on the mobile number; spaces are ignored
  - `email`: exact, case-insensitive match; only registered hikers have an email, so temporary hikers never match
- **Ordering:** by full name; at most 50 results
- **Responses:**
  - `200 OK`: returns the matching hikers, each with `id` (account id, `null` for a temporary hiker), `bookingId` (booking of a temporary hiker, `null` for a registered hiker), `fullname`, `mobile_number`, `email` (`null` for a temporary hiker) and `hasAccount`; returns `[]` if no hiker matches
  - `400 Bad Request`: no search parameter, an empty parameter, an invalid `email`, or an unknown parameter
  - `401 Unauthorized`: user is not authenticated
  - `403 Forbidden`: user does not have the required permissions
  - `500 Internal Server Error`: unexpected server error

### PUT /accounts/current/password - Change the password

- **Description:** changes the password of the logged-in account. Accounts created by staff with a temporary password have `must_change_password: true` in the login response: until they call this endpoint, every other route that requires authentication answers `403 Forbidden` ("Password change required"). The change clears the flag (also in the current session) and invalidates any pending reset link
- **Authentication:** required; allowed even while `must_change_password` is `true`
- **Request body:**
  - `current_password`: required, non-empty string
  - `new_password`: required string, 8 to 128 characters, different from `current_password`
- **Responses:**
  - `200 OK`: password changed; returns `id`, `email`, `role` and `must_change_password` (`false`)
  - `400 Bad Request`: missing or invalid request fields
  - `401 Unauthorized`: user is not authenticated, or `current_password` is wrong
  - `500 Internal Server Error`: unexpected server error

### POST /accounts/password-reset - Request a password reset email

- **Description:** if a hiker account has this email, sends it a link to `<CLIENT_ORIGIN>/reset-password?token=<token>`. The link expires after 24 hours, works only once and replaces any earlier link. A new email is sent at most every 5 minutes per account. Staff accounts never receive the email
- **Authentication:** not required
- **Request body:**
  - `email`: required, valid email address; case-insensitive
- **Responses:**
  - `202 Accepted`: always, whether or not the email is registered or the email was sent, so the endpoint does not reveal which addresses have an account
  - `400 Bad Request`: missing or invalid `email`
  - `500 Internal Server Error`: unexpected server error

### POST /accounts/password-reset/confirm - Set a new password with a reset link

- **Description:** sets a new password with the token of a reset email and clears `must_change_password`. Sessions already open are not logged out
- **Authentication:** not required
- **Request body:**
  - `token`: required, the `token` query parameter of the link
  - `new_password`: required string, 8 to 128 characters
- **Responses:**
  - `204 No Content`: password changed
  - `400 Bad Request`: missing or invalid request fields, or the token is unknown, already used, replaced by a newer link or expired
  - `500 Internal Server Error`: unexpected server error

## Service

### GET /slots - Get slots for the selected date

- **Description:** get the slots available for the selected date, including their booking availability
- **Authentication:** not required
- **Query parameters:**
  - `date`: required date, formatted `YYYY-MM-DD`
- **Responses:**
  - `200 OK` returns the bookable slots for the day, ordered by start time, or `[]` if none are bookable. Each slot includes `date`, `start_time`, `duration` in minutes, `total_seats`, `available_seats`, and `menu`. The `menu` field contains the original Markdown string or `null` if no menu has been set.
  - `400 Bad Request`: missing date or invalid date
  - `500 Internal Server Error`: unexpected server error

### GET /slots/availability - Check availability for a party

- Checks whether a party can be seated in the selected slot and proposes a table arrangement.
- This endpoint is public.
- **Query parameters**
  - `date` is required in `YYYY-MM-DD` format.
  - `slot` is the required start time in `HH:mm` format.
  - `partySize` is required as a positive safe integer in decimal digits, without leading zeros.
- **Responses**
  - `200 OK` returns an object with `available` and `menu`. Each item in `available` contains `tableNumber` and `assignedSeats`. The array is empty when booking has closed for the slot or the party cannot be seated. The `menu` field contains the original Markdown string or `null` if no menu has been set.
  - `400 Bad Request` indicates a missing or invalid query parameter.
  - `404 Not Found` indicates that the requested slot does not exist.
  - `500 Internal Server Error` indicates an unexpected server error.

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

- **Description:** create the reservation to book a table, optionally declaring the dietary requirements of the party. A hiker books for themself; an employee book on behalf of the hiker described in `hiker`
- **Authentication:** required
- **Permissions:** hiker, employee, warden
- **Request body:**
  - `date`: required, formatted `YYYY-MM-DD`
  - `slot`: required, start time of the slot, formatted `HH:mm`
  - `partySize`: required positive integer
  - `requirements`: optional list of objects, each describing the dietary requirements of a subset of the party; if omitted, no dietary requirements are declared
    - `hasAllergies`: required boolean
    - `details`: required string with at least one non-space character, describing the people of the subset and their dietary restrictions or allergies (e.g. `"2 vegetarians"`)
  - `hiker`: required for staff, ignored for hikers; who the booking is for, selected by `mode` (no other fields are accepted in a staff request):
    - `{ "mode": "existing", "hikerId" }`: an existing hiker account (positive integer id)
    - `{ "mode": "temporary", "fullname", "mobile_number"? }`: a hiker without an account
    - `{ "mode": "registered", "fullname", "mobile_number", "email", "notes"?, "emergency_contact"? }`: creates a hiker account (with a generated initial password that must be changed) and books for it
- **Rules for staff:** the booking is allowed until the slot starts (the 2-hour cutoff applies only to hikers); no confirmation email is sent
- **Responses:**
  - `201 Created` returns the booking details (`id`, `date`, `slot`, `partySize`, `seatings`) and the declared dietary requirements (`requirements`, each with `hasAllergies` and `details`).
    - For hikers, `menu` contains the booked slot's original Markdown or `null` if no menu has been set. The booking confirmation screen can use this field.
    - For staff, the response includes `hikerId` (`null` for a temporary hiker) and, in `registered` mode, `initialPassword` to deliver to the hiker.
  - `400 Bad Request`: missing or invalid request fields (including missing or empty `details` in a requirement, or a missing/invalid `hiker` in a staff request), slot that does not exist (hiker), slot that starts in less than 2 hours (hiker), or slot that has already started (staff)
  - `401 Unauthorized`: user is not authenticated
  - `404 Not Found`: (staff) the slot or the `existing` hiker does not exist
  - `409 Conflict`: the hiker already has a booking in the same slot (date and time), the requested capacity is no longer available, or (staff, `registered` mode) an account with the given email already exists
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
  - `200 OK` returns the updated reservation (`id`, `date`, `slot`, `partySize`, `seatings`, `requirements`, `menu`). The `menu` field contains the original Markdown for the slot after the update, or `null` if no menu has been set.
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
  - `200 OK` returns the reservations ordered by slot date and time, or `[]` if none match. Each reservation includes `id`, `date`, `slot`, `partySize`, `seatings`, `requirements`, and `menu`. The `menu` field contains the original Markdown for the booked slot, or `null` if no menu has been set.
  - `401 Unauthorized`: user is not authenticated
  - `403 Forbidden`: user is not a hiker
  - `500 Internal Server Error`: unexpected server error

### DELETE /reservations/:reservationId - Cancel a reservation

- **Description:** cancels a reservation belonging to the authenticated hiker, releasing its seats so they can be booked by other guests; there are no time constraints, a reservation can be cancelled at any time
- **Authentication:** required
- **Permissions:** hiker
- **Path parameters:**
  - `reservationId`: required positive integer, reservation identifier
- **Responses:**
  - `204 No Content`: reservation cancelled; no response body
  - `400 Bad Request`: invalid `reservationId`
  - `401 Unauthorized`: user is not authenticated
  - `403 Forbidden`: user is not a hiker, or the reservation belongs to another user
  - `404 Not Found`: the reservation does not exist
  - `409 Conflict`: the reservation could not be cancelled
  - `500 Internal Server Error`: unexpected server error

### POST /slots/copy-week - Repeat a weekly schedule

- **Description:** copies the slots, tables and seats of a week into one or more later weeks, so that recurring slots do not have to be configured one by one; bookings are never copied. A target week without reservations has its existing schedule completely replaced; if any target week has reservations, nothing is copied. All the target weeks are copied together, or none is. The copied slots can later be adjusted individually
- **Authentication:** required
- **Permissions:** employee, warden
- **Request body:**
  - `sourceWeekStart`: required, Monday of the week to copy, formatted `YYYY-MM-DD`
  - `targetWeekStarts`: required non-empty array (at most 52 elements) of Mondays of the weeks receiving the copy, formatted `YYYY-MM-DD`; no duplicates, must not contain `sourceWeekStart`, each week must start after the current week (Europe/Rome)
- **Responses:**
  - `201 Created`: returns `sourceWeekStart` (Monday date of the copied week), `targetWeekStarts` (dates of Mondays of the weeks that received the copy, without duplicates) and `slotsPerWeek` (number of slots copied into each target week)
  - `400 Bad Request`: missing or invalid fields (dates that are not Mondays, duplicate target weeks, source week among the targets, more than 52 targets), or a target week that has already started or is in the past
  - `401 Unauthorized`: user is not authenticated
  - `403 Forbidden`: user does not have the required permissions
  - `404 Not Found`: the source week has no slots to copy
  - `409 Conflict`: a target week already has reservations, so its schedule cannot be replaced; nothing was copied
  - `500 Internal Server Error`: unexpected server error

### POST /hikes - Register a hike

- **Description:** registers a planned hike for the authenticated hiker before departure
- **Authentication:** required
- **Permissions:** hiker
- **Request body:**
  - `destination`: required non-blank string, name of the destination
  - `route`: required non-blank string, description of the route
  - `passagePoints`: optional array of non-blank strings, in route order. Defaults to `[]`
  - `plannedDepartureAt`: required future departure time in UTC, formatted `YYYY-MM-DDTHH:mm:ssZ`
  - `expectedReturnAt`: required expected return time in the same format, later than `plannedDepartureAt`
- **Responses:**
  - `201 Created`: returns the registered hike (`id`, `destination`, `route`, `passagePoints`, `plannedDepartureAt`, `expectedReturnAt`, `completedAt`). `completedAt` is `null`
  - `400 Bad Request`: malformed JSON, missing or invalid fields, or the planned departure time has already been reached
  - `401 Unauthorized`: user is not authenticated
  - `403 Forbidden`: user does not have the required role or must change their password
  - `500 Internal Server Error`: unexpected server error

### GET /hikes/popular - Get predefined hikes

- **Description:** returns predefined hikes that can be reused when registering a hike
- **Authentication:** required
- **Permissions:** hiker
- **Query parameters:**
  - `limit`: optional positive integer, maximum number of hikes to return. If omitted, returns all predefined hikes
- **Responses:**
  - `200 OK`: returns the list of predefined hikes ordered by destination, then by `id`, or `[]` if none exist. Each hike includes `id`, `destination`, `route` and `passagePoints`
  - `400 Bad Request`: invalid `limit`
  - `401 Unauthorized`: user is not authenticated
  - `403 Forbidden`: user does not have the required role or must change their password
  - `500 Internal Server Error`: unexpected server error