use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("{0}")]
    InvalidInput(String),
    #[error("File operation failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("Project data is invalid: {0}")]
    Json(#[from] serde_json::Error),
    #[error("FFmpeg is unavailable or could not be started")]
    MissingFfmpeg,
    #[error("Media operation failed: {0}")]
    Media(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
