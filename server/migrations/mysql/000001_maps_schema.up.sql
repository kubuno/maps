-- MySQL / MariaDB. The `maps` database is created by kubuno-db's
-- `ensure_schema` before the migrator runs, so there is no CREATE DATABASE here.
--
-- Differences from the PostgreSQL file, and why:
--   * UUID    -> BINARY(16): what sqlx encodes a `uuid::Uuid` as on MySQL.
--   * No DEFAULT on `id`: MySQL has no gen_random_uuid(), and the process has to
--     know the key anyway (no RETURNING).
--   * TIMESTAMPTZ -> DATETIME(6): no time zone in the column; every value written
--     is UTC, as produced by chrono, with the session time_zone set to +00:00.
--   * TEXT[] (user_tags, tags) -> JSON: arrays exist on no other engine; a small
--     list is carried as a JSON array on all three (kubuno-db json_array_contains).
--   * JSONB -> JSON, FLOAT8 -> DOUBLE.
--   * `set_updated_at` trigger is dropped: every UPDATE in this module sets
--     updated_at explicitly, so no auto-mechanism is needed.

CREATE TABLE maps.collections (
    id          BINARY(16)   NOT NULL PRIMARY KEY,
    owner_id    BINARY(16)   NOT NULL,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    icon        VARCHAR(10)  NOT NULL DEFAULT '⭐',
    color       VARCHAR(7)   NOT NULL DEFAULT '#1a73e8',
    is_public   BOOLEAN      NOT NULL DEFAULT FALSE,
    place_count INT          NOT NULL DEFAULT 0,
    created_at  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE INDEX idx_maps_collections_owner ON maps.collections(owner_id);

CREATE TABLE maps.saved_places (
    id             BINARY(16)   NOT NULL PRIMARY KEY,
    owner_id       BINARY(16)   NOT NULL,
    collection_id  BINARY(16),
    osm_type       VARCHAR(10),
    osm_id         BIGINT,
    place_id       VARCHAR(200),
    name           VARCHAR(500) NOT NULL,
    category       VARCHAR(100),
    address        TEXT,
    lat            DOUBLE       NOT NULL,
    lng            DOUBLE       NOT NULL,
    nominatim_data JSON         NOT NULL,
    user_note      TEXT,
    user_tags      JSON         NOT NULL,
    icon           VARCHAR(50)  NOT NULL DEFAULT '📍',
    created_at     DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at     DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_maps_places_collection
        FOREIGN KEY (collection_id) REFERENCES maps.collections(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE INDEX idx_maps_places_owner ON maps.saved_places(owner_id);
CREATE INDEX idx_maps_places_latlng ON maps.saved_places(lat, lng);
-- No partial index on MySQL: a plain composite index instead of the PostgreSQL
-- `WHERE osm_id IS NOT NULL`.
CREATE INDEX idx_maps_places_osm ON maps.saved_places(osm_type, osm_id);

CREATE TABLE maps.reviews (
    id         BINARY(16)   NOT NULL PRIMARY KEY,
    owner_id   BINARY(16)   NOT NULL,
    osm_type   VARCHAR(10)  NOT NULL,
    osm_id     BIGINT       NOT NULL,
    place_name VARCHAR(500),
    rating     SMALLINT     NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment    TEXT,
    tags       JSON         NOT NULL,
    created_at DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    UNIQUE (owner_id, osm_type, osm_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE INDEX idx_maps_reviews_osm   ON maps.reviews(osm_type, osm_id);
CREATE INDEX idx_maps_reviews_owner ON maps.reviews(owner_id);
