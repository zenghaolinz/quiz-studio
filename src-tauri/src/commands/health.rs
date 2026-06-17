use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthStatus {
    status: &'static str,
    version: &'static str,
}

#[tauri::command]
pub fn health_check() -> HealthStatus {
    HealthStatus {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
    }
}
