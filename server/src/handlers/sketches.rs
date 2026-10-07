//! Croquis (« sketches ») — calques dessinés par l'utilisateur : résultats de
//! mesure, épingles, lignes, polygones, cercles, annotations. Stockés sous forme
//! de FeatureCollection GeoJSON. Partage en lecture seule via un jeton opaque.

use axum::{
    extract::{Extension, Path, State},
    Json,
};
use chrono::{DateTime, Utc};
use kubuno_db::{params, DbPool};
use serde::Deserialize;
use serde_json::{json, Value};
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

/// A full sketch row. `data` decodes as `serde_json::Value` on the three engines
/// (JSONB / JSON / TEXT).
#[derive(Debug, sqlx::FromRow)]
struct SketchRow {
    id:          Uuid,
    name:        String,
    data:        Value,
    is_public:   bool,
    share_token: Option<String>,
    created_at:  DateTime<Utc>,
    updated_at:  DateTime<Utc>,
}

/// The public read surface: only the name and the drawing.
#[derive(Debug, sqlx::FromRow)]
struct PublicSketch {
    name: String,
    data: Value,
}

const SKETCH_COLS: &str = "id, name, data, is_public, share_token, created_at, updated_at";

/// Nombre de features dans une FeatureCollection (pour la liste). Tolérant.
fn feature_count(data: &Value) -> usize {
    data.get("features").and_then(|f| f.as_array()).map(|a| a.len()).unwrap_or(0)
}

async fn fetch_sketch(db: &DbPool, id: Uuid, owner_id: Uuid) -> Result<SketchRow> {
    db.fetch_optional_as::<SketchRow>(
        &format!("SELECT {SKETCH_COLS} FROM maps.sketches WHERE id = $1 AND owner_id = $2"),
        params![id, owner_id],
    )
    .await?
    .ok_or_else(|| MapsError::NotFound(format!("Croquis {id}")))
}

pub async fn list(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
) -> Result<Json<Value>> {
    let rows: Vec<SketchRow> = state
        .db
        .fetch_all_as(
            &format!(
                "SELECT {SKETCH_COLS} FROM maps.sketches
                 WHERE owner_id = $1 ORDER BY updated_at DESC LIMIT 100"
            ),
            params![user.id],
        )
        .await?;

    let sketches: Vec<Value> = rows
        .iter()
        .map(|row| {
            json!({
                "id":            row.id,
                "name":          row.name,
                "feature_count": feature_count(&row.data),
                "is_public":     row.is_public,
                "share_token":   row.share_token,
                "updated_at":    row.updated_at,
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
    let row = fetch_sketch(&state.db, id, user.id).await?;
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

    // Key generated in Rust, then the row is read back by it (no RETURNING).
    let id = kubuno_db::new_id();
    state
        .db
        .execute(
            "INSERT INTO maps.sketches (id, owner_id, name, data) VALUES ($1, $2, $3, $4)",
            params![id, user.id, &name, data],
        )
        .await?;

    let row = fetch_sketch(&state.db, id, user.id).await?;
    Ok(Json(sketch_json(&row)))
}

pub async fn update(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
    Path(id): Path<Uuid>,
    Json(dto): Json<UpdateSketchDto>,
) -> Result<Json<Value>> {
    // COALESCE: only the supplied fields change. Placeholders are numbered in the
    // order they appear in the text (kubuno-db requires 1..n, once each), and
    // NOW() is bound from Rust.
    let name = dto.name.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    // A missing row (wrong id or owner) is NotFound. `rows_affected` is not used
    // to decide that — a no-op COALESCE update reports 0 on MySQL — so the row is
    // read back instead (below).
    state
        .db
        .execute(
            "UPDATE maps.sketches
                SET name = COALESCE($1, name),
                    data = COALESCE($2, data),
                    updated_at = $3
              WHERE id = $4 AND owner_id = $5",
            params![name, dto.data.clone(), Utc::now(), id, user.id],
        )
        .await?;

    let row = fetch_sketch(&state.db, id, user.id).await?;
    Ok(Json(sketch_json(&row)))
}

pub async fn delete(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>> {
    let affected = state
        .db
        .execute(
            "DELETE FROM maps.sketches WHERE id = $1 AND owner_id = $2",
            params![id, user.id],
        )
        .await?;
    if affected == 0 {
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
    // Publishing a sketch hands out a URL that resolves WITHOUT a session, so the
    // instance policy is checked before a new token is minted. Un-sharing stays
    // allowed whatever the policy: tightening the rules must never trap a user
    // with a link they can no longer retract.
    if dto.public && !state.instance().sketch_sharing.allows_new_link() {
        return Err(MapsError::Forbidden);
    }

    let token: Option<String> = if dto.public {
        Some(Uuid::new_v4().simple().to_string())
    } else {
        None
    };

    // is_public is used twice; kubuno-db forbids reusing a placeholder, so the
    // value is bound twice under numbers in text order. NOW() is bound.
    state
        .db
        .execute(
            "UPDATE maps.sketches
                SET is_public = $1,
                    -- keep an existing token if already public, otherwise (re)generate one
                    share_token = CASE WHEN $2 THEN COALESCE(share_token, $3) ELSE NULL END,
                    updated_at = $4
              WHERE id = $5 AND owner_id = $6",
            params![dto.public, dto.public, token, Utc::now(), id, user.id],
        )
        .await?;

    let row = fetch_sketch(&state.db, id, user.id).await?;
    Ok(Json(sketch_json(&row)))
}

/// Lecture publique d'un croquis partagé (pas d'authentification). Ne renvoie que
/// le nom et la donnée ; ignore les croquis non publics.
pub async fn get_public(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Result<Json<Value>> {
    // The one unauthenticated read surface of this module. When the policy
    // revokes existing links, answer exactly as if the token were unknown —
    // telling an anonymous caller that the sketch exists but is withheld would
    // leak the existence of the resource.
    if !state.instance().sketch_sharing.allows_existing_link() {
        return Err(MapsError::NotFound("Croquis partagé".into()));
    }

    let row = state
        .db
        .fetch_optional_as::<PublicSketch>(
            "SELECT name, data FROM maps.sketches WHERE share_token = $1 AND is_public = TRUE",
            params![&token],
        )
        .await?
        .ok_or_else(|| MapsError::NotFound("Croquis partagé".into()))?;

    Ok(Json(json!({
        "name": row.name,
        "data": row.data,
    })))
}

/// Sérialise une ligne complète de croquis en JSON.
fn sketch_json(row: &SketchRow) -> Value {
    json!({
        "id":          row.id,
        "name":        row.name,
        "data":        row.data,
        "is_public":   row.is_public,
        "share_token": row.share_token,
        "created_at":  row.created_at,
        "updated_at":  row.updated_at,
    })
}
