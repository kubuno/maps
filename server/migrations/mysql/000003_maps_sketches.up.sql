-- Sketches: user-drawn map overlays stored as a GeoJSON FeatureCollection.
-- Optionally shareable read-only via an opaque token.
--
-- The PostgreSQL partial UNIQUE index (`WHERE share_token IS NOT NULL`) becomes a
-- plain UNIQUE key: MySQL allows several NULLs in a UNIQUE index, so an unshared
-- sketch (NULL token) never collides — the same effect.
CREATE TABLE maps.sketches (
    id          BINARY(16)   NOT NULL PRIMARY KEY,
    owner_id    BINARY(16)   NOT NULL,
    name        VARCHAR(255) NOT NULL DEFAULT 'Croquis',
    data        JSON         NOT NULL,
    is_public   BOOLEAN      NOT NULL DEFAULT FALSE,
    share_token VARCHAR(64),
    created_at  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    UNIQUE (share_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE INDEX idx_maps_sketches_owner ON maps.sketches(owner_id, updated_at);
