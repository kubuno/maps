DROP TRIGGER IF EXISTS saved_places_updated_at ON maps.saved_places;
DROP TRIGGER IF EXISTS collections_updated_at  ON maps.collections;
DROP TABLE IF EXISTS maps.reviews;
DROP TABLE IF EXISTS maps.saved_places;
DROP TABLE IF EXISTS maps.collections;
DROP FUNCTION IF EXISTS maps.set_updated_at();
DROP SCHEMA IF EXISTS maps;
