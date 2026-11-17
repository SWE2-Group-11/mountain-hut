PRAGMA foreign_keys = ON;

-- Accounts, staff and hikers are seeded from seed-accounts.json (see seed-accounts.example.json).
-- The account at position <n> in the file gets id <n>: the bookings below belong to
-- accounts 3 and 4, so the 3rd and 4th accounts in the file must be hikers.

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