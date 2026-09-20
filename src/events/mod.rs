use serde::Deserialize;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum MapEvent {
    UserDeleted    { user_id: Uuid },
    ContactUpdated { contact_id: Uuid, user_id: Uuid, module_id: String },
}

pub async fn handle(event: MapEvent, db: &kubuno_db::DbPool) {
    use kubuno_db::params;
    match event {
        MapEvent::UserDeleted { user_id } => {
            let _ = db.execute("DELETE FROM maps.saved_places   WHERE owner_id = $1", params![user_id]).await;
            let _ = db.execute("DELETE FROM maps.collections    WHERE owner_id = $1", params![user_id]).await;
            let _ = db.execute("DELETE FROM maps.reviews        WHERE owner_id = $1", params![user_id]).await;
            let _ = db.execute("DELETE FROM maps.saved_routes   WHERE owner_id = $1", params![user_id]).await;
            let _ = db.execute("DELETE FROM maps.gpx_traces     WHERE owner_id = $1", params![user_id]).await;
            let _ = db.execute("DELETE FROM maps.search_history WHERE owner_id = $1", params![user_id]).await;
            tracing::info!(%user_id, "Maps: données supprimées pour l'utilisateur");
        }
        MapEvent::ContactUpdated { contact_id, user_id, .. } => {
            tracing::debug!(%contact_id, %user_id, "Maps: ContactUpdated ignoré");
        }
    }
}
