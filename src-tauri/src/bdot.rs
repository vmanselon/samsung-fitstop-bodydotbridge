use reqwest::{header::RETRY_AFTER, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    env, fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        RwLock,
    },
    time::{Duration, Instant},
};
use tokio::sync::Mutex;

include!(concat!(env!("OUT_DIR"), "/bdot_config.rs"));

const TOKEN_URL: &str = "https://api.bdot.im/v1/oauth/token";
const API_BASE_URL: &str = "https://api.bdot.im/v1/";
const EXPIRY_MARGIN: Duration = Duration::from_secs(60);
const DEFAULT_RATE_LIMIT_BACKOFF: Duration = Duration::from_secs(30);
const DEFAULT_KIOSK_CLIENT_ID: &str = "ff31aaa2-6621-4561-a756-ffb6d50dfa7b";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BdotError {
    pub code: &'static str,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry_after_seconds: Option<u64>,
}

impl BdotError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            retry_after_seconds: None,
        }
    }

    fn rate_limited(retry_after: Duration) -> Self {
        Self {
            code: "RATE_LIMITED",
            message: "Bodydot API rate limit reached; please try again later".into(),
            retry_after_seconds: Some(retry_after.as_secs().max(1)),
        }
    }
}

#[derive(Clone)]
struct BdotConfig {
    oauth_client_id: String,
    oauth_client_secret: String,
}

#[derive(Clone)]
struct CachedToken {
    value: String,
    expires_at: Instant,
}

#[derive(Default)]
struct Cache {
    token: Option<CachedToken>,
    backoff_until: Option<Instant>,
}

pub struct BdotClient {
    config: BdotConfig,
    http: reqwest::Client,
    cache: Mutex<Cache>,
}

pub struct BdotState {
    client: Result<BdotClient, BdotError>,
    kiosk_client_id: RwLock<String>,
    kiosk_client_id_path: PathBuf,
    api_enabled: AtomicBool,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    #[serde(default = "default_expires_in")]
    expires_in: u64,
}

fn default_expires_in() -> u64 {
    3600
}

fn config_value(name: &'static str, compiled: Option<&'static str>) -> Result<String, BdotError> {
    env::var(name)
        .ok()
        .or_else(|| compiled.map(str::to_owned))
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| BdotError::new("CONFIGURATION_ERROR", format!("{name} is not configured")))
}

impl BdotState {
    pub fn from_env(kiosk_client_id_path: PathBuf) -> Self {
        let configured_kiosk_client_id = env::var("BDOT_KIOSK_CLIENT_ID")
            .ok()
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| DEFAULT_KIOSK_CLIENT_ID.to_owned());
        let kiosk_client_id = fs::read_to_string(&kiosk_client_id_path)
            .ok()
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty())
            .unwrap_or(configured_kiosk_client_id);

        Self {
            client: BdotClient::from_env(),
            kiosk_client_id: RwLock::new(kiosk_client_id),
            kiosk_client_id_path,
            api_enabled: AtomicBool::new(true),
        }
    }

    fn client(&self) -> Result<&BdotClient, BdotError> {
        self.client.as_ref().map_err(Clone::clone)
    }

    fn kiosk_client_id(&self) -> Result<String, BdotError> {
        self.kiosk_client_id
            .read()
            .map(|value| value.clone())
            .map_err(|_| {
                BdotError::new("CONFIGURATION_ERROR", "Kiosk client ID lock is unavailable")
            })
    }

    fn save_kiosk_client_id(&self, value: &str) -> Result<String, BdotError> {
        let value = value.trim();
        if value.is_empty() || value.len() > 200 || value.chars().any(char::is_control) {
            return Err(BdotError::new(
                "CONFIGURATION_ERROR",
                "Kiosk client ID must contain between 1 and 200 printable characters",
            ));
        }
        if let Some(parent) = self.kiosk_client_id_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                BdotError::new(
                    "CONFIGURATION_ERROR",
                    format!("Could not create kiosk configuration directory: {error}"),
                )
            })?;
        }
        fs::write(&self.kiosk_client_id_path, value).map_err(|error| {
            BdotError::new(
                "CONFIGURATION_ERROR",
                format!("Could not save kiosk client ID: {error}"),
            )
        })?;
        *self.kiosk_client_id.write().map_err(|_| {
            BdotError::new("CONFIGURATION_ERROR", "Kiosk client ID lock is unavailable")
        })? = value.to_owned();
        Ok(value.to_owned())
    }

    fn ensure_api_enabled(&self) -> Result<(), BdotError> {
        if self.api_enabled.load(Ordering::Relaxed) {
            Ok(())
        } else {
            Err(BdotError::new(
                "API_DISABLED",
                "Bodydot API is disabled for this session",
            ))
        }
    }
}

impl BdotClient {
    fn from_env() -> Result<Self, BdotError> {
        let config = BdotConfig {
            oauth_client_id: config_value("BDOT_CLIENT_ID", COMPILED_BDOT_CLIENT_ID)?,
            oauth_client_secret: config_value("BDOT_CLIENT_SECRET", COMPILED_BDOT_CLIENT_SECRET)?,
        };
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .build()
            .map_err(|error| {
                BdotError::new(
                    "CONFIGURATION_ERROR",
                    format!("Could not create HTTP client: {error}"),
                )
            })?;
        Ok(Self {
            config,
            http,
            cache: Mutex::new(Cache::default()),
        })
    }

    async fn ensure_not_backing_off(&self) -> Result<(), BdotError> {
        let mut cache = self.cache.lock().await;
        if let Some(until) = cache.backoff_until {
            let now = Instant::now();
            if until > now {
                return Err(BdotError::rate_limited(until.duration_since(now)));
            }
            cache.backoff_until = None;
        }
        Ok(())
    }

    async fn apply_backoff(&self, response: &reqwest::Response) -> BdotError {
        let seconds = response
            .headers()
            .get(RETRY_AFTER)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(DEFAULT_RATE_LIMIT_BACKOFF.as_secs());
        let duration = Duration::from_secs(seconds.max(1));
        self.cache.lock().await.backoff_until = Some(Instant::now() + duration);
        BdotError::rate_limited(duration)
    }

    async fn access_token(&self, force_refresh: bool) -> Result<String, BdotError> {
        self.ensure_not_backing_off().await?;
        if !force_refresh {
            let cache = self.cache.lock().await;
            if let Some(token) = &cache.token {
                if token.expires_at.saturating_duration_since(Instant::now()) > EXPIRY_MARGIN {
                    return Ok(token.value.clone());
                }
            }
        }

        let response = self
            .http
            .post(TOKEN_URL)
            .basic_auth(
                &self.config.oauth_client_id,
                Some(&self.config.oauth_client_secret),
            )
            .form(&[("grant_type", "client_credentials")])
            .send()
            .await
            .map_err(|error| {
                BdotError::new(
                    "NETWORK_ERROR",
                    format!("Could not reach Bodydot authentication service: {error}"),
                )
            })?;

        if response.status() == StatusCode::TOO_MANY_REQUESTS {
            return Err(self.apply_backoff(&response).await);
        }
        if response.status() == StatusCode::UNAUTHORIZED
            || response.status() == StatusCode::FORBIDDEN
        {
            return Err(BdotError::new(
                "AUTHENTICATION_FAILED",
                "Bodydot rejected the configured OAuth credentials",
            ));
        }
        if !response.status().is_success() {
            return Err(BdotError::new(
                "AUTHENTICATION_FAILED",
                format!("Bodydot token endpoint returned HTTP {}", response.status()),
            ));
        }

        let token: TokenResponse = response.json().await.map_err(|error| {
            BdotError::new(
                "INVALID_RESPONSE",
                format!("Bodydot token response was invalid: {error}"),
            )
        })?;
        if token.access_token.trim().is_empty() {
            return Err(BdotError::new(
                "INVALID_RESPONSE",
                "Bodydot token response did not contain an access token",
            ));
        }
        let cached = CachedToken {
            value: token.access_token.clone(),
            expires_at: Instant::now() + Duration::from_secs(token.expires_in),
        };
        self.cache.lock().await.token = Some(cached);
        Ok(token.access_token)
    }

    fn latest_url(&self, kiosk_client_id: &str) -> Result<reqwest::Url, BdotError> {
        let mut url = reqwest::Url::parse(API_BASE_URL).map_err(|error| {
            BdotError::new(
                "CONFIGURATION_ERROR",
                format!("Invalid Bodydot API URL: {error}"),
            )
        })?;
        {
            let mut segments = url.path_segments_mut().map_err(|_| {
                BdotError::new(
                    "CONFIGURATION_ERROR",
                    "Bodydot API URL cannot contain path segments",
                )
            })?;
            segments.pop_if_empty().extend([
                "clients",
                kiosk_client_id,
                "measurement-sessions",
                "latest",
            ]);
        }
        url.query_pairs_mut().append_pair("include", "scores");
        Ok(url)
    }

    async fn request_latest(
        &self,
        token: &str,
        kiosk_client_id: &str,
    ) -> Result<reqwest::Response, BdotError> {
        self.ensure_not_backing_off().await?;
        self.http
            .get(self.latest_url(kiosk_client_id)?)
            .bearer_auth(token)
            .send()
            .await
            .map_err(|error| {
                BdotError::new(
                    "NETWORK_ERROR",
                    format!("Could not reach Bodydot API: {error}"),
                )
            })
    }

    async fn latest_measurement(&self, kiosk_client_id: &str) -> Result<Value, BdotError> {
        let token = self.access_token(false).await?;
        let mut response = self.request_latest(&token, kiosk_client_id).await?;

        if response.status() == StatusCode::UNAUTHORIZED {
            self.cache.lock().await.token = None;
            let refreshed = self.access_token(true).await?;
            response = self.request_latest(&refreshed, kiosk_client_id).await?;
        }

        match response.status() {
            StatusCode::NOT_FOUND | StatusCode::NO_CONTENT => Err(BdotError::new(
                "MEASUREMENT_SESSION_NOT_FOUND",
                "Check the internet connection or kiosk Client ID",
            )),
            StatusCode::TOO_MANY_REQUESTS => Err(self.apply_backoff(&response).await),
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => Err(BdotError::new(
                "AUTHENTICATION_FAILED",
                "Bodydot rejected the access token after one refresh attempt",
            )),
            status if !status.is_success() => Err(BdotError::new(
                "BODYDOT_API_ERROR",
                format!("Bodydot measurement endpoint returned HTTP {status}"),
            )),
            _ => response.json::<Value>().await.map_err(|error| {
                BdotError::new(
                    "INVALID_RESPONSE",
                    format!("Bodydot measurement response was invalid: {error}"),
                )
            }),
        }
    }
}

#[tauri::command]
pub async fn get_latest_measurement(
    state: tauri::State<'_, BdotState>,
) -> Result<Value, BdotError> {
    state.ensure_api_enabled()?;
    let kiosk_client_id = state.kiosk_client_id()?;
    state.client()?.latest_measurement(&kiosk_client_id).await
}

#[tauri::command]
pub fn set_bdot_api_enabled(enabled: bool, state: tauri::State<'_, BdotState>) -> bool {
    state.api_enabled.store(enabled, Ordering::Relaxed);
    enabled
}

#[tauri::command]
pub fn get_bdot_api_enabled(state: tauri::State<'_, BdotState>) -> bool {
    state.api_enabled.load(Ordering::Relaxed)
}

#[tauri::command]
pub fn get_kiosk_client_id(state: tauri::State<'_, BdotState>) -> Result<String, BdotError> {
    state.kiosk_client_id()
}

#[tauri::command]
pub fn set_kiosk_client_id(
    kiosk_client_id: String,
    state: tauri::State<'_, BdotState>,
) -> Result<String, BdotError> {
    state.save_kiosk_client_id(&kiosk_client_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kiosk_client_id_is_encoded_as_one_path_segment() {
        let client = BdotClient {
            config: BdotConfig {
                oauth_client_id: "oauth".into(),
                oauth_client_secret: "secret".into(),
            },
            http: reqwest::Client::new(),
            cache: Mutex::new(Cache::default()),
        };
        assert_eq!(
            client.latest_url("kiosk/one").unwrap().as_str(),
            "https://api.bdot.im/v1/clients/kiosk%2Fone/measurement-sessions/latest?include=scores"
        );
    }
}
