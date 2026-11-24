PRAGMA foreign_keys = ON;

DELETE FROM has_pop_passage_point;
DELETE FROM pop_passage_point;
DELETE FROM popular_hike;
DELETE FROM passage_point;
DELETE FROM hike;
DELETE FROM dietary_requirement;
DELETE FROM seated_at;
DELETE FROM temporary_hiker;
DELETE FROM booking;
DELETE FROM slot_table;
DELETE FROM slot;
DELETE FROM staff;
DELETE FROM hiker;
DELETE FROM password_reset_token;
DELETE FROM account;
DELETE FROM sqlite_sequence WHERE name IN ('account', 'booking', 'dietary_requirement', 'hike', 'popular_hike', 'pop_passage_point');