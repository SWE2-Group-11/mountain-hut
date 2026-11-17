PRAGMA foreign_keys = ON;

DELETE FROM dietary_requirement;
DELETE FROM seated_at;
DELETE FROM temporary_hiker;
DELETE FROM booking;
DELETE FROM slot_table;
DELETE FROM slot;
DELETE FROM staff;
DELETE FROM hiker;
DELETE FROM account;
DELETE FROM sqlite_sequence WHERE name IN ('account', 'booking', 'dietary_requirement');