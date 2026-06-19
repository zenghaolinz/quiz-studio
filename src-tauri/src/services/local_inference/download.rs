use std::{
    ffi::OsString,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Arc,
    time::{Duration, Instant},
};

use reqwest::{
    header::{CONTENT_LENGTH, ETAG, IF_RANGE, RANGE},
    Client, StatusCode,
};
use sha2::{Digest, Sha256};
use tokio_util::sync::CancellationToken;
use url::Url;

use crate::error::{AppError, AppResult};

pub struct DownloadRequest {
    pub url: Url,
    pub install_root: PathBuf,
    pub destination: PathBuf,
    pub expected_size: u64,
    pub expected_sha256: String,
    pub disk_budget: u64,
    pub etag: Option<String>,
    pub progress: Option<Arc<dyn Fn(DownloadProgress) + Send + Sync>>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DownloadProgress {
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
}

#[derive(Debug, Eq, PartialEq)]
pub struct DownloadOutcome {
    pub bytes: u64,
    pub etag: Option<String>,
    pub resumed: bool,
}

pub async fn download(
    request: DownloadRequest,
    cancellation: CancellationToken,
) -> AppResult<DownloadOutcome> {
    validate_request(&request)?;
    let parent = request
        .destination
        .parent()
        .ok_or_else(|| AppError::InvalidConfig("模型目标目录无效".into()))?;
    fs::create_dir_all(parent)?;
    let part_path = part_path(&request.destination)?;
    let mut existing = fs::metadata(&part_path).map(|meta| meta.len()).unwrap_or(0);
    if existing > request.expected_size {
        fs::remove_file(&part_path)?;
        existing = 0;
    }
    if request.disk_budget < request.expected_size.saturating_sub(existing) {
        return Err(AppError::Runtime("模型下载可用空间不足".into()));
    }

    let client = Client::builder().build()?;
    let mut allow_resume = existing > 0;
    let mut response = loop {
        let mut builder = client.get(request.url.clone());
        if allow_resume {
            builder = builder.header(RANGE, format!("bytes={existing}-"));
            if let Some(etag) = &request.etag {
                builder = builder.header(IF_RANGE, etag);
            }
        }
        let response = builder.send().await?.error_for_status()?;
        let response_etag = header_string(&response, ETAG);
        let etag_changed = allow_resume
            && request.etag.is_some()
            && response_etag.is_some()
            && request.etag != response_etag;
        if etag_changed {
            remove_if_exists(&part_path)?;
            existing = 0;
            allow_resume = false;
            continue;
        }
        break response;
    };

    let resumed = allow_resume && response.status() == StatusCode::PARTIAL_CONTENT;
    if allow_resume && !resumed {
        existing = 0;
    }
    let expected_response_bytes = request.expected_size.saturating_sub(existing);
    if let Some(content_length) = response
        .headers()
        .get(CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
    {
        if content_length != expected_response_bytes {
            return Err(AppError::Runtime(format!(
                "模型下载长度不符：预期 {expected_response_bytes}，实际 {content_length}"
            )));
        }
    }
    let etag = header_string(&response, ETAG).or(request.etag.clone());
    let mut output = if resumed {
        OpenOptions::new().append(true).open(&part_path)?
    } else {
        File::create(&part_path)?
    };
    let mut downloaded = existing;
    let mut last_progress_bytes = existing;
    let mut last_progress_at = Instant::now();
    loop {
        let chunk = tokio::select! {
            _ = cancellation.cancelled() => {
                output.flush()?;
                return Err(AppError::Runtime("模型下载已取消".into()));
            }
            chunk = response.chunk() => chunk?,
        };
        let Some(chunk) = chunk else { break };
        downloaded = downloaded
            .checked_add(chunk.len() as u64)
            .ok_or_else(|| AppError::Runtime("模型下载大小溢出".into()))?;
        if downloaded > request.expected_size {
            remove_if_exists(&part_path)?;
            return Err(AppError::Runtime("模型下载内容超过预期大小".into()));
        }
        output.write_all(&chunk)?;
        if downloaded.saturating_sub(last_progress_bytes) >= 1024 * 1024
            || last_progress_at.elapsed() >= Duration::from_millis(500)
            || downloaded == request.expected_size
        {
            if let Some(progress) = &request.progress {
                progress(DownloadProgress {
                    downloaded_bytes: downloaded,
                    total_bytes: request.expected_size,
                });
            }
            last_progress_bytes = downloaded;
            last_progress_at = Instant::now();
        }
    }
    output.flush()?;
    drop(output);

    verify_file(&part_path, request.expected_size, &request.expected_sha256)?;
    remove_if_exists(&request.destination)?;
    fs::rename(&part_path, &request.destination)?;
    Ok(DownloadOutcome {
        bytes: downloaded,
        etag,
        resumed,
    })
}

fn validate_request(request: &DownloadRequest) -> AppResult<()> {
    let hash_is_valid = request.expected_sha256.len() == 64
        && request
            .expected_sha256
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte));
    let confined = request.destination.parent() == Some(request.install_root.as_path())
        && request.destination.file_name().is_some();
    if request.expected_size == 0 || !hash_is_valid || !confined {
        return Err(AppError::InvalidConfig("模型下载请求无效".into()));
    }
    Ok(())
}

fn verify_file(path: &Path, expected_size: u64, expected_sha256: &str) -> AppResult<()> {
    if fs::metadata(path)?.len() != expected_size {
        remove_if_exists(path)?;
        return Err(AppError::Runtime("模型文件大小校验失败".into()));
    }
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    if format!("{:x}", hasher.finalize()) != expected_sha256 {
        remove_if_exists(path)?;
        return Err(AppError::Runtime("模型文件 SHA-256 校验失败".into()));
    }
    Ok(())
}

fn part_path(destination: &Path) -> AppResult<PathBuf> {
    let file_name = destination
        .file_name()
        .ok_or_else(|| AppError::InvalidConfig("模型文件名无效".into()))?;
    let mut part_name = OsString::from(file_name);
    part_name.push(".part");
    Ok(destination.with_file_name(part_name))
}

fn header_string(
    response: &reqwest::Response,
    name: reqwest::header::HeaderName,
) -> Option<String> {
    response
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned)
}

fn remove_if_exists(path: &Path) -> AppResult<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        io::{Read, Write},
        net::TcpListener,
        sync::mpsc,
        thread,
    };

    use super::*;

    struct Fixture {
        url: Url,
        ranges: mpsc::Receiver<Option<String>>,
        thread: thread::JoinHandle<()>,
    }

    fn fixture(body: &[u8], ignore_range: bool, etag: &str, requests: usize) -> Fixture {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let body = body.to_vec();
        let etag = etag.to_owned();
        let (sender, ranges) = mpsc::channel();
        let thread = thread::spawn(move || {
            for _ in 0..requests {
                let (mut stream, _) = listener.accept().unwrap();
                let mut received = Vec::new();
                let mut buffer = [0_u8; 1024];
                while !received.windows(4).any(|window| window == b"\r\n\r\n") {
                    let count = stream.read(&mut buffer).unwrap();
                    if count == 0 {
                        break;
                    }
                    received.extend_from_slice(&buffer[..count]);
                }
                let headers = String::from_utf8_lossy(&received);
                let range = headers.lines().find_map(|line| {
                    line.strip_prefix("Range: ")
                        .or_else(|| line.strip_prefix("range: "))
                        .map(str::to_owned)
                });
                sender.send(range.clone()).unwrap();
                let offset = if ignore_range {
                    0
                } else {
                    range
                        .as_deref()
                        .and_then(|value| value.strip_prefix("bytes="))
                        .and_then(|value| value.strip_suffix('-'))
                        .and_then(|value| value.parse::<usize>().ok())
                        .unwrap_or(0)
                };
                let status = if offset > 0 {
                    "206 Partial Content"
                } else {
                    "200 OK"
                };
                let response_body = &body[offset..];
                write!(
                    stream,
                    "HTTP/1.1 {status}\r\nContent-Length: {}\r\nETag: {etag}\r\nConnection: close\r\n\r\n",
                    response_body.len()
                )
                .unwrap();
                stream.write_all(response_body).unwrap();
            }
        });
        Fixture {
            url: format!("http://{address}/model.gguf").parse().unwrap(),
            ranges,
            thread,
        }
    }

    fn interrupted_fixture(body: &[u8], first_bytes: usize) -> Fixture {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let body = body.to_vec();
        let (sender, ranges) = mpsc::channel();
        let thread = thread::spawn(move || {
            for attempt in 0..2 {
                let (mut stream, _) = listener.accept().unwrap();
                let mut received = Vec::new();
                let mut buffer = [0_u8; 1024];
                while !received.windows(4).any(|window| window == b"\r\n\r\n") {
                    let count = stream.read(&mut buffer).unwrap();
                    received.extend_from_slice(&buffer[..count]);
                }
                let headers = String::from_utf8_lossy(&received);
                let range = headers.lines().find_map(|line| {
                    line.strip_prefix("Range: ")
                        .or_else(|| line.strip_prefix("range: "))
                        .map(str::to_owned)
                });
                sender.send(range).unwrap();
                if attempt == 0 {
                    write!(
                        stream,
                        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nETag: v1\r\nConnection: close\r\n\r\n",
                        body.len()
                    )
                    .unwrap();
                    stream.write_all(&body[..first_bytes]).unwrap();
                } else {
                    let remaining = &body[first_bytes..];
                    write!(
                        stream,
                        "HTTP/1.1 206 Partial Content\r\nContent-Length: {}\r\nETag: v1\r\nConnection: close\r\n\r\n",
                        remaining.len()
                    )
                    .unwrap();
                    stream.write_all(remaining).unwrap();
                }
            }
        });
        Fixture {
            url: format!("http://{address}/model.gguf").parse().unwrap(),
            ranges,
            thread,
        }
    }

    fn runtime() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
    }

    fn request(url: Url, destination: PathBuf, body: &[u8]) -> DownloadRequest {
        DownloadRequest {
            url,
            install_root: destination.parent().unwrap().to_path_buf(),
            destination,
            expected_size: body.len() as u64,
            expected_sha256: format!("{:x}", Sha256::digest(body)),
            disk_budget: body.len() as u64,
            etag: None,
            progress: None,
        }
    }

    #[test]
    fn downloads_verifies_and_atomically_renames() {
        let body = b"complete model";
        let server = fixture(body, false, "v1", 1);
        let directory =
            std::env::temp_dir().join(format!("quiz-download-{}", uuid::Uuid::new_v4()));
        let destination = directory.join("model.gguf");

        let outcome = runtime()
            .block_on(download(
                request(server.url, destination.clone(), body),
                CancellationToken::new(),
            ))
            .unwrap();

        assert_eq!(outcome.bytes, body.len() as u64);
        assert_eq!(fs::read(&destination).unwrap(), body);
        assert!(!directory.join("model.gguf.part").exists());
        assert_eq!(server.ranges.recv().unwrap(), None);
        server.thread.join().unwrap();
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn resumes_with_http_range_and_restarts_if_range_is_ignored() {
        let body = b"0123456789";
        for ignore_range in [false, true] {
            let server = fixture(body, ignore_range, "v1", 1);
            let directory =
                std::env::temp_dir().join(format!("quiz-download-{}", uuid::Uuid::new_v4()));
            fs::create_dir_all(&directory).unwrap();
            let destination = directory.join("model.gguf");
            fs::write(directory.join("model.gguf.part"), &body[..4]).unwrap();
            let mut download_request = request(server.url, destination.clone(), body);
            download_request.disk_budget = 6;

            let outcome = runtime()
                .block_on(download(download_request, CancellationToken::new()))
                .unwrap();

            assert_eq!(outcome.resumed, !ignore_range);
            assert_eq!(fs::read(destination).unwrap(), body);
            assert_eq!(server.ranges.recv().unwrap().as_deref(), Some("bytes=4-"));
            server.thread.join().unwrap();
            let _ = fs::remove_dir_all(directory);
        }
    }

    #[test]
    fn etag_change_restarts_from_zero() {
        let body = b"0123456789";
        let server = fixture(body, false, "new", 2);
        let directory =
            std::env::temp_dir().join(format!("quiz-download-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let destination = directory.join("model.gguf");
        fs::write(directory.join("model.gguf.part"), &body[..4]).unwrap();
        let mut download_request = request(server.url, destination.clone(), body);
        download_request.etag = Some("old".into());

        let outcome = runtime()
            .block_on(download(download_request, CancellationToken::new()))
            .unwrap();

        assert!(!outcome.resumed);
        assert_eq!(fs::read(destination).unwrap(), body);
        assert_eq!(server.ranges.recv().unwrap().as_deref(), Some("bytes=4-"));
        assert_eq!(server.ranges.recv().unwrap(), None);
        server.thread.join().unwrap();
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn sha_mismatch_never_exposes_final_file() {
        let body = b"wrong bytes";
        let server = fixture(body, false, "v1", 1);
        let directory =
            std::env::temp_dir().join(format!("quiz-download-{}", uuid::Uuid::new_v4()));
        let destination = directory.join("model.gguf");
        let mut download_request = request(server.url, destination.clone(), body);
        download_request.expected_sha256 = "0".repeat(64);

        assert!(runtime()
            .block_on(download(download_request, CancellationToken::new()))
            .is_err());
        assert!(!destination.exists());
        assert!(!directory.join("model.gguf.part").exists());
        server.thread.join().unwrap();
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn interrupted_transfer_keeps_checkpoint_for_next_range_request() {
        let body = b"0123456789";
        let server = interrupted_fixture(body, 4);
        let directory =
            std::env::temp_dir().join(format!("quiz-download-{}", uuid::Uuid::new_v4()));
        let destination = directory.join("model.gguf");

        assert!(runtime()
            .block_on(download(
                request(server.url.clone(), destination.clone(), body),
                CancellationToken::new(),
            ))
            .is_err());
        assert_eq!(
            fs::metadata(directory.join("model.gguf.part"))
                .unwrap()
                .len(),
            4
        );

        let outcome = runtime()
            .block_on(download(
                request(server.url, destination.clone(), body),
                CancellationToken::new(),
            ))
            .unwrap();
        assert!(outcome.resumed);
        assert_eq!(fs::read(destination).unwrap(), body);
        assert_eq!(server.ranges.recv().unwrap(), None);
        assert_eq!(server.ranges.recv().unwrap().as_deref(), Some("bytes=4-"));
        server.thread.join().unwrap();
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn cancellation_never_exposes_an_unverified_final_file() {
        let body = b"0123456789";
        let server = fixture(body, false, "v1", 1);
        let directory =
            std::env::temp_dir().join(format!("quiz-download-{}", uuid::Uuid::new_v4()));
        let destination = directory.join("model.gguf");
        let cancellation = CancellationToken::new();
        cancellation.cancel();

        assert!(runtime()
            .block_on(download(
                request(server.url, destination.clone(), body),
                cancellation,
            ))
            .is_err());
        assert!(!destination.exists());
        assert!(directory.join("model.gguf.part").exists());
        server.thread.join().unwrap();
        let _ = fs::remove_dir_all(directory);
    }
    use sha2::{Digest, Sha256};

    #[test]
    fn rejects_insufficient_disk_budget_before_network_io() {
        let directory =
            std::env::temp_dir().join(format!("quiz-download-{}", uuid::Uuid::new_v4()));
        let request = DownloadRequest {
            url: "http://127.0.0.1:1/model.gguf".parse().unwrap(),
            install_root: directory.clone(),
            destination: directory.join("model.gguf"),
            expected_size: 10,
            expected_sha256: format!("{:x}", Sha256::digest(b"0123456789")),
            disk_budget: 9,
            etag: None,
            progress: None,
        };

        assert!(runtime()
            .block_on(download(request, CancellationToken::new()))
            .is_err());
        assert!(!directory.join("model.gguf.part").exists());
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn rejects_destination_outside_the_install_root() {
        let directory =
            std::env::temp_dir().join(format!("quiz-download-{}", uuid::Uuid::new_v4()));
        let mut download_request = request(
            "http://127.0.0.1:1/model.gguf".parse().unwrap(),
            directory.join("model.gguf"),
            b"model",
        );
        download_request.install_root = directory.join("other-root");

        assert!(runtime()
            .block_on(download(download_request, CancellationToken::new()))
            .is_err());
        assert!(!directory.exists());
    }
}
