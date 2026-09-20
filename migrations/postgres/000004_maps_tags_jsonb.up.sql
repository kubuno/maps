-- Portable list columns: TEXT[] -> jsonb array of strings.
--
-- The array type (and its GIN array_ops index) has no equivalent on MySQL or
-- SQLite; kubuno-db carries a small list as a JSON array on all three engines.
-- On PostgreSQL the earlier, frozen migration created these columns as TEXT[];
-- this new file converts them without changing the frozen bytes. The MySQL and
-- SQLite migration directories declare the columns JSON from the start, so they
-- carry no equivalent ALTER.
--
-- The DEFAULT is dropped before the type change (a TEXT[] default cannot be cast
-- to jsonb automatically) and re-set as an empty JSON array afterwards.

ALTER TABLE maps.saved_places ALTER COLUMN user_tags DROP DEFAULT;
ALTER TABLE maps.saved_places
    ALTER COLUMN user_tags TYPE jsonb USING to_jsonb(user_tags);
ALTER TABLE maps.saved_places ALTER COLUMN user_tags SET DEFAULT '[]'::jsonb;

ALTER TABLE maps.reviews ALTER COLUMN tags DROP DEFAULT;
ALTER TABLE maps.reviews
    ALTER COLUMN tags TYPE jsonb USING to_jsonb(tags);
ALTER TABLE maps.reviews ALTER COLUMN tags SET DEFAULT '[]'::jsonb;

-- Swap the array GIN index for a jsonb one so `@>` (json_array_contains) stays
-- indexed. jsonb_path_ops is the smaller, faster opclass for @>-only lookups.
DROP INDEX IF EXISTS maps.idx_maps_places_tags;
CREATE INDEX idx_maps_places_tags ON maps.saved_places USING gin (user_tags jsonb_path_ops);
