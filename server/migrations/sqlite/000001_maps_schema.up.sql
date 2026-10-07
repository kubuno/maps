-- SQLite. `maps` is an ATTACHed database file, attached on every pooled
-- connection by kubuno-db, so the qualified names below resolve as they do on
-- the other two engines.
--
-- Differences from the PostgreSQL file, and why:
--   * UUID -> BLOB: what sqlx encodes a `uuid::Uuid` as on SQLite.
--   * No DEFAULT on `id`: SQLite has no UUID generator; the process supplies it.
--   * TIMESTAMPTZ -> TEXT (`%F %T%.f`, UTC), the shape sqlx decodes to DateTime<Utc>.
--   * TEXT[] (user_tags, tags) -> TEXT holding a JSON array; filtered with
--     json_each via kubuno-db json_array_contains.
--   * JSONB -> TEXT, FLOAT8/DECIMAL -> REAL, BOOLEAN -> INTEGER.
--   * No updated_at trigger: every UPDATE in this module sets updated_at
--     explicitly.

CREATE TABLE maps.collections (
    id          BLOB    NOT NULL PRIMARY KEY,
    owner_id    BLOB    NOT NULL,
    name        TEXT    NOT NULL,
    description TEXT,
    icon        TEXT    NOT NULL DEFAULT '⭐',
    color       TEXT    NOT NULL DEFAULT '#1a73e8',
    is_public   INTEGER NOT NULL DEFAULT 0,
    place_count INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
    updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
);

CREATE INDEX maps.idx_maps_collections_owner ON collections(owner_id);

CREATE TABLE maps.saved_places (
    id             BLOB    NOT NULL PRIMARY KEY,
    owner_id       BLOB    NOT NULL,
    collection_id  BLOB    REFERENCES collections(id) ON DELETE SET NULL,
    osm_type       TEXT,
    osm_id         INTEGER,
    place_id       TEXT,
    name           TEXT    NOT NULL,
    category       TEXT,
    address        TEXT,
    lat            REAL    NOT NULL,
    lng            REAL    NOT NULL,
    nominatim_data TEXT    NOT NULL,
    user_note      TEXT,
    user_tags      TEXT    NOT NULL,
    icon           TEXT    NOT NULL DEFAULT '📍',
    created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
    updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
);

CREATE INDEX maps.idx_maps_places_owner  ON saved_places(owner_id);
CREATE INDEX maps.idx_maps_places_latlng ON saved_places(lat, lng);
CREATE INDEX maps.idx_maps_places_osm    ON saved_places(osm_type, osm_id)
    WHERE osm_id IS NOT NULL;

CREATE TABLE maps.reviews (
    id         BLOB    NOT NULL PRIMARY KEY,
    owner_id   BLOB    NOT NULL,
    osm_type   TEXT    NOT NULL,
    osm_id     INTEGER NOT NULL,
    place_name TEXT,
    rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment    TEXT,
    tags       TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
    updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
    UNIQUE (owner_id, osm_type, osm_id)
);

CREATE INDEX maps.idx_maps_reviews_osm   ON reviews(osm_type, osm_id);
CREATE INDEX maps.idx_maps_reviews_owner ON reviews(owner_id);
