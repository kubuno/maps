CREATE TABLE maps.saved_routes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id        UUID NOT NULL,
    name            VARCHAR(255),
    transport_mode  VARCHAR(20) NOT NULL DEFAULT 'driving',
    waypoints       JSONB NOT NULL,
    distance_meters INTEGER,
    duration_secs   INTEGER,
    route_geometry  JSONB,
    osrm_data       JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_maps_routes_owner ON maps.saved_routes(owner_id, created_at DESC);

CREATE TABLE maps.gpx_traces (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id        UUID NOT NULL,
    name            VARCHAR(500) NOT NULL,
    description     TEXT,
    storage_path    TEXT NOT NULL,
    distance_meters DECIMAL(10, 2),
    elevation_gain  DECIMAL(8, 2),
    elevation_loss  DECIMAL(8, 2),
    duration_secs   INTEGER,
    point_count     INTEGER NOT NULL DEFAULT 0,
    bbox_min_lat    FLOAT8,
    bbox_min_lng    FLOAT8,
    bbox_max_lat    FLOAT8,
    bbox_max_lng    FLOAT8,
    activity_type   VARCHAR(20) NOT NULL DEFAULT 'other',
    recorded_at     TIMESTAMPTZ,
    is_public       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_maps_gpx_owner ON maps.gpx_traces(owner_id, created_at DESC);
CREATE INDEX idx_maps_gpx_bbox  ON maps.gpx_traces(bbox_min_lat, bbox_min_lng, bbox_max_lat, bbox_max_lng);

CREATE TABLE maps.search_history (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id        UUID NOT NULL,
    query           VARCHAR(500) NOT NULL,
    result_name     VARCHAR(500),
    result_lat      DECIMAL(10, 7),
    result_lng      DECIMAL(10, 7),
    result_osm_type VARCHAR(10),
    result_osm_id   BIGINT,
    searched_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_maps_history_owner ON maps.search_history(owner_id, searched_at DESC);
