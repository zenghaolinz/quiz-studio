use std::{
    ffi::OsString,
    path::PathBuf,
    process::{Child, Command, Stdio},
};

use crate::error::{AppError, AppResult};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProcessCommand {
    pub program: PathBuf,
    pub args: Vec<OsString>,
}

impl ProcessCommand {
    pub fn new(program: PathBuf) -> Self {
        Self {
            program,
            args: Vec::new(),
        }
    }

    pub fn arg(mut self, value: impl Into<OsString>) -> Self {
        self.args.push(value.into());
        self
    }

    pub fn has_pair(&self, name: &str, value: &str) -> bool {
        self.args
            .windows(2)
            .any(|pair| pair[0].to_string_lossy() == name && pair[1].to_string_lossy() == value)
    }
}

pub trait ManagedProcess: Send {
    fn try_wait(&mut self) -> AppResult<Option<i32>>;
    fn kill_tree(&mut self) -> AppResult<()>;
}

pub trait ProcessSpawner: Send + Sync {
    fn spawn(&self, command: &ProcessCommand) -> AppResult<Box<dyn ManagedProcess>>;
}

#[derive(Default)]
pub struct SystemProcessSpawner;

impl ProcessSpawner for SystemProcessSpawner {
    fn spawn(&self, command: &ProcessCommand) -> AppResult<Box<dyn ManagedProcess>> {
        let mut process = Command::new(&command.program);
        process
            .args(&command.args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            process.creation_flags(CREATE_NO_WINDOW);
        }
        let child = process.spawn()?;
        Ok(Box::new(SystemManagedProcess { child }))
    }
}

struct SystemManagedProcess {
    child: Child,
}

impl ManagedProcess for SystemManagedProcess {
    fn try_wait(&mut self) -> AppResult<Option<i32>> {
        Ok(self
            .child
            .try_wait()?
            .map(|status| status.code().unwrap_or(-1)))
    }

    fn kill_tree(&mut self) -> AppResult<()> {
        if self.child.try_wait()?.is_some() {
            return Ok(());
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            let status = Command::new("taskkill")
                .args(["/PID", &self.child.id().to_string(), "/T", "/F"])
                .creation_flags(CREATE_NO_WINDOW)
                .status()?;
            if !status.success() && self.child.try_wait()?.is_none() {
                return Err(AppError::Runtime("无法终止 llama-server 进程树".into()));
            }
        }
        #[cfg(not(windows))]
        self.child.kill()?;
        let _ = self.child.wait()?;
        Ok(())
    }
}

#[derive(Default)]
pub struct ProcessSlot {
    process: Option<Box<dyn ManagedProcess>>,
}

impl ProcessSlot {
    pub fn start(
        &mut self,
        spawner: &dyn ProcessSpawner,
        command: &ProcessCommand,
    ) -> AppResult<()> {
        self.stop()?;
        self.process = Some(spawner.spawn(command)?);
        Ok(())
    }

    pub fn is_running(&mut self) -> AppResult<bool> {
        let Some(process) = self.process.as_mut() else {
            return Ok(false);
        };
        if process.try_wait()?.is_some() {
            self.process = None;
            return Ok(false);
        }
        Ok(true)
    }

    pub fn stop(&mut self) -> AppResult<()> {
        if let Some(mut process) = self.process.take() {
            process.kill_tree()?;
        }
        Ok(())
    }
}

impl Drop for ProcessSlot {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

#[cfg(test)]
mod tests {
    use std::{
        path::PathBuf,
        sync::{
            atomic::{AtomicBool, Ordering},
            Arc,
        },
    };

    use super::*;

    #[test]
    fn command_arguments_remain_structured_not_shell_joined() {
        let command = ProcessCommand::new(PathBuf::from("llama server.exe"))
            .arg("--model")
            .arg("C:\\models\\name with spaces.gguf");
        assert_eq!(command.program, PathBuf::from("llama server.exe"));
        assert_eq!(
            command.args,
            vec![
                OsString::from("--model"),
                OsString::from("C:\\models\\name with spaces.gguf")
            ]
        );
    }

    struct FakeProcess {
        killed: Arc<AtomicBool>,
    }

    impl ManagedProcess for FakeProcess {
        fn try_wait(&mut self) -> crate::error::AppResult<Option<i32>> {
            Ok(None)
        }

        fn kill_tree(&mut self) -> crate::error::AppResult<()> {
            self.killed.store(true, Ordering::SeqCst);
            Ok(())
        }
    }

    struct FakeSpawner {
        killed: Arc<AtomicBool>,
    }

    impl ProcessSpawner for FakeSpawner {
        fn spawn(
            &self,
            _command: &ProcessCommand,
        ) -> crate::error::AppResult<Box<dyn ManagedProcess>> {
            Ok(Box::new(FakeProcess {
                killed: self.killed.clone(),
            }))
        }
    }

    #[test]
    fn stopping_a_process_slot_terminates_the_process_tree() {
        let killed = Arc::new(AtomicBool::new(false));
        let spawner = FakeSpawner {
            killed: killed.clone(),
        };
        let mut slot = ProcessSlot::default();
        slot.start(
            &spawner,
            &ProcessCommand::new(PathBuf::from("fake-llama-server")),
        )
        .unwrap();

        assert!(slot.is_running().unwrap());
        slot.stop().unwrap();
        assert!(killed.load(Ordering::SeqCst));
        assert!(!slot.is_running().unwrap());
    }
}
