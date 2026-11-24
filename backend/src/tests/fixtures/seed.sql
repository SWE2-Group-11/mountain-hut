PRAGMA foreign_keys = ON;

-- Fixed slots, tables and bookings for the tests (SEED_MODE=fixed): the tests rely on this exact data.
-- The bookings belong to accounts 3 and 4, the hikers Mario and Laura in seed-accounts.json (same folder).

-- Slots
INSERT INTO slot (date, start_time, duration, menu) VALUES
    (date('now', 'localtime', '+1 day'),  '12:00', 60,
'**Alpine Menu**
- Barley soup
- Polenta with mushrooms
- *Apple strudel*'),
    (date('now', 'localtime', '+1 day'),  '13:00', 60,
'**Alpine Menu**
- Barley soup
- Polenta with mushrooms
- *Apple strudel*'),
    (date('now', 'localtime', '+1 day'),  '19:30', 90,
'**Dinner Menu**
- Starters
  - Cured meats and cheese board
- Main course
  - Venison stew with polenta
  - *Vegetarian*: spinach dumplings
- Blueberry tart'),
    (date('now', 'localtime', '+2 days'), '12:00', 60, NULL);

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

-- Hikes: one per state (active, registered, overdue, completed). Times are UTC and relative to now.
INSERT INTO hike (id, hiker_id, destination, route, expected_arrival_at, departed_at, arrived_at) VALUES
    (1, 3, 'Viso Mozzo', 'via the Chiaretto lake',
        strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+4 hours'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-2 hours'), NULL),
    (2, 4, 'Monte Granero', 'along the ridge from the hut',
        strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+1 day'), NULL, NULL),
    (3, 4, 'Colle delle Traversette', 'via the Po springs',
        strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 hour'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-6 hours'), NULL),
    (4, 3, 'Chiaretto lake', 'short loop from the hut',
        strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-21 hours'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours'),
        strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-22 hours'));

-- Passage points of the hikes, in route order
INSERT INTO passage_point (hike_id, position, name) VALUES
    (1, 1, 'Pian del Re'),
    (1, 2, 'Chiaretto lake'),
    (3, 1, 'Pian del Re'),
    (3, 2, 'Fiorenza lake');