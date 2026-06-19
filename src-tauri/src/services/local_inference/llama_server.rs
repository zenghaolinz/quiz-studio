use std::{
    net::TcpListener,
    path::PathBuf,
    sync::Arc,
    time::{Duration, Instant},
};

use async_trait::async_trait;
use serde_json::Value;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use crate::{
    error::{AppError, AppResult},
    services::local_inference::{
        backend::{
            InstalledModel, LocalInferenceBackend, LocalOcrRequest, LocalOcrResponse,
            RuntimeHealth, RuntimeStatus,
        },
        process::{ProcessCommand, ProcessSlot, ProcessSpawner},
    },
};

pub struct ServerLaunchConfig {
    pub executable: PathBuf,
    pub model_path: PathBuf,
    pub mmproj_path: PathBuf,
    pub port: u16,
    pub context_size: u32,
    pub gpu_layers: i32,
}

pub fn build_server_command(config: &ServerLaunchConfig) -> AppResult<ProcessCommand> {
    if config.port == 0
        || config.context_size == 0
        || config.executable.as_os_str().is_empty()
        || config.model_path == config.mmproj_path
    {
        return Err(AppError::InvalidConfig("llama-server 启动配置无效".into()));
    }
    Ok(ProcessCommand::new(config.executable.clone())
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(config.port.to_string())
        .arg("--model")
        .arg(config.model_path.as_os_str())
        .arg("--mmproj")
        .arg(config.mmproj_path.as_os_str())
        .arg("--ctx-size")
        .arg(config.context_size.to_string())
        .arg("--n-gpu-layers")
        .arg(config.gpu_layers.to_string()))
}

#[derive(Clone)]
pub struct ServerOptions {
    pub fixed_port: Option<u16>,
    pub context_size: u32,
    pub gpu_layers: i32,
    pub readiness_timeout: Duration,
    pub poll_interval: Duration,
    pub idle_timeout: Duration,
    pub max_restarts: u8,
}

impl Default for ServerOptions {
    fn default() -> Self {
        Self {
            fixed_port: None,
            context_size: 8192,
            gpu_layers: -1,
            readiness_timeout: Duration::from_secs(60),
            poll_interval: Duration::from_millis(100),
            idle_timeout: Duration::from_secs(5 * 60),
            max_restarts: 1,
        }
    }
}

struct ServerState {
    status: RuntimeStatus,
    model_id: Option<String>,
    detail: Option<String>,
    endpoint: Option<String>,
    process: ProcessSlot,
    last_used: Option<Instant>,
    loaded_model: Option<InstalledModel>,
}

impl Default for ServerState {
    fn default() -> Self {
        Self {
            status: RuntimeStatus::Stopped,
            model_id: None,
            detail: None,
            endpoint: None,
            process: ProcessSlot::default(),
            last_used: None,
            loaded_model: None,
        }
    }
}

pub struct LlamaServerBackend {
    executable: PathBuf,
    runtime_dir: Option<PathBuf>,
    options: ServerOptions,
    spawner: Arc<dyn ProcessSpawner>,
    client: reqwest::Client,
    state: Arc<Mutex<ServerState>>,
}

impl LlamaServerBackend {
    pub fn with_spawner(
        executable: PathBuf,
        options: ServerOptions,
        spawner: Arc<dyn ProcessSpawner>,
    ) -> AppResult<Self> {
        Self::with_runtime(executable, None, options, spawner)
    }

    pub fn with_runtime(
        executable: PathBuf,
        runtime_dir: Option<PathBuf>,
        options: ServerOptions,
        spawner: Arc<dyn ProcessSpawner>,
    ) -> AppResult<Self> {
        if executable.as_os_str().is_empty()
            || options.context_size == 0
            || options.readiness_timeout.is_zero()
            || options.poll_interval.is_zero()
            || options.idle_timeout.is_zero()
            || options.max_restarts > 3
        {
            return Err(AppError::InvalidConfig("llama-server 后端配置无效".into()));
        }
        Ok(Self {
            executable,
            runtime_dir,
            options,
            spawner,
            client: reqwest::Client::builder().build()?,
            state: Arc::new(Mutex::new(ServerState::default())),
        })
    }

    fn choose_port(&self) -> AppResult<u16> {
        if let Some(port) = self.options.fixed_port {
            if port == 0 {
                return Err(AppError::InvalidConfig("llama-server 端口无效".into()));
            }
            return Ok(port);
        }
        Ok(TcpListener::bind("127.0.0.1:0")?.local_addr()?.port())
    }

    fn schedule_idle_shutdown(&self) {
        let state = self.state.clone();
        let idle_timeout = self.options.idle_timeout;
        tokio::spawn(async move {
            tokio::time::sleep(idle_timeout).await;
            let mut state = state.lock().await;
            let is_idle = state.status == RuntimeStatus::Ready
                && state
                    .last_used
                    .is_some_and(|last_used| last_used.elapsed() >= idle_timeout);
            if is_idle {
                if let Err(error) = state.process.stop() {
                    state.status = RuntimeStatus::Failed;
                    state.detail = Some(error.to_string());
                } else {
                    state.status = RuntimeStatus::Stopped;
                    state.model_id = None;
                    state.endpoint = None;
                    state.last_used = None;
                    state.loaded_model = None;
                }
            }
        });
    }

    async fn recognize_once(
        &self,
        endpoint: &str,
        request: &LocalOcrRequest,
        cancel: &CancellationToken,
    ) -> AppResult<Value> {
        let operation = async {
            self.client
                .post(format!("{endpoint}/v1/chat/completions"))
                .json(&serde_json::json!({
                    "model": "glm-ocr",
                    "temperature": 0,
                    "messages": [{
                        "role": "user",
                        "content": [
                            {"type": "text", "text": request.prompt},
                            {"type": "image_url", "image_url": {"url": request.image_data_url}}
                        ]
                    }]
                }))
                .send()
                .await?
                .error_for_status()?
                .json::<Value>()
                .await
                .map_err(Into::into)
        };
        tokio::select! {
            _ = cancel.cancelled() => Err(AppError::Runtime("本地 OCR 已取消".into())),
            result = operation => result,
        }
    }
}

#[async_trait]
impl LocalInferenceBackend for LlamaServerBackend {
    async fn health(&self) -> AppResult<RuntimeHealth> {
        let mut state = self.state.lock().await;
        if matches!(state.status, RuntimeStatus::Starting | RuntimeStatus::Ready)
            && !state.process.is_running()?
        {
            state.status = RuntimeStatus::Failed;
            state.detail = Some("llama-server 已意外退出".into());
        }
        Ok(RuntimeHealth {
            status: state.status,
            model_id: state.model_id.clone(),
            detail: state.detail.clone(),
        })
    }

    async fn load(&self, model: &InstalledModel) -> AppResult<()> {
        if !model.model_path.is_file() || !model.mmproj_path.is_file() {
            return Err(AppError::NotFound("本地模型或 mmproj 文件不存在".into()));
        }
        let port = self.choose_port()?;
        let mut command = build_server_command(&ServerLaunchConfig {
            executable: self.executable.clone(),
            model_path: model.model_path.clone(),
            mmproj_path: model.mmproj_path.clone(),
            port,
            context_size: self.options.context_size,
            gpu_layers: self.options.gpu_layers,
        })?;
        if let Some(runtime_dir) = &self.runtime_dir {
            command = command.current_dir(runtime_dir.clone());
        }
        let endpoint = format!("http://127.0.0.1:{port}");
        let mut state = self.state.lock().await;
        state.process.start(self.spawner.as_ref(), &command)?;
        state.status = RuntimeStatus::Starting;
        state.model_id = Some(model.id.clone());
        state.detail = None;
        state.endpoint = Some(endpoint.clone());
        state.loaded_model = Some(model.clone());

        let started = Instant::now();
        loop {
            if !state.process.is_running()? {
                state.status = RuntimeStatus::Failed;
                state.detail = Some("llama-server 在就绪前退出".into());
                return Err(AppError::Runtime("llama-server 在就绪前退出".into()));
            }
            let remaining = self
                .options
                .readiness_timeout
                .saturating_sub(started.elapsed());
            let probe_timeout = self.options.poll_interval.min(remaining);
            let ready = !probe_timeout.is_zero()
                && tokio::time::timeout(
                    probe_timeout,
                    self.client.get(format!("{endpoint}/health")).send(),
                )
                .await
                .ok()
                .and_then(Result::ok)
                .is_some_and(|response| response.status().is_success());
            if ready {
                state.status = RuntimeStatus::Ready;
                state.last_used = Some(Instant::now());
                self.schedule_idle_shutdown();
                return Ok(());
            }
            if started.elapsed() >= self.options.readiness_timeout {
                state.process.stop()?;
                state.status = RuntimeStatus::Failed;
                state.detail = Some("llama-server 就绪超时".into());
                return Err(AppError::Runtime("llama-server 就绪超时".into()));
            }
            tokio::time::sleep(self.options.poll_interval).await;
        }
    }

    async fn recognize(
        &self,
        request: LocalOcrRequest,
        cancel: CancellationToken,
    ) -> AppResult<LocalOcrResponse> {
        let started = Instant::now();
        let mut restart_count = 0_u8;
        let raw_json = loop {
            let endpoint = {
                let state = self.state.lock().await;
                if state.status != RuntimeStatus::Ready {
                    return Err(AppError::Runtime("llama-server 尚未就绪".into()));
                }
                state
                    .endpoint
                    .clone()
                    .ok_or_else(|| AppError::Runtime("llama-server 地址缺失".into()))?
            };
            match self.recognize_once(&endpoint, &request, &cancel).await {
                Ok(value) => break value,
                Err(error) if cancel.is_cancelled() => return Err(error),
                Err(error) if restart_count >= self.options.max_restarts => return Err(error),
                Err(_) => {
                    let model = self
                        .state
                        .lock()
                        .await
                        .loaded_model
                        .clone()
                        .ok_or_else(|| AppError::Runtime("无法恢复未记录的本地模型".into()))?;
                    restart_count += 1;
                    self.load(&model).await?;
                }
            }
        };
        let markdown = extract_markdown(&raw_json)
            .filter(|text| !text.trim().is_empty())
            .ok_or_else(|| AppError::Runtime("llama-server 返回了空 OCR 内容".into()))?;
        self.state.lock().await.last_used = Some(Instant::now());
        self.schedule_idle_shutdown();
        Ok(LocalOcrResponse {
            markdown,
            raw_json,
            elapsed_ms: started.elapsed().as_millis(),
        })
    }

    async fn unload(&self) -> AppResult<()> {
        let mut state = self.state.lock().await;
        state.process.stop()?;
        state.status = RuntimeStatus::Stopped;
        state.model_id = None;
        state.endpoint = None;
        state.detail = None;
        state.last_used = None;
        state.loaded_model = None;
        Ok(())
    }
}

fn extract_markdown(value: &Value) -> Option<String> {
    let content = value
        .get("choices")?
        .as_array()?
        .first()?
        .get("message")?
        .get("content")?;
    match content {
        Value::String(text) => Some(text.clone()),
        Value::Array(parts) => {
            let text = parts
                .iter()
                .filter_map(|part| part.get("text").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join("\n");
            (!text.is_empty()).then_some(text)
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use std::{
        io::{Read, Write},
        net::TcpListener,
        path::PathBuf,
        sync::{
            atomic::{AtomicBool, Ordering},
            Arc,
        },
        thread,
        time::Duration,
    };

    use super::*;
    use crate::services::local_inference::{
        backend::{InstalledModel, LocalInferenceBackend, LocalOcrRequest, RuntimeStatus},
        process::{ManagedProcess, ProcessSpawner},
    };

    struct FakeProcess {
        killed: Arc<AtomicBool>,
    }

    impl ManagedProcess for FakeProcess {
        fn try_wait(&mut self) -> AppResult<Option<i32>> {
            Ok(None)
        }

        fn kill_tree(&mut self) -> AppResult<()> {
            self.killed.store(true, Ordering::SeqCst);
            Ok(())
        }
    }

    struct FakeSpawner {
        killed: Arc<AtomicBool>,
    }

    impl ProcessSpawner for FakeSpawner {
        fn spawn(&self, _command: &ProcessCommand) -> AppResult<Box<dyn ManagedProcess>> {
            Ok(Box::new(FakeProcess {
                killed: self.killed.clone(),
            }))
        }
    }

    fn model() -> InstalledModel {
        let directory = std::env::temp_dir().join(format!("quiz-llama-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&directory).unwrap();
        let model = directory.join("model.gguf");
        let mmproj = directory.join("mmproj.gguf");
        std::fs::write(&model, b"model").unwrap();
        std::fs::write(&mmproj, b"mmproj").unwrap();
        InstalledModel::new("glm-ocr-q8", model, mmproj).unwrap()
    }

    fn serve_health_and_chat() -> (u16, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let thread = thread::spawn(move || {
            for _ in 0..2 {
                let (mut stream, _) = listener.accept().unwrap();
                let mut request = Vec::new();
                let mut buffer = [0_u8; 2048];
                while !request.windows(4).any(|part| part == b"\r\n\r\n") {
                    let read = stream.read(&mut buffer).unwrap();
                    request.extend_from_slice(&buffer[..read]);
                }
                let request = String::from_utf8_lossy(&request);
                let body = if request.starts_with("GET /health") {
                    r#"{"status":"ok"}"#
                } else {
                    r##"{"choices":[{"message":{"content":"# OCR"}}]}"##
                };
                write!(
                    stream,
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                )
                .unwrap();
            }
        });
        (port, thread)
    }

    fn serve_health_then_delayed_chat(delay: Duration) -> (u16, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let thread = thread::spawn(move || {
            for index in 0..2 {
                let (mut stream, _) = listener.accept().unwrap();
                let mut request = Vec::new();
                let mut buffer = [0_u8; 2048];
                while !request.windows(4).any(|part| part == b"\r\n\r\n") {
                    let read = stream.read(&mut buffer).unwrap();
                    request.extend_from_slice(&buffer[..read]);
                }
                if index == 1 {
                    thread::sleep(delay);
                }
                let body = if index == 0 {
                    r#"{"status":"ok"}"#
                } else {
                    r##"{"choices":[{"message":{"content":"# OCR"}}]}"##
                };
                let _ = write!(
                    stream,
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
            }
        });
        (port, thread)
    }

    fn serve_health_once() -> (u16, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let thread = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0_u8; 2048];
            let _ = stream.read(&mut request).unwrap();
            let body = r#"{"status":"ok"}"#;
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            )
            .unwrap();
        });
        (port, thread)
    }

    fn serve_one_failed_request_then_restart() -> (u16, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let thread = thread::spawn(move || {
            for index in 0..4 {
                let (mut stream, _) = listener.accept().unwrap();
                let mut request = [0_u8; 4096];
                let _ = stream.read(&mut request).unwrap();
                let (status, body) = match index {
                    1 => ("500 Internal Server Error", r#"{"error":"crashed"}"#),
                    3 => (
                        "200 OK",
                        r##"{"choices":[{"message":{"content":"# recovered"}}]}"##,
                    ),
                    _ => ("200 OK", r#"{"status":"ok"}"#),
                };
                write!(
                    stream,
                    "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                )
                .unwrap();
            }
        });
        (port, thread)
    }

    #[tokio::test]
    async fn loads_recognizes_and_unloads_through_the_backend_contract() {
        let (port, server) = serve_health_and_chat();
        let killed = Arc::new(AtomicBool::new(false));
        let backend = LlamaServerBackend::with_spawner(
            PathBuf::from("fake-llama-server"),
            ServerOptions {
                fixed_port: Some(port),
                readiness_timeout: Duration::from_secs(1),
                poll_interval: Duration::from_millis(5),
                idle_timeout: Duration::from_secs(60),
                ..ServerOptions::default()
            },
            Arc::new(FakeSpawner {
                killed: killed.clone(),
            }),
        )
        .unwrap();

        backend.load(&model()).await.unwrap();
        assert_eq!(backend.health().await.unwrap().status, RuntimeStatus::Ready);
        let result = backend
            .recognize(
                LocalOcrRequest::new("data:image/png;base64,AA==", "OCR").unwrap(),
                tokio_util::sync::CancellationToken::new(),
            )
            .await
            .unwrap();
        assert_eq!(result.markdown, "# OCR");
        backend.unload().await.unwrap();
        assert!(killed.load(Ordering::SeqCst));
        server.join().unwrap();
    }

    #[tokio::test]
    async fn readiness_timeout_stops_the_spawned_process_tree() {
        let reserved = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = reserved.local_addr().unwrap().port();
        drop(reserved);
        let killed = Arc::new(AtomicBool::new(false));
        let backend = LlamaServerBackend::with_spawner(
            PathBuf::from("fake-llama-server"),
            ServerOptions {
                fixed_port: Some(port),
                readiness_timeout: Duration::from_millis(30),
                poll_interval: Duration::from_millis(5),
                ..ServerOptions::default()
            },
            Arc::new(FakeSpawner {
                killed: killed.clone(),
            }),
        )
        .unwrap();

        assert!(backend.load(&model()).await.is_err());
        assert!(killed.load(Ordering::SeqCst));
        assert_eq!(
            backend.health().await.unwrap().status,
            RuntimeStatus::Failed
        );
    }

    #[tokio::test]
    async fn readiness_deadline_also_bounds_a_hanging_health_request() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = thread::spawn(move || {
            let (_stream, _) = listener.accept().unwrap();
            thread::sleep(Duration::from_millis(200));
        });
        let backend = LlamaServerBackend::with_spawner(
            PathBuf::from("fake-llama-server"),
            ServerOptions {
                fixed_port: Some(port),
                readiness_timeout: Duration::from_millis(30),
                poll_interval: Duration::from_millis(5),
                ..ServerOptions::default()
            },
            Arc::new(FakeSpawner {
                killed: Arc::new(AtomicBool::new(false)),
            }),
        )
        .unwrap();

        let bounded =
            tokio::time::timeout(Duration::from_millis(100), backend.load(&model())).await;
        assert!(bounded.is_ok(), "backend ignored its readiness deadline");
        assert!(bounded.unwrap().is_err());
        server.join().unwrap();
    }

    #[tokio::test]
    async fn cancellation_aborts_an_in_flight_ocr_request() {
        let (port, server) = serve_health_then_delayed_chat(Duration::from_millis(100));
        let backend = LlamaServerBackend::with_spawner(
            PathBuf::from("fake-llama-server"),
            ServerOptions {
                fixed_port: Some(port),
                readiness_timeout: Duration::from_secs(1),
                poll_interval: Duration::from_millis(5),
                ..ServerOptions::default()
            },
            Arc::new(FakeSpawner {
                killed: Arc::new(AtomicBool::new(false)),
            }),
        )
        .unwrap();
        backend.load(&model()).await.unwrap();
        let cancellation = CancellationToken::new();
        let cancel_after_delay = {
            let cancellation = cancellation.clone();
            async move {
                tokio::time::sleep(Duration::from_millis(10)).await;
                cancellation.cancel();
            }
        };
        let (result, _) = tokio::join!(
            backend.recognize(
                LocalOcrRequest::new("data:image/png;base64,AA==", "OCR").unwrap(),
                cancellation,
            ),
            cancel_after_delay
        );
        assert!(result.unwrap_err().to_string().contains("取消"));
        backend.unload().await.unwrap();
        server.join().unwrap();
    }

    #[tokio::test]
    async fn idle_runtime_shuts_down_its_process_tree() {
        let (port, server) = serve_health_once();
        let killed = Arc::new(AtomicBool::new(false));
        let backend = LlamaServerBackend::with_spawner(
            PathBuf::from("fake-llama-server"),
            ServerOptions {
                fixed_port: Some(port),
                readiness_timeout: Duration::from_secs(1),
                poll_interval: Duration::from_millis(5),
                idle_timeout: Duration::from_millis(20),
                ..ServerOptions::default()
            },
            Arc::new(FakeSpawner {
                killed: killed.clone(),
            }),
        )
        .unwrap();
        backend.load(&model()).await.unwrap();

        tokio::time::sleep(Duration::from_millis(50)).await;
        assert_eq!(
            backend.health().await.unwrap().status,
            RuntimeStatus::Stopped
        );
        assert!(killed.load(Ordering::SeqCst));
        server.join().unwrap();
    }

    #[tokio::test]
    async fn restarts_at_most_the_configured_number_of_times() {
        let (port, server) = serve_one_failed_request_then_restart();
        let backend = LlamaServerBackend::with_spawner(
            PathBuf::from("fake-llama-server"),
            ServerOptions {
                fixed_port: Some(port),
                readiness_timeout: Duration::from_secs(1),
                poll_interval: Duration::from_millis(5),
                max_restarts: 1,
                ..ServerOptions::default()
            },
            Arc::new(FakeSpawner {
                killed: Arc::new(AtomicBool::new(false)),
            }),
        )
        .unwrap();
        backend.load(&model()).await.unwrap();

        let result = backend
            .recognize(
                LocalOcrRequest::new("data:image/png;base64,AA==", "OCR").unwrap(),
                CancellationToken::new(),
            )
            .await
            .unwrap();
        assert_eq!(result.markdown, "# recovered");
        backend.unload().await.unwrap();
        server.join().unwrap();
    }

    #[test]
    fn command_is_loopback_only_and_contains_both_model_paths() {
        let command = build_server_command(&ServerLaunchConfig {
            executable: PathBuf::from("llama-server.exe"),
            model_path: PathBuf::from("models/GLM-OCR-Q8_0.gguf"),
            mmproj_path: PathBuf::from("models/mmproj-GLM-OCR-Q8_0.gguf"),
            port: 43123,
            context_size: 8192,
            gpu_layers: 99,
        })
        .unwrap();

        assert_eq!(command.program, PathBuf::from("llama-server.exe"));
        assert!(command.has_pair("--host", "127.0.0.1"));
        assert!(command.has_pair("--port", "43123"));
        assert!(command.has_pair("--model", "models/GLM-OCR-Q8_0.gguf"));
        assert!(command.has_pair("--mmproj", "models/mmproj-GLM-OCR-Q8_0.gguf"));
        assert!(command.has_pair("--ctx-size", "8192"));
        assert!(command.has_pair("--n-gpu-layers", "99"));
    }

    #[test]
    fn refuses_wildcard_or_zero_port_launches() {
        let mut config = ServerLaunchConfig {
            executable: PathBuf::from("llama-server"),
            model_path: PathBuf::from("model.gguf"),
            mmproj_path: PathBuf::from("mmproj.gguf"),
            port: 0,
            context_size: 8192,
            gpu_layers: 0,
        };
        assert!(build_server_command(&config).is_err());
        config.port = 43123;
        config.context_size = 0;
        assert!(build_server_command(&config).is_err());
    }

    #[test]
    fn normalizes_openai_multimodal_response() {
        let raw = serde_json::json!({
            "choices": [{"message": {"content": [{"type": "text", "text": "# OCR"}]}}]
        });
        assert_eq!(extract_markdown(&raw).as_deref(), Some("# OCR"));
    }
}
