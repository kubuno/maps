CREATE SCHEMA IF NOT EXISTS maps;

CREATE OR REPLACE FUNCTION maps.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TABLE maps.collections (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id    UUID NOT NULL,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    icon        VARCHAR(10)  NOT NULL DEFAULT '⭐',
    color       VARCHAR(7)   NOT NULL DEFAULT '#1a73e8',
    is_public   BOOLEAN NOT NULL DEFAULT FALSE,
    place_count INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_maps_collections_owner ON maps.collections(owner_id);

CREATE TRIGGER collections_updated_at
    BEFORE UPDATE ON maps.collections
    FOR EACH ROW EXECUTE FUNCTION maps.set_updated_at();

CREATE TABLE maps.saved_places (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id        UUID NOT NULL,
    collection_id   UUID REFERENCES maps.collections(id) ON DELETE SET NULL,
    osm_type        VARCHAR(10),
    osm_id          BIGINT,
    place_id        VARCHAR(200),
    name            VARCHAR(500) NOT NULL,
    category        VARCHAR(100),
    address         TEXT,
    lat             FLOAT8 NOT NULL,
    lng             FLOAT8 NOT NULL,
    nominatim_data  JSONB NOT NULL DEFAULT '{}',
    user_note       TEXT,
    user_tags       TEXT[] NOT NULL DEFAULT '{}',
    icon            VARCHAR(50) NOT NULL DEFAULT '📍',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_maps_places_owner  ON maps.saved_places(owner_id);
CREATE INDEX idx_maps_places_latlng ON maps.saved_places(lat, lng);
CREATE INDEX idx_maps_places_osm    ON maps.saved_places(osm_type, osm_id)
    WHERE osm_id IS NOT NULL;
CREATE INDEX idx_maps_places_tags     ON maps.saved_places USING GIN(user_tags);

CREATE TRIGGER saved_places_updated_at
    BEFORE UPDATE ON maps.saved_places
    FOR EACH ROW EXECUTE FUNCTION maps.set_updated_at();

CREATE TABLE maps.reviews (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id    UUID NOT NULL,
    osm_type    VARCHAR(10) NOT NULL,
    osm_id      BIGINT NOT NULL,
    place_name  VARCHAR(500),
    rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment     TEXT,
    tags        TEXT[] NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_id, osm_type, osm_id)
);

CREATE INDEX idx_maps_reviews_osm   ON maps.reviews(osm_type, osm_id);
CREATE INDEX idx_maps_reviews_owner ON maps.reviews(owner_id);
