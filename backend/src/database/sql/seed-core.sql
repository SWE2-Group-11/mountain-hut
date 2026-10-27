PRAGMA foreign_keys = ON;

-- Accounts (password: "password")
INSERT INTO account (id, first_name, last_name, email, password_salt, password_hash, role) VALUES
    (1, 'Anna',  'Ferrari', 'warden@mountainhut.test',   'ba90e4ccae4b2d60', '422771328d5f09477d7bcaeb33e65659', 'warden'),
    (2, 'Luca',  'Colombo', 'employee@mountainhut.test', '32bc1ea706a6fcb2', '9d8a588be066c253b4090f6d94d7e5fe', 'employee'),
    (3, 'Mario', 'Rossi',   'mario@mountainhut.test',    '6dfb19971958c63d', '8ceee6d6f296bdf0be2041664771e1ef', 'hiker'),
    (4, 'Laura', 'Bianchi', 'laura@mountainhut.test',    'cea709af16746052', 'b80eff3f480d40a8e927fe3d84227acb', 'hiker');

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
INSERT INTO booking (id, hiker_id) VALUES (1, 3), (2, 4), (3, 3);

-- Seats
INSERT INTO seated_at (booking_id, slot_date, slot_start_time, table_number, assigned_seats) VALUES
    (1, date('now', 'localtime', '+1 day'), '12:00', 4, 2),
    (2, date('now', 'localtime', '+1 day'), '12:00', 3, 6),
    (2, date('now', 'localtime', '+1 day'), '12:00', 1, 1),
    (3, date('now', 'localtime', '+1 day'), '19:30', 1, 4);

-- Dietary requirements
INSERT INTO dietary_requirement (booking_id, allergy_flag, description) VALUES
    (2, 1, '1 person: peanut allergy'),
    (2, 0, '2 people: vegetarian'),
    (3, 0, '1 person: vegan');