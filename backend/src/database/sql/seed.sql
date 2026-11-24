PRAGMA foreign_keys = ON;

-- Reference data, seeded at every reset in every SEED_MODE (random and fixed):
-- it is needed both by the app and by the tests, so it must always be present.

-- Popular hikes
INSERT INTO popular_hike (id, destination, route) VALUES
    (1, 'Viso Mozzo', 'via the Chiaretto lake'),
    (2, 'Colle delle Traversette', 'via the Po springs and the Fiorenza lake');

-- Passage points
INSERT INTO pop_passage_point (id, name) VALUES
    (1, 'Pian del Re'),
    (2, 'Chiaretto lake'),
    (3, 'Fiorenza lake');

-- Passage points of each popular hike, in route order
INSERT INTO has_pop_passage_point (popular_hike_id, pop_passage_point_id, position) VALUES
    (1, 1, 1),
    (1, 2, 2),
    (2, 1, 1),
    (2, 3, 2);