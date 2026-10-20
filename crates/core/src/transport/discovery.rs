use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use serde::{Deserialize, Serialize};

pub const LAN_DISCOVERY_PORT: u16 = 8766;
const BEACON_MAGIC: &str = "GAMENOTE_LAN_BEACON:v1:";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DiscoveredPeer {
    pub site_id: String,
    pub device_name: String,
    pub ip: String,
    pub port: u16,
    pub endpoint_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LanBeacon {
    pub site_id: String,
    pub device_name: String,
    pub port: u16,
}

pub struct LanDiscoveryHandle {
    running: Arc<AtomicBool>,
}

impl LanDiscoveryHandle {
    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
    }
}

pub fn start_lan_discovery<F>(
    my_site_id: String,
    my_device_name: String,
    my_server_port: u16,
    is_server_enabled: bool,
    on_peer_found: F,
) -> LanDiscoveryHandle
where
    F: Fn(DiscoveredPeer) + Send + Sync + 'static,
{
    let running = Arc::new(AtomicBool::new(true));
    let on_peer_found = Arc::new(on_peer_found);

    let rt_handle = match tokio::runtime::Handle::try_current() {
        Ok(h) => h,
        Err(_) => {
            static RUNTIME: std::sync::OnceLock<tokio::runtime::Runtime> = std::sync::OnceLock::new();
            let rt = RUNTIME.get_or_init(|| {
                tokio::runtime::Builder::new_multi_thread()
                    .enable_all()
                    .thread_name("lan-discovery")
                    .build()
                    .expect("failed to create background runtime for discovery")
            });
            rt.handle().clone()
        }
    };

    // 1. Broadcaster task (only run if server is enabled and port > 0)
    if is_server_enabled && my_server_port > 0 {
        let running = running.clone();
        let my_site_id = my_site_id.clone();
        let my_device_name = my_device_name.clone();
        rt_handle.spawn(async move {
            let beacon = LanBeacon {
                site_id: my_site_id,
                device_name: my_device_name,
                port: my_server_port,
            };
            let payload = match serde_json::to_string(&beacon) {
                Ok(p) => format!("{}{}", BEACON_MAGIC, p),
                Err(e) => {
                    log::error!("Failed to serialize discovery beacon: {}", e);
                    return;
                }
            };
            let payload_bytes = payload.into_bytes();
            // General broadcast (255.255.255.255)
            let broadcast_addr: SocketAddr = format!("255.255.255.255:{}", LAN_DISCOVERY_PORT)
                .parse()
                .expect("valid broadcast socket address");

            // Subnet-directed broadcast (e.g. 192.168.1.255) to traverse home router AP boundaries
            let subnet_broadcast = (|| -> Option<SocketAddr> {
                let s = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
                s.connect("8.8.8.8:80").ok()?;
                let local = s.local_addr().ok()?;
                if let std::net::IpAddr::V4(ipv4) = local.ip() {
                    let oct = ipv4.octets();
                    let b_ip = std::net::Ipv4Addr::new(oct[0], oct[1], oct[2], 255);
                    return Some(SocketAddr::new(std::net::IpAddr::V4(b_ip), LAN_DISCOVERY_PORT));
                }
                None
            })();

            // Create outbound UDP socket with broadcast enabled
            let socket = match tokio::net::UdpSocket::bind("0.0.0.0:0").await {
                Ok(s) => {
                    let _ = s.set_broadcast(true);
                    s
                }
                Err(e) => {
                    log::warn!("Failed to bind LAN discovery broadcast socket: {}", e);
                    return;
                }
            };

            let mut iteration: u32 = 0;
            while running.load(Ordering::SeqCst) {
                let _ = socket.send_to(&payload_bytes, broadcast_addr).await;
                if let Some(sub) = subnet_broadcast {
                    let _ = socket.send_to(&payload_bytes, sub).await;
                }
                iteration = iteration.saturating_add(1);
                let sleep_ms = if iteration <= 5 { 250 } else { 1500 };
                tokio::time::sleep(Duration::from_millis(sleep_ms)).await;
            }
        });
    }

    // 2. Listener task
    {
        let running = running.clone();
        let my_site_id = my_site_id;
        rt_handle.spawn(async move {
            // Use socket2 to configure reuse_address and reuse_port
            let std_socket = (|| -> std::io::Result<std::net::UdpSocket> {
                let socket = socket2::Socket::new(
                    socket2::Domain::IPV4,
                    socket2::Type::DGRAM,
                    Some(socket2::Protocol::UDP),
                )?;
                socket.set_reuse_address(true)?;
                socket.set_broadcast(true)?;
                socket.set_nonblocking(true)?;
                let bind_addr: SocketAddr = format!("0.0.0.0:{}", LAN_DISCOVERY_PORT)
                    .parse()
                    .unwrap();
                socket.bind(&bind_addr.into())?;
                Ok(socket.into())
            })();

            let socket = match std_socket {
                Ok(s) => match tokio::net::UdpSocket::from_std(s) {
                    Ok(ts) => ts,
                    Err(e) => {
                        log::warn!("Failed to convert std UDP socket to tokio: {}", e);
                        return;
                    }
                },
                Err(e) => {
                    log::warn!("Failed to bind LAN discovery listener socket on port {}: {}", LAN_DISCOVERY_PORT, e);
                    return;
                }
            };

            let mut buf = [0u8; 2048];
            while running.load(Ordering::SeqCst) {
                match tokio::time::timeout(Duration::from_secs(1), socket.recv_from(&mut buf)).await {
                    Ok(Ok((len, src_addr))) => {
                        if let Ok(msg) = std::str::from_utf8(&buf[..len]) {
                            if let Some(json_str) = msg.strip_prefix(BEACON_MAGIC) {
                                if let Ok(beacon) = serde_json::from_str::<LanBeacon>(json_str) {
                                    // Skip beacons from ourselves
                                    if beacon.site_id == my_site_id {
                                        continue;
                                    }
                                    let ip = src_addr.ip().to_string();
                                    let peer = DiscoveredPeer {
                                        site_id: beacon.site_id,
                                        device_name: beacon.device_name,
                                        ip: ip.clone(),
                                        port: beacon.port,
                                        endpoint_url: format!("http://{}:{}", ip, beacon.port),
                                    };
                                    on_peer_found(peer);
                                }
                            }
                        }
                    }
                    Ok(Err(e)) => {
                        log::debug!("LAN discovery recv error: {}", e);
                    }
                    Err(_) => {
                        // Timeout: loop around and check running flag
                    }
                }
            }
        });
    }

    LanDiscoveryHandle { running }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_lan_discovery_beacon_format() {
        let beacon = LanBeacon {
            site_id: "0123456789abcdef0123456789abcdef".to_string(),
            device_name: "Test Tablet".to_string(),
            port: 8765,
        };
        let serialized = serde_json::to_string(&beacon).unwrap();
        assert!(serialized.contains("0123456789abcdef"));
        let deserialized: LanBeacon = serde_json::from_str(&serialized).unwrap();
        assert_eq!(deserialized.site_id, beacon.site_id);
        assert_eq!(deserialized.device_name, "Test Tablet");
        assert_eq!(deserialized.port, 8765);
    }

    #[test]
    fn test_lan_discovery_called_from_non_tokio_thread() {
        let handle = start_lan_discovery(
            "non_tokio_site".to_string(),
            "Non-Tokio Device".to_string(),
            9998,
            true,
            |_| {},
        );
        handle.stop();
    }
}
