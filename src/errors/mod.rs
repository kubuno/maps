use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum MapsError {
    #[error("Non authentifié")]
    Unauthorized,

    #[error("Accès refusé")]
    Forbidden,

    #[error("Ressource introuvable: {0}")]
    NotFound(String),

    #[error("Données invalides: {0}")]
    Validation(String),

    #[error("Calcul d'itinéraire impossible: {0}")]
    RoutingFailed(String),

    #[error("Service Nominatim indisponible")]
    NominatimUnavailable,

    #[error("Service OSRM indisponible")]
    OsrmUnavailable,

    #[error("Service Overpass indisponible")]
    OverpassUnavailable,

    #[error("Fichier GPX invalide: {0}")]
    InvalidGpx(String),

    #[error("Fichier trop volumineux")]
    FileTooLarge,

    #[error("Erreur de stockage: {0}")]
    Storage(#[from] kubuno_storage::StorageError),

    #[error("Erreur base de données")]
    Database(#[from] sqlx::Error),

    #[error("Erreur interne")]
    Internal(#[from] anyhow::Error),
}

impl IntoResponse for MapsError {
    fn into_response(self) -> Response {
        let (status, code, message) = match &self {
            MapsError::Unauthorized           => (StatusCode::UNAUTHORIZED,         "UNAUTHORIZED",        self.to_string()),
            MapsError::Forbidden              => (StatusCode::FORBIDDEN,            "FORBIDDEN",           self.to_string()),
            MapsError::NotFound(_)            => (StatusCode::NOT_FOUND,            "NOT_FOUND",           self.to_string()),
            MapsError::Validation(_)          => (StatusCode::UNPROCESSABLE_ENTITY, "VALIDATION",          self.to_string()),
            MapsError::RoutingFailed(_)       => (StatusCode::BAD_GATEWAY,          "ROUTING_FAILED",      self.to_string()),
            MapsError::NominatimUnavailable   => (StatusCode::BAD_GATEWAY,          "NOMINATIM_ERROR",     self.to_string()),
            MapsError::OsrmUnavailable        => (StatusCode::BAD_GATEWAY,          "OSRM_ERROR",          self.to_string()),
            MapsError::OverpassUnavailable    => (StatusCode::BAD_GATEWAY,          "OVERPASS_ERROR",      self.to_string()),
            MapsError::InvalidGpx(_)          => (StatusCode::BAD_REQUEST,          "INVALID_GPX",         self.to_string()),
            MapsError::FileTooLarge           => (StatusCode::PAYLOAD_TOO_LARGE,    "FILE_TOO_LARGE",      self.to_string()),
            MapsError::Storage(e) => {
                tracing::error!(error = %e, "Storage error");
                (StatusCode::INTERNAL_SERVER_ERROR, "STORAGE_ERROR", "Erreur de stockage".to_string())
            }
            MapsError::Database(e) => {
                tracing::error!(error = %e, "Database error");
                (StatusCode::INTERNAL_SERVER_ERROR, "DATABASE_ERROR", "Erreur base de données".to_string())
            }
            MapsError::Internal(e) => {
                tracing::error!(error = %e, "Internal error");
                (StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "Erreur interne".to_string())
            }
        };

        (status, Json(json!({ "error": code, "message": message }))).into_response()
    }
}

pub type Result<T> = std::result::Result<T, MapsError>;
