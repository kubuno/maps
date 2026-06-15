use uuid::Uuid;

use crate::errors::{MapsError, Result};
use crate::models::place::{
    CreateCollectionDto, CreatePlaceDto, CreateReviewDto, PlaceCollection, SavedPlace, UserReview,
};

const PLACE_COLS: &str = r#"
    id, owner_id, collection_id, osm_type, osm_id, place_id, name, category, address,
    lat, lng,
    nominatim_data, user_note, user_tags, icon, created_at, updated_at
"#;

fn row_to_place(row: &sqlx::postgres::PgRow) -> std::result::Result<SavedPlace, sqlx::Error> {
    use sqlx::Row;
    Ok(SavedPlace {
        id:             row.try_get::<Uuid, _>("id")?,
        owner_id:       row.try_get::<Uuid, _>("owner_id")?,
        collection_id:  row.try_get::<Option<Uuid>, _>("collection_id")?,
        osm_type:       row.try_get::<Option<String>, _>("osm_type")?,
        osm_id:         row.try_get::<Option<i64>, _>("osm_id")?,
        place_id:       row.try_get::<Option<String>, _>("place_id")?,
        name:           row.try_get::<String, _>("name")?,
        category:       row.try_get::<Option<String>, _>("category")?,
        address:        row.try_get::<Option<String>, _>("address")?,
        lat:            row.try_get::<f64, _>("lat")?,
        lng:            row.try_get::<f64, _>("lng")?,
        nominatim_data: row.try_get::<serde_json::Value, _>("nominatim_data")?,
        user_note:      row.try_get::<Option<String>, _>("user_note")?,
        user_tags:      row.try_get::<Vec<String>, _>("user_tags")?,
        icon:           row.try_get::<String, _>("icon")?,
        created_at:     row.try_get::<chrono::DateTime<chrono::Utc>, _>("created_at")?,
        updated_at:     row.try_get::<chrono::DateTime<chrono::Utc>, _>("updated_at")?,
    })
}

fn row_to_collection(row: &sqlx::postgres::PgRow) -> std::result::Result<PlaceCollection, sqlx::Error> {
    use sqlx::Row;
    Ok(PlaceCollection {
        id:          row.try_get::<Uuid, _>("id")?,
        owner_id:    row.try_get::<Uuid, _>("owner_id")?,
        name:        row.try_get::<String, _>("name")?,
        description: row.try_get::<Option<String>, _>("description")?,
        icon:        row.try_get::<String, _>("icon")?,
        color:       row.try_get::<String, _>("color")?,
        is_public:   row.try_get::<bool, _>("is_public")?,
        place_count: row.try_get::<i32, _>("place_count")?,
        created_at:  row.try_get::<chrono::DateTime<chrono::Utc>, _>("created_at")?,
        updated_at:  row.try_get::<chrono::DateTime<chrono::Utc>, _>("updated_at")?,
    })
}

fn row_to_review(row: &sqlx::postgres::PgRow) -> std::result::Result<UserReview, sqlx::Error> {
    use sqlx::Row;
    Ok(UserReview {
        id:         row.try_get::<Uuid, _>("id")?,
        owner_id:   row.try_get::<Uuid, _>("owner_id")?,
        osm_type:   row.try_get::<String, _>("osm_type")?,
        osm_id:     row.try_get::<i64, _>("osm_id")?,
        place_name: row.try_get::<Option<String>, _>("place_name")?,
        rating:     row.try_get::<i16, _>("rating")?,
        comment:    row.try_get::<Option<String>, _>("comment")?,
        tags:       row.try_get::<Vec<String>, _>("tags")?,
        created_at: row.try_get::<chrono::DateTime<chrono::Utc>, _>("created_at")?,
        updated_at: row.try_get::<chrono::DateTime<chrono::Utc>, _>("updated_at")?,
    })
}

// ── Places ────────────────────────────────────────────────────────────────────

pub async fn list_places(
    db:       &sqlx::PgPool,
    owner_id: Uuid,
    collection_id: Option<Uuid>,
) -> Result<Vec<SavedPlace>> {
    let rows = if let Some(cid) = collection_id {
        sqlx::query(&format!("SELECT {PLACE_COLS} FROM maps.saved_places WHERE owner_id = $1 AND collection_id = $2 ORDER BY created_at DESC"))
            .bind(owner_id)
            .bind(cid)
            .fetch_all(db)
            .await?
    } else {
        sqlx::query(&format!("SELECT {PLACE_COLS} FROM maps.saved_places WHERE owner_id = $1 ORDER BY created_at DESC"))
            .bind(owner_id)
            .fetch_all(db)
            .await?
    };

    rows.iter().map(row_to_place).collect::<std::result::Result<_, _>>().map_err(MapsError::Database)
}

pub async fn get_place(db: &sqlx::PgPool, id: Uuid, owner_id: Uuid) -> Result<SavedPlace> {
    let row = sqlx::query(&format!("SELECT {PLACE_COLS} FROM maps.saved_places WHERE id = $1 AND owner_id = $2"))
        .bind(id)
        .bind(owner_id)
        .fetch_optional(db)
        .await?
        .ok_or_else(|| MapsError::NotFound(format!("Place {id}")))?;

    row_to_place(&row).map_err(MapsError::Database)
}

pub async fn create_place(db: &sqlx::PgPool, owner_id: Uuid, dto: &CreatePlaceDto) -> Result<SavedPlace> {
    let nominatim_data = dto.nominatim_data.clone().unwrap_or(serde_json::Value::Object(Default::default()));
    let user_tags: Vec<String> = dto.user_tags.clone().unwrap_or_default();
    let icon = dto.icon.as_deref().unwrap_or("📍");

    let row = sqlx::query(&format!(r#"
        INSERT INTO maps.saved_places
            (owner_id, collection_id, osm_type, osm_id, place_id, name, category, address,
             lat, lng, nominatim_data, user_note, user_tags, icon)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING {PLACE_COLS}
    "#))
        .bind(owner_id)
        .bind(dto.collection_id)
        .bind(&dto.osm_type)
        .bind(dto.osm_id)
        .bind(&dto.place_id)
        .bind(&dto.name)
        .bind(&dto.category)
        .bind(&dto.address)
        .bind(dto.lat)   // $9
        .bind(dto.lng)   // $10
        .bind(&nominatim_data)
        .bind(&dto.user_note)
        .bind(&user_tags)
        .bind(icon)
        .fetch_one(db)
        .await?;

    row_to_place(&row).map_err(MapsError::Database)
}

pub async fn delete_place(db: &sqlx::PgPool, id: Uuid, owner_id: Uuid) -> Result<()> {
    let r = sqlx::query("DELETE FROM maps.saved_places WHERE id = $1 AND owner_id = $2")
        .bind(id)
        .bind(owner_id)
        .execute(db)
        .await?;
    if r.rows_affected() == 0 {
        return Err(MapsError::NotFound(format!("Place {id}")));
    }
    Ok(())
}

pub async fn delete_places_by_owner(db: &sqlx::PgPool, owner_id: Uuid) -> Result<()> {
    sqlx::query("DELETE FROM maps.saved_places WHERE owner_id = $1")
        .bind(owner_id)
        .execute(db)
        .await?;
    Ok(())
}

// ── Collections ───────────────────────────────────────────────────────────────

pub async fn list_collections(db: &sqlx::PgPool, owner_id: Uuid) -> Result<Vec<PlaceCollection>> {
    let rows = sqlx::query(
        "SELECT id, owner_id, name, description, icon, color, is_public, place_count, created_at, updated_at
         FROM maps.collections WHERE owner_id = $1 ORDER BY name"
    )
    .bind(owner_id)
    .fetch_all(db)
    .await?;

    rows.iter().map(row_to_collection).collect::<std::result::Result<_, _>>().map_err(MapsError::Database)
}

pub async fn get_collection(db: &sqlx::PgPool, id: Uuid, owner_id: Uuid) -> Result<PlaceCollection> {
    let row = sqlx::query(
        "SELECT id, owner_id, name, description, icon, color, is_public, place_count, created_at, updated_at
         FROM maps.collections WHERE id = $1 AND owner_id = $2"
    )
    .bind(id)
    .bind(owner_id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| MapsError::NotFound(format!("Collection {id}")))?;

    row_to_collection(&row).map_err(MapsError::Database)
}

pub async fn create_collection(db: &sqlx::PgPool, owner_id: Uuid, dto: &CreateCollectionDto) -> Result<PlaceCollection> {
    let row = sqlx::query(
        "INSERT INTO maps.collections (owner_id, name, description, icon, color, is_public)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, owner_id, name, description, icon, color, is_public, place_count, created_at, updated_at"
    )
    .bind(owner_id)
    .bind(&dto.name)
    .bind(&dto.description)
    .bind(dto.icon.as_deref().unwrap_or("⭐"))
    .bind(dto.color.as_deref().unwrap_or("#1a73e8"))
    .bind(dto.is_public.unwrap_or(false))
    .fetch_one(db)
    .await?;

    row_to_collection(&row).map_err(MapsError::Database)
}

pub async fn delete_collection(db: &sqlx::PgPool, id: Uuid, owner_id: Uuid) -> Result<()> {
    let r = sqlx::query("DELETE FROM maps.collections WHERE id = $1 AND owner_id = $2")
        .bind(id)
        .bind(owner_id)
        .execute(db)
        .await?;
    if r.rows_affected() == 0 {
        return Err(MapsError::NotFound(format!("Collection {id}")));
    }
    Ok(())
}

// ── Reviews ───────────────────────────────────────────────────────────────────

pub async fn list_reviews_for_place(
    db:       &sqlx::PgPool,
    osm_type: &str,
    osm_id:   i64,
) -> Result<Vec<UserReview>> {
    let rows = sqlx::query(
        "SELECT id, owner_id, osm_type, osm_id, place_name, rating, comment, tags, created_at, updated_at
         FROM maps.reviews WHERE osm_type = $1 AND osm_id = $2 ORDER BY created_at DESC"
    )
    .bind(osm_type)
    .bind(osm_id)
    .fetch_all(db)
    .await?;

    rows.iter().map(row_to_review).collect::<std::result::Result<_, _>>().map_err(MapsError::Database)
}

pub async fn create_review(db: &sqlx::PgPool, owner_id: Uuid, dto: &CreateReviewDto) -> Result<UserReview> {
    let tags: Vec<String> = dto.tags.clone().unwrap_or_default();

    let row = sqlx::query(
        "INSERT INTO maps.reviews (owner_id, osm_type, osm_id, place_name, rating, comment, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (owner_id, osm_type, osm_id)
         DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment,
                       tags = EXCLUDED.tags, updated_at = NOW()
         RETURNING id, owner_id, osm_type, osm_id, place_name, rating, comment, tags, created_at, updated_at"
    )
    .bind(owner_id)
    .bind(&dto.osm_type)
    .bind(dto.osm_id)
    .bind(&dto.place_name)
    .bind(dto.rating)
    .bind(&dto.comment)
    .bind(&tags)
    .fetch_one(db)
    .await?;

    row_to_review(&row).map_err(MapsError::Database)
}

pub async fn delete_review(db: &sqlx::PgPool, id: Uuid, owner_id: Uuid) -> Result<()> {
    let r = sqlx::query("DELETE FROM maps.reviews WHERE id = $1 AND owner_id = $2")
        .bind(id)
        .bind(owner_id)
        .execute(db)
        .await?;
    if r.rows_affected() == 0 {
        return Err(MapsError::NotFound(format!("Review {id}")));
    }
    Ok(())
}
