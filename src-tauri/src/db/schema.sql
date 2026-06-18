CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS question_banks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    subject TEXT,
    description TEXT,
    cover_asset_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    bank_id TEXT NOT NULL REFERENCES question_banks(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES questions(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    stem_markdown TEXT NOT NULL,
    options_json TEXT NOT NULL DEFAULT '[]',
    answer_json TEXT NOT NULL,
    explanation_markdown TEXT,
    max_score REAL NOT NULL DEFAULT 1,
    difficulty INTEGER,
    tags_json TEXT NOT NULL DEFAULT '[]',
    source_file_id TEXT,
    source_page INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_questions_bank_id ON questions(bank_id);
CREATE INDEX IF NOT EXISTS idx_questions_type ON questions(type);

CREATE VIRTUAL TABLE IF NOT EXISTS questions_fts USING fts5(
    question_id UNINDEXED,
    stem_markdown,
    explanation_markdown,
    content=''
);

CREATE TABLE IF NOT EXISTS provider_configs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    protocol TEXT NOT NULL,
    base_url TEXT NOT NULL,
    model TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS import_jobs (
    id TEXT PRIMARY KEY,
    source_name TEXT NOT NULL,
    source_type TEXT NOT NULL,
    status TEXT NOT NULL,
    engine TEXT,
    progress REAL NOT NULL DEFAULT 0,
    draft_json TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    sha256 TEXT NOT NULL UNIQUE,
    relative_path TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS asset_links (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    parent_asset_id TEXT REFERENCES assets(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    provider_id TEXT,
    model TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_asset_links_asset_id ON asset_links(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_links_parent_id ON asset_links(parent_asset_id);

CREATE TABLE IF NOT EXISTS test_sessions (
    id TEXT PRIMARY KEY,
    bank_id TEXT REFERENCES question_banks(id) ON DELETE SET NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    settings_json TEXT NOT NULL,
    score REAL,
    max_score REAL,
    started_at TEXT NOT NULL,
    submitted_at TEXT
);

CREATE TABLE IF NOT EXISTS attempts (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES test_sessions(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    response_json TEXT NOT NULL,
    is_correct INTEGER,
    score REAL,
    answer_revealed INTEGER NOT NULL DEFAULT 0,
    ai_grading_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
