//! Runs maps' own migrations and its real place/collection/review service code
//! against a live server of **each** engine, from a single compiled binary — the
//! proof that the engine is a run-time choice, not a build-time one.
//!
//! * SQLite always runs (a temp file, no server).
//! * PostgreSQL runs when `KUBUNO_PG_TEST_URL` points at a throwaway database.
//! * MySQL/MariaDB runs when `KUBUNO_MYSQL_TEST_URL` does.
//!
//! ```sh
//! KUBUNO_PG_TEST_URL=postgres://u:p@127.0.0.1:5433/maps \
//! KUBUNO_MYSQL_TEST_URL=mysql://u:p@127.0.0.1:3307/maps \
//!   cargo test --test db_portability
//! ```
//!
//! The same binary contains all three drivers; each engine's suite is one test.

use kubuno_db::params;
use kubuno_maps::models::place::{
    CreateCollectionDto, CreatePlaceDto, CreateReviewDto, SavedPlace, UpdatePlaceDto,
};
use kubuno_maps::services::place_service;
use kubuno_maps::SCHEMA;
use uuid::Uuid;

fn base_settings(engine: &str) -> kubuno_db::DbSettings {
    kubuno_db::DbSettings {
        engine: engine.to_string(),
        url: None,
        host: None,
        port: None,
        user: None,
        password: None,
        database: None,
        path: None,
        max_connections: 4,
        min_connections: 0,
        connect_timeout: std::time::Duration::from_secs(10),
        run_migrations: true,
        schema_prefix: None,
    }
}

/// Migrations only run one at a time: the PostgreSQL and MySQL suites may share
/// a server.
static EXCLUSIVE: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

async fn migrated_pool(settings: kubuno_db::DbSettings) -> (kubuno_db::DbPool, impl Sized) {
    let guard = EXCLUSIVE.lock().await;
    let pool = kubuno_db::connect(&settings, SCHEMA).await.expect("connect");

    // Exactly the calls `main.rs` makes.
    kubuno_db::migrations!(
        "./migrations/postgres",
        "./migrations/mysql",
        "./migrations/sqlite",
    )
    .run(&pool, SCHEMA)
    .await
    .expect("migrations");

    (pool, guard)
}

fn place_dto(name: &str, tags: Vec<String>) -> CreatePlaceDto {
    CreatePlaceDto {
        collection_id: None,
        osm_type: Some("node".into()),
        osm_id: Some(42),
        place_id: Some("p1".into()),
        name: name.into(),
        category: Some("cafe".into()),
        address: Some("1 rue de Rivoli".into()),
        lat: 48.8566,
        lng: 2.3522,
        nominatim_data: Some(serde_json::json!({ "class": "amenity" })),
        user_note: Some("nice".into()),
        user_tags: Some(tags),
        icon: Some("☕".into()),
    }
}

/// Columns matching `SavedPlace`, for the ad-hoc `json_array_contains` filter.
const PLACE_COLS: &str = "id, owner_id, collection_id, osm_type, osm_id, place_id, name, \
    category, address, lat, lng, nominatim_data, user_note, user_tags, icon, created_at, updated_at";

/// The whole place/collection/review path — the JSON-array columns, the upsert,
/// the computed collection count, and the `json_array_contains` filter that
/// replaces the PostgreSQL GIN array index.
async fn full_suite(pool: &kubuno_db::DbPool) {
    let owner = Uuid::new_v4();

    // ── a place carries a JSON array of tags, written and read back ──
    let place = place_service::create_place(pool, owner, &place_dto("Café A", vec!["wifi".into(), "cafe".into()]))
        .await
        .expect("create_place");
    assert_eq!(place.owner_id, owner);
    assert_eq!(place.name, "Café A");
    assert_eq!(place.user_tags, vec!["wifi".to_string(), "cafe".to_string()]);
    assert_eq!(place.lat, 48.8566);
    assert_eq!(place.nominatim_data["class"], "amenity");
    let place_id = place.id;

    let got = place_service::get_place(pool, place_id, owner).await.expect("get_place");
    assert_eq!(got.user_tags, vec!["wifi".to_string(), "cafe".to_string()]);

    assert_eq!(place_service::list_places(pool, owner, None).await.unwrap().len(), 1);

    // ── update: new tags (COALESCE), the placeholder-renumbered UPDATE ──
    let upd = UpdatePlaceDto {
        collection_id: None,
        name: Some("Café B".into()),
        user_note: None,
        user_tags: Some(vec!["terrasse".into()]),
        icon: None,
    };
    let updated = place_service::update_place(pool, place_id, owner, &upd).await.expect("update_place");
    assert_eq!(updated.name, "Café B");
    assert_eq!(updated.user_tags, vec!["terrasse".to_string()]);
    assert_eq!(updated.icon, "☕", "icon is left unchanged by COALESCE");

    // ── a collection, and its computed place_count decoded as i32 ──
    let col = place_service::create_collection(
        pool,
        owner,
        &CreateCollectionDto {
            name: "Favoris".into(),
            description: Some("desc".into()),
            icon: None,
            color: None,
            is_public: Some(false),
        },
    )
    .await
    .expect("create_collection");
    assert_eq!(col.place_count, 0);
    assert_eq!(col.icon, "⭐", "the compiled default icon");

    // Move the place into the collection (Some(Some(id)) writes the value).
    let move_dto = UpdatePlaceDto {
        collection_id: Some(Some(col.id)),
        name: None,
        user_note: None,
        user_tags: None,
        icon: None,
    };
    place_service::update_place(pool, place_id, owner, &move_dto).await.expect("move place");
    assert_eq!(place_service::list_places(pool, owner, Some(col.id)).await.unwrap().len(), 1);
    let col = place_service::get_collection(pool, col.id, owner).await.expect("get_collection");
    assert_eq!(col.place_count, 1, "count subquery decodes and counts on every engine");

    // ── json_array_contains replaces `= ANY(user_tags)` + its GIN index ──
    let frag = pool.backend().json_array_contains("user_tags", 2);
    let hits: Vec<SavedPlace> = pool
        .fetch_all_as(
            &format!("SELECT {PLACE_COLS} FROM maps.saved_places WHERE owner_id = $1 AND {frag}"),
            params![owner, "terrasse"],
        )
        .await
        .expect("tag filter");
    assert_eq!(hits.len(), 1, "the tag filter finds the place by its JSON-array member");
    let none: Vec<SavedPlace> = pool
        .fetch_all_as(
            &format!("SELECT {PLACE_COLS} FROM maps.saved_places WHERE owner_id = $1 AND {frag}"),
            params![owner, "absent"],
        )
        .await
        .expect("tag filter (miss)");
    assert!(none.is_empty());

    // ── a review upsert: the second create updates in place, not inserts ──
    let r1 = place_service::create_review(
        pool,
        owner,
        &CreateReviewDto {
            osm_type: "node".into(),
            osm_id: 42,
            place_name: Some("Café B".into()),
            rating: 3,
            comment: Some("ok".into()),
            tags: Some(vec!["service".into()]),
        },
    )
    .await
    .expect("create_review");
    assert_eq!(r1.rating, 3);
    assert_eq!(r1.tags, vec!["service".to_string()]);

    let r2 = place_service::create_review(
        pool,
        owner,
        &CreateReviewDto {
            osm_type: "node".into(),
            osm_id: 42,
            place_name: Some("Café B".into()),
            rating: 5,
            comment: Some("super".into()),
            tags: Some(vec!["service".into(), "cadre".into()]),
        },
    )
    .await
    .expect("upsert review");
    assert_eq!(r2.id, r1.id, "the upsert updates the same row (stable id)");
    assert_eq!(r2.rating, 5);
    assert_eq!(r2.tags, vec!["service".to_string(), "cadre".to_string()]);

    let reviews = place_service::list_reviews_for_place(pool, "node", 42).await.expect("list_reviews");
    assert_eq!(reviews.len(), 1, "the upsert did not create a second review");
    assert_eq!(reviews[0].rating, 5);

    // ── deletes report NotFound when nothing matched ──
    place_service::delete_review(pool, r1.id, owner).await.expect("delete_review");
    assert!(place_service::delete_review(pool, r1.id, owner).await.is_err(), "already gone");

    place_service::delete_place(pool, place_id, owner).await.expect("delete_place");
    assert!(place_service::get_place(pool, place_id, owner).await.is_err(), "place is gone");

    place_service::delete_collection(pool, col.id, owner).await.expect("delete_collection");
    assert!(place_service::delete_collection(pool, col.id, owner).await.is_err(), "already gone");

    // ── two owners never share a row ──
    let a = Uuid::new_v4();
    let b = Uuid::new_v4();
    place_service::create_place(pool, a, &place_dto("A", vec!["x".into()])).await.unwrap();
    place_service::create_place(pool, b, &place_dto("B", vec!["y".into()])).await.unwrap();
    assert_eq!(place_service::list_places(pool, a, None).await.unwrap().len(), 1);
    assert_eq!(place_service::list_places(pool, b, None).await.unwrap().len(), 1);
    place_service::delete_places_by_owner(pool, a).await.unwrap();
    assert!(place_service::list_places(pool, a, None).await.unwrap().is_empty());
    assert_eq!(place_service::list_places(pool, b, None).await.unwrap().len(), 1, "b's data untouched");
    place_service::delete_places_by_owner(pool, b).await.unwrap();
}

#[tokio::test]
async fn sqlite_from_the_one_binary() {
    let dir = tempfile::tempdir().expect("tempdir");
    let mut s = base_settings("sqlite");
    s.path = Some(dir.path().to_string_lossy().into_owned());
    let (pool, _keep) = migrated_pool(s).await;
    full_suite(&pool).await;
}

#[tokio::test]
async fn postgres_from_the_one_binary() {
    let Ok(url) = std::env::var("KUBUNO_PG_TEST_URL") else {
        eprintln!("skipping: KUBUNO_PG_TEST_URL not set");
        return;
    };
    let mut s = base_settings("postgres");
    s.url = Some(url);
    let (pool, _keep) = migrated_pool(s).await;
    full_suite(&pool).await;
}

#[tokio::test]
async fn mysql_from_the_one_binary() {
    let Ok(url) = std::env::var("KUBUNO_MYSQL_TEST_URL") else {
        eprintln!("skipping: KUBUNO_MYSQL_TEST_URL not set");
        return;
    };
    let mut s = base_settings("mysql");
    s.url = Some(url);
    let (pool, _keep) = migrated_pool(s).await;
    full_suite(&pool).await;
}
