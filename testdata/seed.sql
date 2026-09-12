-- Seed data for Pebblebase integration tests.
-- Run against the test DB before running: go test ./internal/adapter/postgres/...

CREATE TABLE IF NOT EXISTS users (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(100) NOT NULL,
    email      VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS posts (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      VARCHAR(255) NOT NULL,
    body       TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comments (
    id         SERIAL PRIMARY KEY,
    post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body       TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Seed rows
INSERT INTO users (name, email) VALUES
    ('Alice', 'alice@example.com'),
    ('Bob',   'bob@example.com'),
    ('Carol', 'carol@example.com'),
    ('Dave',  'dave@example.com'),
    ('Eve',   'eve@example.com')
ON CONFLICT DO NOTHING;

INSERT INTO posts (user_id, title, body) VALUES
    (1, 'Hello World',    'First post by Alice'),
    (1, 'Second Post',    'Another post by Alice'),
    (2, 'Bob Writes',     'Post by Bob'),
    (3, 'Carols Thoughts','Post by Carol')
ON CONFLICT DO NOTHING;

INSERT INTO comments (post_id, user_id, body) VALUES
    (1, 2, 'Great post Alice!'),
    (1, 3, 'Agreed!'),
    (2, 4, 'Nice one')
ON CONFLICT DO NOTHING;
