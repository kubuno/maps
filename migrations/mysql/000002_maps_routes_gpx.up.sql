CREATE TABLE maps.saved_routes (
    id              BINARY(16)  NOT NULL PRIMARY KEY,
    owner_id        BINARY(16)  NOT NULL,
    name            VARCHAR(255),
    transport_mode  VARCHAR(20) NOT NULL DEFAULT 'driving',
    waypoints       JSON        NOT NULL,
    distance_meters INT,
    duration_secs   INT,
    route_geometry  JSON,
    osrm_data       JSON        NOT NULL,
    created_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE INDEX idx_maps_routes_owner ON maps.saved_routes(owner_id, created_at);

-- DECIMAL columns on PostgreSQL; DOUBLE here so no bigdecimal decode is needed
-- and the shared `CAST(... AS DOUBLE)` in the SELECTs is a harmless no-op.
CREATE TABLE maps.gpx_traces (
    id              BINARY(16)  NOT NULL PRIMARY KEY,
    owner_id        BINARY(16)  NOT NULL,
    name            VARCHAR(500) NOT NULL,
    description     TEXT,
    storage_path    TEXT        NOT NULL,
    distance_meters DOUBLE,
    elevation_gain  DOUBLE,
    elevation_loss  DOUBLE,
    duration_secs   INT,
    point_count     INT         NOT NULL DEFAULT 0,
    bbox_min_lat    DOUBLE,
    bbox_min_lng    DOUBLE,
    bbox_max_lat    DOUBLE,
    bbox_max_lng    DOUBLE,
    activity_type   VARCHAR(20) NOT NULL DEFAULT 'other',
    recorded_at     DATETIME(6),
    is_public       BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE INDEX idx_maps_gpx_owner ON maps.gpx_traces(owner_id, created_at);
CREATE INDEX idx_maps_gpx_bbox  ON maps.gpx_traces(bbox_min_lat, bbox_min_lng, bbox_max_lat, bbox_max_lng);

CREATE TABLE maps.search_history (
    id              BINARY(16)   NOT NULL PRIMARY KEY,
    owner_id        BINARY(16)   NOT NULL,
    query           VARCHAR(500) NOT NULL,
    result_name     VARCHAR(500),
    result_lat      DOUBLE,
    result_lng      DOUBLE,
    result_osm_type VARCHAR(10),
    result_osm_id   BIGINT,
    searched_at     DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE INDEX idx_maps_history_owner ON maps.search_history(owner_id, searched_at);
