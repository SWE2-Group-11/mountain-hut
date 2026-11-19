PRAGMA foreign_keys = ON;

-- Fixed slots, tables and bookings for the tests (SEED_MODE=fixed): the tests rely on this exact data.
-- The bookings belong to accounts 3 and 4, the hikers Mario and Laura in seed-accounts.json (same folder).

-- Slots
INSERT INTO slot (date, start_time, duration) VALUES
    (date('now', 'localtime', '+1 day'),  '12:00', 60),
    (date('now', 'localtime', '+1 day'),  '13:00', 60),
    (date('now', 'localtime', '+1 day'),  '19:30', 90),
    (date('now', 'localtime', '+2 days'), '12:00', 60);

-- Same table layout for every slot
INSERT INTO slot_table (slot_date, slot_start_time, table_number, seats) VALUES
    (date('now', 'localtime', '+1 day'),  '12:00', 1, 4),
    (date('now', 'localtime', '+1 day'),  '12:00', 2, 4),
    (date('now', 'localtime', '+1 day'),  '12:00', 3, 6),
    (date('now', 'localtime', '+1 day'),  '12:00', 4, 2),
    (date('now', 'localtime', '+1 day'),  '13:00', 1, 4),
    (date('now', 'localtime', '+1 day'),  '13:00', 2, 4),
    (date('now', 'localtime', '+1 day'),  '13:00', 3, 6),
    (date('now', 'localtime', '+1 day'),  '13:00', 4, 2),
    (date('now', 'localtime', '+1 day'),  '19:30', 1, 4),
    (date('now', 'localtime', '+1 day'),  '19:30', 2, 4),
    (date('now', 'localtime', '+1 day'),  '19:30', 3, 6),
    (date('now', 'localtime', '+1 day'),  '19:30', 4, 2),
    (date('now', 'localtime', '+2 days'), '12:00', 1, 4),
    (date('now', 'localtime', '+2 days'), '12:00', 2, 4),
    (date('now', 'localtime', '+2 days'), '12:00', 3, 6),
    (date('now', 'localtime', '+2 days'), '12:00', 4, 2);

-- Bookings
INSERT INTO booking (id, hiker_id) VALUES (1, 3), (2, 4), (3, 3), (4, NULL);

-- Temporary hikers
INSERT INTO temporary_hiker (booking_id, full_name, mobile_number) VALUES
    (4, 'Paolo Verdi', '+39 340 111 2233');

-- Seats
INSERT INTO seated_at (booking_id, slot_date, slot_start_time, table_number, assigned_seats) VALUES
    (1, date('now', 'localtime', '+1 day'), '12:00', 4, 2),
    (2, date('now', 'localtime', '+1 day'), '12:00', 3, 6),
    (2, date('now', 'localtime', '+1 day'), '12:00', 1, 1),
    (3, date('now', 'localtime', '+1 day'), '19:30', 1, 4),
    (4, date('now', 'localtime', '+2 days'), '12:00', 2, 3);

-- Dietary requirements
INSERT INTO dietary_requirement (booking_id, allergy_flag, description) VALUES
    (2, 1, '1 vegan, peanut allergy'),
    (2, 0, '2 vegetarians'),
    (3, 1, '1 shellfish allergy');