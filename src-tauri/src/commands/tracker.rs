use crate::error::AppError;
use serde_json::Value;

/// Classifies a tracker URL's protocol to determine probing strategy.
///
/// - `"probeable"` — HTTP/HTTPS trackers that can be checked with HEAD requests
/// - `"unknown"` — UDP/WSS trackers that cannot be probed from HTTP
fn classify_tracker_protocol(url: &str) -> &'static str {
    if url.starts_with("udp://") || url.starts_with("wss://") {
        "unknown"
    } else {
        "probeable"
    }
}

/// Probes a list of tracker URLs for reachability via HTTP HEAD requests.
/// UDP and WSS trackers cannot be probed from HTTP and are marked `"unknown"`.
/// Returns a JSON map of `{ url: "online" | "offline" | "unknown" }`.
#[tauri::command]
pub async fn probe_trackers(urls: Vec<String>) -> Result<Value, AppError> {
    use std::collections::HashMap;
    log::debug!("tracker:probe urls={}", urls.len());

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .danger_accept_invalid_certs(true)
        .redirect(reqwest::redirect::Policy::limited(3))
        .build()
        .map_err(|e| AppError::Io(e.to_string()))?;

    let mut results: HashMap<String, String> = HashMap::new();

    for url in &urls {
        if classify_tracker_protocol(url) == "unknown" {
            results.insert(url.clone(), "unknown".to_string());
            continue;
        }
        let status = match client.head(url).send().await {
            Ok(_) => "online",
            Err(_) => "offline",
        };
        results.insert(url.clone(), status.to_string());
    }

    serde_json::to_value(results).map_err(|e| AppError::Io(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_probe_classifies_udp_as_unknown() {
        let urls = vec!["udp://tracker.example.com:6969".to_string()];
        let rt = tokio::runtime::Runtime::new().expect("create tokio runtime");
        let result = rt
            .block_on(probe_trackers(urls))
            .expect("probe_trackers returned Err");
        let map = result.as_object().expect("result is not a JSON object");
        assert_eq!(
            map.get("udp://tracker.example.com:6969")
                .expect("UDP tracker key missing")
                .as_str()
                .expect("value is not a string"),
            "unknown"
        );
    }

    #[test]
    fn test_probe_classifies_wss_as_unknown() {
        let urls = vec!["wss://tracker.example.com/announce".to_string()];
        let rt = tokio::runtime::Runtime::new().expect("create tokio runtime");
        let result = rt
            .block_on(probe_trackers(urls))
            .expect("probe_trackers returned Err");
        let map = result.as_object().expect("result is not a JSON object");
        assert_eq!(
            map.get("wss://tracker.example.com/announce")
                .expect("WSS tracker key missing")
                .as_str()
                .expect("value is not a string"),
            "unknown"
        );
    }

    #[test]
    fn test_probe_empty_list_returns_empty() {
        let urls: Vec<String> = vec![];
        let rt = tokio::runtime::Runtime::new().expect("create tokio runtime");
        let result = rt
            .block_on(probe_trackers(urls))
            .expect("probe_trackers returned Err");
        let map = result.as_object().expect("result is not a JSON object");
        assert!(map.is_empty());
    }

    #[test]
    fn test_probe_unreachable_http_returns_offline() {
        // Use an invalid host that will fail to connect within the timeout
        let urls = vec!["http://192.0.2.1:1/announce".to_string()];
        let rt = tokio::runtime::Runtime::new().expect("create tokio runtime");
        let result = rt
            .block_on(probe_trackers(urls))
            .expect("probe_trackers returned Err");
        let map = result.as_object().expect("result is not a JSON object");
        assert_eq!(
            map.get("http://192.0.2.1:1/announce")
                .expect("HTTP tracker key missing")
                .as_str()
                .expect("value is not a string"),
            "offline"
        );
    }

    // ── classify_tracker_protocol ────────────────────────────────────

    #[test]
    fn classify_http_as_probeable() {
        assert_eq!(
            classify_tracker_protocol("http://tracker.example.com:6969/announce"),
            "probeable"
        );
    }

    #[test]
    fn classify_https_as_probeable() {
        assert_eq!(
            classify_tracker_protocol("https://tracker.example.com/announce"),
            "probeable"
        );
    }

    #[test]
    fn classify_udp_as_unknown() {
        assert_eq!(
            classify_tracker_protocol("udp://tracker.example.com:6969"),
            "unknown"
        );
    }

    #[test]
    fn classify_wss_as_unknown() {
        assert_eq!(
            classify_tracker_protocol("wss://tracker.example.com/announce"),
            "unknown"
        );
    }

    #[test]
    fn classify_empty_url_as_probeable() {
        // Empty/malformed URLs are not udp/wss, so they fall through to
        // HTTP probing which will fail gracefully with "offline"
        assert_eq!(classify_tracker_protocol(""), "probeable");
    }

    #[test]
    fn classify_magnet_as_probeable() {
        // Non-tracker schemes fall through to HTTP probing attempt
        assert_eq!(
            classify_tracker_protocol("magnet:?xt=urn:btih:abc"),
            "probeable"
        );
    }
}
