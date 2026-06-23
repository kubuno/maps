-- Sketches: user-drawn map overlays (measure results, pins, lines, polygons,
-- circles, text) stored as a GeoJSON FeatureCollection. Optionally shareable
-- read-only via an opaque token.
CREATE TABLE maps.sketches (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id    UUID NOT NULL,
    name        VARCHAR(255) NOT NULL DEFAULT 'Croquis',
    data        JSONB NOT NULL DEFAULT '{"type":"FeatureCollection","features":[]}',
    is_public   BOOLEAN NOT NULL DEFAULT FALSE,
    share_token VARCHAR(64),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_maps_sketches_owner ON maps.sketches(owner_id, updated_at DESC);
CREATE UNIQUE INDEX idx_maps_sketches_token ON maps.sketches(share_token) WHERE share_token IS NOT NULL;
