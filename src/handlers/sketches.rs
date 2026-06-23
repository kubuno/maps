//! Croquis (« sketches ») — calques dessinés par l'utilisateur : résultats de
//! mesure, épingles, lignes, polygones, cercles, annotations. Stockés sous forme
//! de FeatureCollection GeoJSON. Partage en lecture seule via un jeton opaque.

use axum::{
    extract::{Extension, Path, State},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::Row;
use uuid::Uuid;

use crate::{
    errors::{MapsError, Result},
    middleware::MapsUser,
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct CreateSketchDto {
    pub name: Option<String>,
    pub data: Option<Value>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSketchDto {
    pub name: Option<String>,
    pub data: Option<Value>,
}

#[derive(Debug, Deserialize)]
pub struct ShareDto {
    pub public: bool,
}

/// Nombre de features dans une FeatureCollection (pour la liste). Tolérant.
fn feature_count(data: &Value) -> usize {
    data.get("features").and_then(|f| f.as_array()).map(|a| a.len()).unwrap_or(0)
}

pub async fn list(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
) -> Result<Json<Value>> {
    let rows = sqlx::query(
        "SELECT id, name, data, is_public, share_token, updated_at
         FROM maps.sketches WHERE owner_id = $1 ORDER BY updated_at DESC LIMIT 100",
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await?;

    let sketches: Vec<Value> = rows
        .iter()
        .map(|row| {
            let data: Value = row.try_get("data").unwrap_or_else(|_| json!({}));
            json!({
                "id":            row.try_get::<Uuid, _>("id").unwrap_or_default(),
                "name":          row.try_get::<String, _>("name").unwrap_or_default(),
                "feature_count": feature_count(&data),
                "is_public":     row.try_get::<bool, _>("is_public").unwrap_or(false),
                "share_token":   row.try_get::<Option<String>, _>("share_token").unwrap_or(None),
                "updated_at":    row.try_get::<chrono::DateTime<chrono::Utc>, _>("updated_at").unwrap_or_default(),
            })
        })
        .collect();

    Ok(Json(json!({ "sketches": sketches })))
}

pub async fn get(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>> {
    let row = sqlx::query(
        "SELECT id, name, data, is_public, share_token, created_at, updated_at
         FROM maps.sketches WHERE id = $1 AND owner_id = $2",
    )
    .bind(id)
    .bind(user.id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| MapsError::NotFound(format!("Croquis {id}")))?;

    Ok(Json(sketch_json(&row)))
}

pub async fn create(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
    Json(dto): Json<CreateSketchDto>,
) -> Result<Json<Value>> {
    let name = dto
        .name
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "Croquis".to_string());
    let data = dto
        .data
        .unwrap_or_else(|| json!({ "type": "FeatureCollection", "features": [] }));

    let row = sqlx::query(
        "INSERT INTO maps.sketches (owner_id, name, data)
         VALUES ($1, $2, $3)
         RETURNING id, name, data, is_public, share_token, created_at, updated_at",
    )
    .bind(user.id)
    .bind(&name)
    .bind(&data)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(sketch_json(&row)))
}

pub async fn update(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
    Path(id): Path<Uuid>,
    Json(dto): Json<UpdateSketchDto>,
) -> Result<Json<Value>> {
    // COALESCE : seuls les champs fournis sont modifiés.
    let row = sqlx::query(
        "UPDATE maps.sketches
            SET name = COALESCE($3, name),
                data = COALESCE($4, data),
                updated_at = NOW()
          WHERE id = $1 AND owner_id = $2
          RETURNING id, name, data, is_public, share_token, created_at, updated_at",
    )
    .bind(id)
    .bind(user.id)
    .bind(dto.name.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()))
    .bind(&dto.data)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| MapsError::NotFound(format!("Croquis {id}")))?;

    Ok(Json(sketch_json(&row)))
}

pub async fn delete(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>> {
    let r = sqlx::query("DELETE FROM maps.sketches WHERE id = $1 AND owner_id = $2")
        .bind(id)
        .bind(user.id)
        .execute(&state.db)
        .await?;
    if r.rows_affected() == 0 {
        return Err(MapsError::NotFound(format!("Croquis {id}")));
    }
    Ok(Json(json!({ "deleted": true })))
}

/// Active/désactive le partage public. À l'activation, génère un jeton opaque ;
/// à la désactivation, le révoque.
pub async fn share(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
    Path(id): Path<Uuid>,
    Json(dto): Json<ShareDto>,
) -> Result<Json<Value>> {
    let token: Option<String> = if dto.public {
        Some(Uuid::new_v4().simple().to_string())
    } else {
        None
    };

    let row = sqlx::query(
        "UPDATE maps.sketches
            SET is_public = $3,
                -- conserve un jeton existant si déjà public, sinon en (re)génère un
                share_token = CASE WHEN $3 THEN COALESCE(share_token, $4) ELSE NULL END,
                updated_at = NOW()
          WHERE id = $1 AND owner_id = $2
          RETURNING id, name, data, is_public, share_token, created_at, updated_at",
    )
    .bind(id)
    .bind(user.id)
    .bind(dto.public)
    .bind(&token)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| MapsError::NotFound(format!("Croquis {id}")))?;

    Ok(Json(sketch_json(&row)))
}

/// Lecture publique d'un croquis partagé (pas d'authentification). Ne renvoie que
/// le nom et la donnée ; ignore les croquis non publics.
pub async fn get_public(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Result<Json<Value>> {
    let row = sqlx::query(
        "SELECT name, data FROM maps.sketches WHERE share_token = $1 AND is_public = TRUE",
    )
    .bind(&token)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| MapsError::NotFound("Croquis partagé".into()))?;

    let data: Value = row.try_get("data").unwrap_or_else(|_| json!({}));
    Ok(Json(json!({
        "name": row.try_get::<String, _>("name").unwrap_or_default(),
        "data": data,
    })))
}

/// Sérialise une ligne complète de croquis en JSON.
fn sketch_json(row: &sqlx::postgres::PgRow) -> Value {
    let data: Value = row.try_get("data").unwrap_or_else(|_| json!({}));
    json!({
        "id":          row.try_get::<Uuid, _>("id").unwrap_or_default(),
        "name":        row.try_get::<String, _>("name").unwrap_or_default(),
        "data":        data,
        "is_public":   row.try_get::<bool, _>("is_public").unwrap_or(false),
        "share_token": row.try_get::<Option<String>, _>("share_token").unwrap_or(None),
        "created_at":  row.try_get::<chrono::DateTime<chrono::Utc>, _>("created_at").unwrap_or_default(),
        "updated_at":  row.try_get::<chrono::DateTime<chrono::Utc>, _>("updated_at").unwrap_or_default(),
    })
}
