CREATE TABLE maps.saved_routes (
    id              BLOB    NOT NULL PRIMARY KEY,
    owner_id        BLOB    NOT NULL,
    name            TEXT,
    transport_mode  TEXT    NOT NULL DEFAULT 'driving',
    waypoints       TEXT    NOT NULL,
    distance_meters INTEGER,
    duration_secs   INTEGER,
    route_geometry  TEXT,
    osrm_data       TEXT    NOT NULL,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
);

CREATE INDEX maps.idx_maps_routes_owner ON saved_routes(owner_id, created_at);

CREATE TABLE maps.gpx_traces (
    id              BLOB    NOT NULL PRIMARY KEY,
    owner_id        BLOB    NOT NULL,
    name            TEXT    NOT NULL,
    description     TEXT,
    storage_path    TEXT    NOT NULL,
    distance_meters REAL,
    elevation_gain  REAL,
    elevation_loss  REAL,
    duration_secs   INTEGER,
    point_count     INTEGER NOT NULL DEFAULT 0,
    bbox_min_lat    REAL,
    bbox_min_lng    REAL,
    bbox_max_lat    REAL,
    bbox_max_lng    REAL,
    activity_type   TEXT    NOT NULL DEFAULT 'other',
    recorded_at     TEXT,
    is_public       INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
);

CREATE INDEX maps.idx_maps_gpx_owner ON gpx_traces(owner_id, created_at);
CREATE INDEX maps.idx_maps_gpx_bbox  ON gpx_traces(bbox_min_lat, bbox_min_lng, bbox_max_lat, bbox_max_lng);

CREATE TABLE maps.search_history (
    id              BLOB    NOT NULL PRIMARY KEY,
    owner_id        BLOB    NOT NULL,
    query           TEXT    NOT NULL,
    result_name     TEXT,
    result_lat      REAL,
    result_lng      REAL,
    result_osm_type TEXT,
    result_osm_id   INTEGER,
    searched_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
);

CREATE INDEX maps.idx_maps_history_owner ON search_history(owner_id, searched_at);
