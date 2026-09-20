-- Reverse the jsonb conversion back to TEXT[].
DROP INDEX IF EXISTS maps.idx_maps_places_tags;

ALTER TABLE maps.saved_places ALTER COLUMN user_tags DROP DEFAULT;
ALTER TABLE maps.saved_places
    ALTER COLUMN user_tags TYPE text[]
    USING ARRAY(SELECT jsonb_array_elements_text(user_tags));
ALTER TABLE maps.saved_places ALTER COLUMN user_tags SET DEFAULT '{}';

ALTER TABLE maps.reviews ALTER COLUMN tags DROP DEFAULT;
ALTER TABLE maps.reviews
    ALTER COLUMN tags TYPE text[]
    USING ARRAY(SELECT jsonb_array_elements_text(tags));
ALTER TABLE maps.reviews ALTER COLUMN tags SET DEFAULT '{}';

CREATE INDEX idx_maps_places_tags ON maps.saved_places USING GIN(user_tags);
