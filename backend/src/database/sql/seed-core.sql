PRAGMA foreign_keys = ON;

-- Accounts
INSERT INTO account (id, email, password_salt, password_hash) VALUES
    (1, 'warden@mountainhut.test',   'a1b2c3d4e5f60718', '33322a2ed866a9b3c2ca5411a8f734cc'),
    (2, 'employee@mountainhut.test', '1827364554637281', '1ca13f2ba419d1d5573fb0ea08cdbf15'),
    (3, 'mario@mountainhut.test',    '9f8e7d6c5b4a3921', '260948108aae67a766b978b99e11fb72'),
    (4, 'laura@mountainhut.test',    '0a1b2c3d4e5f6a7b', '6a40925313901ee3eb369b84e4335cb2');

-- Staff
INSERT INTO staff (account_id, name, role) VALUES
    (1, 'Anna', 'warden'),
    (2, 'Luca', 'employee');

-- Hikers
INSERT INTO hiker (account_id, full_name, mobile_number, notes, emergency_contact) VALUES
    (3, 'Mario Rossi',   '+39 333 123 4567', 'Registered mountain guide', 'Giulia Rossi, +39 333 765 4321'),
    (4, 'Laura Bianchi', '+39 347 987 6543', NULL, NULL);

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