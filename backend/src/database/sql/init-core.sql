PRAGMA foreign_keys = ON;

-- Accounts
CREATE TABLE account (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name    TEXT    NOT NULL,
    last_name     TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE,
    password_salt TEXT    NOT NULL,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL CHECK (role IN ('hiker', 'employee', 'warden'))
);

-- Meal slots
CREATE TABLE slot (
    date       TEXT    NOT NULL CHECK (date IS strftime('%Y-%m-%d', date)),
    start_time TEXT    NOT NULL CHECK (start_time IS strftime('%H:%M', start_time)),
    duration   INTEGER NOT NULL CHECK (duration > 0),
    PRIMARY KEY (date, start_time)
);

-- Tables available in each slot
CREATE TABLE slot_table (
    slot_date       TEXT    NOT NULL,
    slot_start_time TEXT    NOT NULL,
    table_number    INTEGER NOT NULL CHECK (table_number > 0),
    seats           INTEGER NOT NULL CHECK (seats > 0),
    PRIMARY KEY (slot_date, slot_start_time, table_number),
    FOREIGN KEY (slot_date, slot_start_time)
        REFERENCES slot(date, start_time)
);

-- Bookings
CREATE TABLE booking (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    hiker_id INTEGER NOT NULL REFERENCES account(id)
);

-- Seats assigned to a booking at each table
CREATE TABLE seated_at (
    booking_id      INTEGER NOT NULL REFERENCES booking(id) ON DELETE CASCADE,
    slot_date       TEXT    NOT NULL,
    slot_start_time TEXT    NOT NULL,
    table_number    INTEGER NOT NULL,
    assigned_seats  INTEGER NOT NULL CHECK (assigned_seats >= 1),
    PRIMARY KEY (booking_id, slot_date, slot_start_time, table_number),
    FOREIGN KEY (slot_date, slot_start_time, table_number)
        REFERENCES slot_table(slot_date, slot_start_time, table_number)
);

-- Dietary requirements of a booking
CREATE TABLE dietary_requirement (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id   INTEGER NOT NULL REFERENCES booking(id) ON DELETE CASCADE,
    allergy_flag INTEGER NOT NULL DEFAULT 0 CHECK (allergy_flag IN (0, 1)),
    description  TEXT    NOT NULL
);