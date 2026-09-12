-- Seed data for Pebblebase MySQL integration tests.
-- Matches testdata/seed.sql (Postgres) but in MySQL dialect.

CREATE TABLE IF NOT EXISTS users (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(100) NOT NULL,
    email      VARCHAR(255) NOT NULL UNIQUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS posts (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT NOT NULL,
    title      VARCHAR(255) NOT NULL,
    body       TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_posts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS comments (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    post_id    INT NOT NULL,
    user_id    INT NOT NULL,
    body       TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_comments_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed rows
INSERT IGNORE INTO users (id, name, email) VALUES
    (1, 'Alice', 'alice@example.com'),
    (2, 'Bob',   'bob@example.com'),
    (3, 'Carol', 'carol@example.com'),
    (4, 'Dave',  'dave@example.com'),
    (5, 'Eve',   'eve@example.com');

INSERT IGNORE INTO posts (id, user_id, title, body) VALUES
    (1, 1, 'Hello World',    'First post by Alice'),
    (2, 1, 'Second Post',    'Another post by Alice'),
    (3, 2, 'Bob Writes',     'Post by Bob'),
    (4, 3, 'Carols Thoughts','Post by Carol');

INSERT IGNORE INTO comments (id, post_id, user_id, body) VALUES
    (1, 1, 2, 'Great post Alice!'),
    (2, 1, 3, 'Agreed!'),
    (3, 2, 4, 'Nice one');
