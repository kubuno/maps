use axum::{
    extract::{Extension, Path, Query, State},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{
    errors::{MapsError, Result},
    middleware::MapsUser,
    models::place::{CreateCollectionDto, CreatePlaceDto, CreateReviewDto},
    services::place_service,
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub collection_id: Option<Uuid>,
}

// ── Saved places ─────────────────────────────────────────────────────────────

pub async fn list(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
    Query(q): Query<ListQuery>,
) -> Result<Json<Value>> {
    let places: Vec<crate::models::place::SavedPlace> =
        place_service::list_places(&state.db, user.id, q.collection_id).await?;
    Ok(Json(json!({ "places": places })))
}

pub async fn create(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
    Json(dto): Json<CreatePlaceDto>,
) -> Result<Json<Value>> {
    if dto.name.trim().is_empty() {
        return Err(MapsError::Validation("Le nom est requis".into()));
    }
    let place: crate::models::place::SavedPlace =
        place_service::create_place(&state.db, user.id, &dto).await?;
    Ok(Json(json!({ "place": place })))
}

pub async fn get(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>> {
    let place: crate::models::place::SavedPlace =
        place_service::get_place(&state.db, id, user.id).await?;
    Ok(Json(json!({ "place": place })))
}

pub async fn delete(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>> {
    place_service::delete_place(&state.db, id, user.id).await?;
    Ok(Json(json!({ "deleted": true })))
}

// ── Collections ───────────────────────────────────────────────────────────────

pub async fn list_collections(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
) -> Result<Json<Value>> {
    let collections: Vec<crate::models::place::PlaceCollection> =
        place_service::list_collections(&state.db, user.id).await?;
    Ok(Json(json!({ "collections": collections })))
}

pub async fn create_collection(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
    Json(dto): Json<CreateCollectionDto>,
) -> Result<Json<Value>> {
    if dto.name.trim().is_empty() {
        return Err(MapsError::Validation("Le nom est requis".into()));
    }
    let col: crate::models::place::PlaceCollection =
        place_service::create_collection(&state.db, user.id, &dto).await?;
    Ok(Json(json!({ "collection": col })))
}

pub async fn get_collection(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>> {
    let col: crate::models::place::PlaceCollection =
        place_service::get_collection(&state.db, id, user.id).await?;
    let places: Vec<crate::models::place::SavedPlace> =
        place_service::list_places(&state.db, user.id, Some(id)).await?;
    Ok(Json(json!({ "collection": col, "places": places })))
}

pub async fn delete_collection(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>> {
    place_service::delete_collection(&state.db, id, user.id).await?;
    Ok(Json(json!({ "deleted": true })))
}

// ── Reviews ───────────────────────────────────────────────────────────────────

pub async fn list_reviews(
    State(state): State<AppState>,
    Extension(_user): Extension<MapsUser>,
    Path((osm_type, osm_id)): Path<(String, i64)>,
) -> Result<Json<Value>> {
    let reviews: Vec<crate::models::place::UserReview> =
        place_service::list_reviews_for_place(&state.db, &osm_type, osm_id).await?;
    Ok(Json(json!({ "reviews": reviews })))
}

pub async fn create_review(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
    Json(dto): Json<CreateReviewDto>,
) -> Result<Json<Value>> {
    if !(1..=5).contains(&dto.rating) {
        return Err(MapsError::Validation("La note doit être entre 1 et 5".into()));
    }
    let review: crate::models::place::UserReview =
        place_service::create_review(&state.db, user.id, &dto).await?;
    Ok(Json(json!({ "review": review })))
}

pub async fn delete_review(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>> {
    place_service::delete_review(&state.db, id, user.id).await?;
    Ok(Json(json!({ "deleted": true })))
}
