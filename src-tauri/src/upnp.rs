//! UPnP/IGD port mapping manager.
//!
//! Mirrors the legacy Motrix `UPnPManager.js` + `Application.js` UPnP lifecycle:
//! discover the IGD gateway, map BT listen and DHT listen ports, periodically
//! renew the leases, and unmap on shutdown.  The underlying protocol work is
//! delegated to the `igd-next` crate (UPnP IGD over SSDP).

use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4, UdpSocket};
use std::sync::Mutex;
use std::time::Duration;

use igd_next::aio::tokio::Tokio;
use igd_next::aio::Gateway;
use igd_next::PortMappingProtocol;
use igd_next::SearchOptions;
use tokio::task::JoinHandle;

/// Lease duration requested from the gateway (seconds).
/// Most consumer routers cap this at 3600; we request 3600 and renew at half.
const LEASE_DURATION_SECS: u32 = 3600;

/// How often the background task re-adds the mapping to keep it alive.
const RENEWAL_INTERVAL: Duration = Duration::from_secs(1800);

/// Description string embedded in the router's port mapping table.
const MAPPING_DESC: &str = "Motrix Next";

// ─── Public State ────────────────────────────────────────────────────

/// Managed Tauri state that tracks active UPnP mappings and the renewal task.
pub struct UpnpState {
    inner: Mutex<Inner>,
}

struct Inner {
    mapped_ports: Vec<MappedPort>,
    renewal_handle: Option<JoinHandle<()>>,
}

#[derive(Clone, Debug)]
struct MappedPort {
    internal: u16,
    protocol: PortMappingProtocol,
}

impl UpnpState {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(Inner {
                mapped_ports: Vec::new(),
                renewal_handle: None,
            }),
        }
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────

/// Detect the machine's LAN IPv4 address by briefly opening a UDP socket
/// towards the gateway.  This is the standard cross-platform trick to let
/// the OS routing table tell us which interface would be used.
fn detect_local_ip(gateway_addr: &SocketAddr) -> Ipv4Addr {
    let target = format!("{}:80", gateway_addr.ip());
    UdpSocket::bind("0.0.0.0:0")
        .and_then(|sock| {
            sock.connect(&target)?;
            sock.local_addr()
        })
        .ok()
        .and_then(|a| match a.ip() {
            std::net::IpAddr::V4(ip) => Some(ip),
            _ => None,
        })
        .unwrap_or(Ipv4Addr::UNSPECIFIED)
}

/// Discover the IGD gateway on the local network.
async fn discover_gateway() -> Result<Gateway<Tokio>, String> {
    igd_next::aio::tokio::search_gateway(SearchOptions::default())
        .await
        .map_err(|e| format!("UPnP gateway discovery failed: {e}"))
}

/// Map a single port on the gateway.
async fn map_port(
    gw: &Gateway<Tokio>,
    local_ip: Ipv4Addr,
    port: u16,
    proto: PortMappingProtocol,
) -> Result<(), String> {
    let local = SocketAddr::V4(SocketAddrV4::new(local_ip, port));
    gw.add_port(proto, port, local, LEASE_DURATION_SECS, MAPPING_DESC)
        .await
        .map_err(|e| format!("UPnP map port {port} ({proto:?}) failed: {e}"))
}

/// Unmap a single port on the gateway.
async fn unmap_port(
    gw: &Gateway<Tokio>,
    port: u16,
    proto: PortMappingProtocol,
) -> Result<(), String> {
    gw.remove_port(proto, port)
        .await
        .map_err(|e| format!("UPnP unmap port {port} ({proto:?}) failed: {e}"))
}

// ─── Lifecycle ───────────────────────────────────────────────────────

/// Start mapping the BT and DHT ports.  Idempotent: stops any existing
/// mapping first.
pub async fn start_mapping(
    state: &UpnpState,
    bt_port: u16,
    dht_port: u16,
) -> Result<serde_json::Value, String> {
    // Stop any existing mapping first (idempotent).
    stop_mapping(state).await;

    let gw = discover_gateway().await?;
    let local_ip = detect_local_ip(&gw.addr);

    // Map BT listen port (TCP) and DHT listen port (UDP).
    // Use allSettled-style: report per-port results without short-circuiting.
    let bt_result = map_port(&gw, local_ip, bt_port, PortMappingProtocol::TCP).await;
    let dht_result = map_port(&gw, local_ip, dht_port, PortMappingProtocol::UDP).await;

    let mut mapped = Vec::new();
    let mut errors: Vec<String> = Vec::new();

    match bt_result {
        Ok(()) => mapped.push(MappedPort {
            internal: bt_port,
            protocol: PortMappingProtocol::TCP,
        }),
        Err(e) => {
            log::warn!("upnp:map-failed port={bt_port} proto=TCP err={e}");
            errors.push(e);
        }
    }

    match dht_result {
        Ok(()) => mapped.push(MappedPort {
            internal: dht_port,
            protocol: PortMappingProtocol::UDP,
        }),
        Err(e) => {
            log::warn!("upnp:map-failed port={dht_port} proto=UDP err={e}");
            errors.push(e);
        }
    }

    if mapped.is_empty() {
        return Err(errors.join("; "));
    }

    log::info!(
        "upnp:mapped ports={:?}",
        mapped.iter().map(|p| p.internal).collect::<Vec<_>>()
    );

    // Spawn the renewal background task.
    let renewal_ports = mapped.clone();
    let renewal_handle = tokio::spawn(async move {
        renewal_loop(renewal_ports).await;
    });

    // Store state.
    if let Ok(mut inner) = state.inner.lock() {
        inner.mapped_ports = mapped.clone();
        inner.renewal_handle = Some(renewal_handle);
    }

    // Retrieve the external IP for informational purposes.
    let external_ip = gw
        .get_external_ip()
        .await
        .map(|ip| ip.to_string())
        .unwrap_or_default();

    Ok(serde_json::json!({
        "success": true,
        "externalIp": external_ip,
        "mappedPorts": mapped.iter().map(|p| {
            serde_json::json!({
                "port": p.internal,
                "protocol": format!("{:?}", p.protocol),
            })
        }).collect::<Vec<_>>(),
        "errors": errors,
    }))
}

/// Stop all active mappings and cancel the renewal task.
pub async fn stop_mapping(state: &UpnpState) {
    let (ports, handle) = {
        let mut inner = match state.inner.lock() {
            Ok(g) => g,
            Err(_) => return,
        };
        let ports = std::mem::take(&mut inner.mapped_ports);
        let handle = inner.renewal_handle.take();
        (ports, handle)
    };

    // Cancel the renewal task first.
    if let Some(h) = handle {
        h.abort();
    }

    if ports.is_empty() {
        return;
    }

    // Best-effort unmap — don't fail if the gateway is unreachable.
    if let Ok(gw) = discover_gateway().await {
        for port in &ports {
            let _ = unmap_port(&gw, port.internal, port.protocol).await;
        }
        log::info!(
            "upnp:unmapped ports={:?}",
            ports.iter().map(|p| p.internal).collect::<Vec<_>>()
        );
    }
}

/// Retrieve the current UPnP mapping status.
pub fn get_status(state: &UpnpState) -> serde_json::Value {
    let inner = match state.inner.lock() {
        Ok(g) => g,
        Err(_) => {
            return serde_json::json!({ "active": false, "ports": [] });
        }
    };

    let ports: Vec<_> = inner
        .mapped_ports
        .iter()
        .map(|p| {
            serde_json::json!({
                "port": p.internal,
                "protocol": format!("{:?}", p.protocol),
            })
        })
        .collect();

    serde_json::json!({
        "active": !inner.mapped_ports.is_empty(),
        "ports": ports,
    })
}

// ─── Renewal Loop ────────────────────────────────────────────────────

/// Periodically re-add the port mappings to keep the UPnP lease alive.
/// Runs until cancelled by `stop_mapping`.
async fn renewal_loop(ports: Vec<MappedPort>) {
    loop {
        tokio::time::sleep(RENEWAL_INTERVAL).await;

        let gw = match discover_gateway().await {
            Ok(g) => g,
            Err(e) => {
                log::warn!("renewal: gateway discovery failed: {e}");
                continue;
            }
        };

        let local_ip = detect_local_ip(&gw.addr);

        for port in &ports {
            if let Err(e) = map_port(&gw, local_ip, port.internal, port.protocol).await {
                log::warn!(
                    "[UPnP] renewal: failed to renew port {}: {e}",
                    port.internal
                );
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_state_has_no_mapped_ports() {
        let state = UpnpState::new();
        let inner = state.inner.lock().expect("lock not poisoned");
        assert!(inner.mapped_ports.is_empty());
        assert!(inner.renewal_handle.is_none());
    }

    #[test]
    fn get_status_empty_state_reports_inactive() {
        let state = UpnpState::new();
        let status = get_status(&state);
        assert_eq!(status["active"], false);
        assert_eq!(status["ports"].as_array().expect("ports is array").len(), 0);
    }

    #[test]
    fn get_status_with_ports_reports_active() {
        let state = UpnpState::new();
        {
            let mut inner = state.inner.lock().expect("lock not poisoned");
            inner.mapped_ports.push(MappedPort {
                internal: 6881,
                protocol: PortMappingProtocol::TCP,
            });
            inner.mapped_ports.push(MappedPort {
                internal: 6882,
                protocol: PortMappingProtocol::UDP,
            });
        }
        let status = get_status(&state);
        assert_eq!(status["active"], true);
        let ports = status["ports"].as_array().expect("ports is array");
        assert_eq!(ports.len(), 2);
        assert_eq!(ports[0]["port"], 6881);
        assert_eq!(ports[0]["protocol"], "TCP");
        assert_eq!(ports[1]["port"], 6882);
        assert_eq!(ports[1]["protocol"], "UDP");
    }

    #[test]
    fn constants_are_sane() {
        assert_eq!(LEASE_DURATION_SECS, 3600);
        assert_eq!(RENEWAL_INTERVAL, Duration::from_secs(1800));
        assert_eq!(MAPPING_DESC, "Motrix Next");
        // Renewal interval must be less than lease duration
        assert!(RENEWAL_INTERVAL.as_secs() < u64::from(LEASE_DURATION_SECS));
    }
}
