use std::{
    fs,
    path::{Path, PathBuf},
};

use crate::error::{AppError, AppResult};

pub fn stage_runtime(
    packaged_executable: &Path,
    packaged_runtime_dir: &Path,
    app_data_dir: &Path,
    target: &str,
) -> AppResult<PathBuf> {
    if !packaged_executable.is_file() || !packaged_runtime_dir.is_dir() || target.trim().is_empty()
    {
        return Err(AppError::Runtime(
            "packaged llama.cpp runtime is incomplete".into(),
        ));
    }
    let destination = app_data_dir.join("runtime").join(target);
    fs::create_dir_all(&destination)?;
    let executable_name = packaged_executable
        .file_name()
        .ok_or_else(|| AppError::InvalidConfig("llama-server filename is invalid".into()))?;
    let staged_executable = destination.join(executable_name);
    copy_if_changed(packaged_executable, &staged_executable)?;
    for entry in fs::read_dir(packaged_runtime_dir)? {
        let entry = entry?;
        if !entry.file_type()?.is_file() || !is_runtime_library(&entry.path()) {
            continue;
        }
        copy_if_changed(&entry.path(), &destination.join(entry.file_name()))?;
    }
    Ok(staged_executable)
}

fn is_runtime_library(path: &Path) -> bool {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    name.ends_with(".dll")
        || name.ends_with(".dylib")
        || name.ends_with(".so")
        || name.contains(".so.")
}

fn copy_if_changed(source: &Path, destination: &Path) -> AppResult<()> {
    let source_size = fs::metadata(source)?.len();
    if fs::metadata(destination).map(|value| value.len()).ok() != Some(source_size) {
        fs::copy(source, destination)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::{env, fs};

    use super::*;

    #[test]
    fn stages_server_beside_its_dynamic_libraries() {
        let root = env::temp_dir().join(format!("quiz-llama-stage-{}", uuid::Uuid::new_v4()));
        let source = root.join("packaged");
        let data = root.join("data");
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("llama-server.exe"), b"server").unwrap();
        fs::write(source.join("llama.dll"), b"library").unwrap();

        let executable = stage_runtime(
            &source.join("llama-server.exe"),
            &source,
            &data,
            "x86_64-pc-windows-msvc",
        )
        .unwrap();

        assert_eq!(
            executable.parent(),
            Some(data.join("runtime/x86_64-pc-windows-msvc").as_path())
        );
        assert_eq!(fs::read(executable).unwrap(), b"server");
        assert_eq!(
            fs::read(data.join("runtime/x86_64-pc-windows-msvc/llama.dll")).unwrap(),
            b"library"
        );
    }
}
