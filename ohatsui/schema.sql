-- おはついアーカイブ D1 データベーススキーマ
-- Cloudflare D1 (SQLite 互換)

CREATE TABLE IF NOT EXISTS tweets (
    id           TEXT PRIMARY KEY,       -- X の tweet ID (文字列)
    tweet_id     TEXT UNIQUE NOT NULL,   -- 元ポストへのリンク用 (id と同値)
    text         TEXT NOT NULL,          -- ツイート本文
    created_at   TEXT NOT NULL,          -- ISO 8601 UTC (例: 2026-03-15T01:12:00.000Z)
    image_url    TEXT,                   -- 添付画像 URL (pbs.twimg.com/...) 、なければ NULL
    like_count   INTEGER NOT NULL DEFAULT 0,
    retweet_count INTEGER NOT NULL DEFAULT 0,
    type         TEXT NOT NULL DEFAULT 'ohachoco'
                 CHECK(type IN ('ohachoco', 'konchoco', 'konbanchoco', 'sonota'))
);

-- 日付順クエリ用インデックス
CREATE INDEX IF NOT EXISTS idx_created_at ON tweets(created_at);

-- 種類別集計用インデックス
CREATE INDEX IF NOT EXISTS idx_type ON tweets(type);
