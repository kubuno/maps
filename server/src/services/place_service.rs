use chrono::{DateTime, Utc};
use kubuno_db::dialect::Assign;
use kubuno_db::{params, DbPool};
use uuid::Uuid;

use crate::errors::{MapsError, Result};
use crate::models::place::{
    CreateCollectionDto, CreatePlaceDto, CreateReviewDto, PlaceCollection, SavedPlace,
    UpdatePlaceDto, UserReview,
};

/// Column list shared by every `saved_places` query. It is a macro rather than a
/// `const` so callers can splice it with `concat!`, which keeps the whole query a
/// compile-time `&'static str` literal — nothing is built at run time, so there is
/// no dynamic SQL to audit.
macro_rules! place_cols {
    () => {
        r#"
    id, owner_id, collection_id, osm_type, osm_id, place_id, name, category, address,
    lat, lng,
    nominatim_data, user_note, user_tags, icon, created_at, updated_at
"#
    };
}

/// A `PlaceCollection` plus its on-the-fly `place_count`, decoded as `i64`.
///
/// The count subquery returns `BIGINT UNSIGNED` on MySQL and `INTEGER` on SQLite;
/// `count_bigint` normalises the SQL type to a signed 64-bit, which decodes into
/// `i64` on all three engines. `PlaceCollection::place_count` is an `i32`, so the
/// value is narrowed on the way out (a per-user collection count never overflows).
#[derive(Debug, sqlx::FromRow)]
struct CollectionRow {
    id:          Uuid,
    owner_id:    Uuid,
    name:        String,
    description: Option<String>,
    icon:        String,
    color:       String,
    is_public:   bool,
    place_count: i64,
    created_at:  DateTime<Utc>,
    updated_at:  DateTime<Utc>,
}

impl From<CollectionRow> for PlaceCollection {
    fn from(r: CollectionRow) -> Self {
        PlaceCollection {
            id:          r.id,
            owner_id:    r.owner_id,
            name:        r.name,
            description: r.description,
            icon:        r.icon,
            color:       r.color,
            is_public:   r.is_public,
            place_count: r.place_count as i32,
            created_at:  r.created_at,
            updated_at:  r.updated_at,
        }
    }
}

/// The `SELECT` for one or more collections, with `place_count` computed by a
/// portable, type-normalised count subquery.
fn collection_select(db: &DbPool) -> String {
    format!(
        "SELECT c.id, c.owner_id, c.name, c.description, c.icon, c.color, c.is_public,
                (SELECT {cnt} FROM maps.saved_places sp WHERE sp.collection_id = c.id) AS place_count,
                c.created_at, c.updated_at
         FROM maps.collections c",
        cnt = db.backend().count_bigint("*"),
    )
}

// ── Places ────────────────────────────────────────────────────────────────────

pub async fn list_places(
    db:       &DbPool,
    owner_id: Uuid,
    collection_id: Option<Uuid>,
) -> Result<Vec<SavedPlace>> {
    let places = if let Some(cid) = collection_id {
        db.fetch_all_as::<SavedPlace>(
            concat!("SELECT ", place_cols!(), " FROM maps.saved_places WHERE owner_id = $1 AND collection_id = $2 ORDER BY created_at DESC"),
            params![owner_id, cid],
        )
        .await?
    } else {
        db.fetch_all_as::<SavedPlace>(
            concat!("SELECT ", place_cols!(), " FROM maps.saved_places WHERE owner_id = $1 ORDER BY created_at DESC"),
            params![owner_id],
        )
        .await?
    };
    Ok(places)
}

pub async fn get_place(db: &DbPool, id: Uuid, owner_id: Uuid) -> Result<SavedPlace> {
    db.fetch_optional_as::<SavedPlace>(
        concat!("SELECT ", place_cols!(), " FROM maps.saved_places WHERE id = $1 AND owner_id = $2"),
        params![id, owner_id],
    )
    .await?
    .ok_or_else(|| MapsError::NotFound(format!("Place {id}")))
}

pub async fn create_place(db: &DbPool, owner_id: Uuid, dto: &CreatePlaceDto) -> Result<SavedPlace> {
    let nominatim_data = dto.nominatim_data.clone().unwrap_or(serde_json::Value::Object(Default::default()));
    let user_tags: Vec<String> = dto.user_tags.clone().unwrap_or_default();
    let icon = dto.icon.as_deref().unwrap_or("📍");

    // Key generated in Rust, then the row is read back by it (no RETURNING).
    let id = kubuno_db::new_id();
    db.execute(
        "INSERT INTO maps.saved_places
            (id, owner_id, collection_id, osm_type, osm_id, place_id, name, category, address,
             lat, lng, nominatim_data, user_note, user_tags, icon)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)",
        params![
            id,
            owner_id,
            dto.collection_id,
            dto.osm_type.clone(),
            dto.osm_id,
            dto.place_id.clone(),
            &dto.name,
            dto.category.clone(),
            dto.address.clone(),
            dto.lat,
            dto.lng,
            nominatim_data,
            dto.user_note.clone(),
            user_tags,
            icon,
        ],
    )
    .await?;

    get_place(db, id, owner_id).await
}

pub async fn update_place(
    db:       &DbPool,
    id:       Uuid,
    owner_id: Uuid,
    dto:      &UpdatePlaceDto,
) -> Result<SavedPlace> {
    // collection_id: Some(_) → write it (value or NULL); None → leave unchanged.
    let set_collection = dto.collection_id.is_some();
    let collection_val = dto.collection_id.flatten();

    // Placeholders numbered in text order (kubuno-db requires 1..n, once each):
    // the SET list comes before the WHERE. NOW() is bound from Rust.
    db.execute(
        "UPDATE maps.saved_places
           SET name          = COALESCE($1, name),
               user_note     = COALESCE($2, user_note),
               user_tags     = COALESCE($3, user_tags),
               icon          = COALESCE($4, icon),
               collection_id = CASE WHEN $5 THEN $6 ELSE collection_id END,
               updated_at    = $7
         WHERE id = $8 AND owner_id = $9",
        params![
            dto.name.clone(),
            dto.user_note.clone(),
            dto.user_tags.clone(),
            dto.icon.clone(),
            set_collection,
            collection_val,
            Utc::now(),
            id,
            owner_id,
        ],
    )
    .await?;

    // The row is read back by its key: a no-op COALESCE update reports 0 affected
    // rows on MySQL, so `rows_affected` cannot tell "absent" from "unchanged".
    // A wrong owner leaves nothing to read → NotFound.
    db.fetch_optional_as::<SavedPlace>(
        concat!("SELECT ", place_cols!(), " FROM maps.saved_places WHERE id = $1 AND owner_id = $2"),
        params![id, owner_id],
    )
    .await?
    .ok_or_else(|| MapsError::NotFound(format!("Place {id}")))
}

pub async fn delete_place(db: &DbPool, id: Uuid, owner_id: Uuid) -> Result<()> {
    let affected = db
        .execute(
            "DELETE FROM maps.saved_places WHERE id = $1 AND owner_id = $2",
            params![id, owner_id],
        )
        .await?;
    if affected == 0 {
        return Err(MapsError::NotFound(format!("Place {id}")));
    }
    Ok(())
}

pub async fn delete_places_by_owner(db: &DbPool, owner_id: Uuid) -> Result<()> {
    db.execute("DELETE FROM maps.saved_places WHERE owner_id = $1", params![owner_id])
        .await?;
    Ok(())
}

// ── Collections ───────────────────────────────────────────────────────────────

pub async fn list_collections(db: &DbPool, owner_id: Uuid) -> Result<Vec<PlaceCollection>> {
    let sql = format!("{} WHERE c.owner_id = $1 ORDER BY c.name", collection_select(db));
    let rows: Vec<CollectionRow> = db.fetch_all_as(&sql, params![owner_id]).await?;
    Ok(rows.into_iter().map(Into::into).collect())
}

pub async fn get_collection(db: &DbPool, id: Uuid, owner_id: Uuid) -> Result<PlaceCollection> {
    let sql = format!("{} WHERE c.id = $1 AND c.owner_id = $2", collection_select(db));
    db.fetch_optional_as::<CollectionRow>(&sql, params![id, owner_id])
        .await?
        .map(Into::into)
        .ok_or_else(|| MapsError::NotFound(format!("Collection {id}")))
}

pub async fn create_collection(db: &DbPool, owner_id: Uuid, dto: &CreateCollectionDto) -> Result<PlaceCollection> {
    let id = kubuno_db::new_id();
    db.execute(
        "INSERT INTO maps.collections (id, owner_id, name, description, icon, color, is_public)
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
        params![
            id,
            owner_id,
            &dto.name,
            dto.description.clone(),
            dto.icon.as_deref().unwrap_or("⭐"),
            dto.color.as_deref().unwrap_or("#1a73e8"),
            dto.is_public.unwrap_or(false),
        ],
    )
    .await?;

    get_collection(db, id, owner_id).await
}

pub async fn delete_collection(db: &DbPool, id: Uuid, owner_id: Uuid) -> Result<()> {
    let affected = db
        .execute(
            "DELETE FROM maps.collections WHERE id = $1 AND owner_id = $2",
            params![id, owner_id],
        )
        .await?;
    if affected == 0 {
        return Err(MapsError::NotFound(format!("Collection {id}")));
    }
    Ok(())
}

// ── Reviews ───────────────────────────────────────────────────────────────────

const REVIEW_COLS: &str =
    "id, owner_id, osm_type, osm_id, place_name, rating, comment, tags, created_at, updated_at";

pub async fn list_reviews_for_place(
    db:       &DbPool,
    osm_type: &str,
    osm_id:   i64,
) -> Result<Vec<UserReview>> {
    let sql = format!(
        "SELECT {REVIEW_COLS} FROM maps.reviews \
         WHERE osm_type = $1 AND osm_id = $2 ORDER BY created_at DESC"
    );
    Ok(db.fetch_all_as::<UserReview>(&sql, params![osm_type, osm_id]).await?)
}

pub async fn create_review(db: &DbPool, owner_id: Uuid, dto: &CreateReviewDto) -> Result<UserReview> {
    let tags: Vec<String> = dto.tags.clone().unwrap_or_default();
    let b = db.backend();

    // Upsert on the natural key (owner, place). The id is generated for the
    // insert branch; on conflict the stored row keeps its id, so the row is read
    // back by the natural key rather than by id. `updated_at` is refreshed with
    // the engine's own "now" (there is no updated_at trigger on `reviews`).
    let insert = format!(
        "INSERT INTO maps.reviews (id, owner_id, osm_type, osm_id, place_name, rating, comment, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8){}",
        b.upsert(
            "reviews",
            &["owner_id", "osm_type", "osm_id"],
            &[
                Assign::Incoming("rating"),
                Assign::Incoming("comment"),
                Assign::Incoming("tags"),
                Assign::Expr { col: "updated_at", expr: b.now() },
            ],
        ),
    );

    db.execute(
        &insert,
        params![
            kubuno_db::new_id(),
            owner_id,
            &dto.osm_type,
            dto.osm_id,
            dto.place_name.clone(),
            dto.rating,
            dto.comment.clone(),
            tags,
        ],
    )
    .await?;

    let sql = format!(
        "SELECT {REVIEW_COLS} FROM maps.reviews \
         WHERE owner_id = $1 AND osm_type = $2 AND osm_id = $3"
    );
    Ok(db
        .fetch_one_as::<UserReview>(&sql, params![owner_id, &dto.osm_type, dto.osm_id])
        .await?)
}

pub async fn delete_review(db: &DbPool, id: Uuid, owner_id: Uuid) -> Result<()> {
    let affected = db
        .execute(
            "DELETE FROM maps.reviews WHERE id = $1 AND owner_id = $2",
            params![id, owner_id],
        )
        .await?;
    if affected == 0 {
        return Err(MapsError::NotFound(format!("Review {id}")));
    }
    Ok(())
}
