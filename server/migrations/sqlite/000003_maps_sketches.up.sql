-- Sketches: user-drawn map overlays stored as a GeoJSON FeatureCollection.
-- SQLite supports partial indexes, so the shared-token UNIQUE index keeps its
-- `WHERE share_token IS NOT NULL` guard exactly as on PostgreSQL.
CREATE TABLE maps.sketches (
    id          BLOB    NOT NULL PRIMARY KEY,
    owner_id    BLOB    NOT NULL,
    name        TEXT    NOT NULL DEFAULT 'Croquis',
    data        TEXT    NOT NULL,
    is_public   INTEGER NOT NULL DEFAULT 0,
    share_token TEXT,
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
    updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
);

CREATE INDEX maps.idx_maps_sketches_owner ON sketches(owner_id, updated_at);
CREATE UNIQUE INDEX maps.idx_maps_sketches_token ON sketches(share_token)
    WHERE share_token IS NOT NULL;
