-- マイグレーション: type の CHECK 制約に 'sonota' を追加
-- SQLite は ALTER TABLE で CHECK 制約を変更できないため、テーブルを再作成する
--
-- 実行方法 (Cloudflare D1):
--   wrangler d1 execute ohatui-tweets --file=migrations/001_add_sonota_type.sql
--
-- ※ トランザクションで囲んでいるため、途中エラー時は自動ロールバックされデータは保護されます

CREATE TABLE tweets_new (
    id            TEXT PRIMARY KEY,
    tweet_id      TEXT UNIQUE NOT NULL,
    text          TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    image_url     TEXT,
    like_count    INTEGER NOT NULL DEFAULT 0,
    retweet_count INTEGER NOT NULL DEFAULT 0,
    type          TEXT NOT NULL DEFAULT 'ohachoco'
                  CHECK(type IN ('ohachoco', 'konchoco', 'konbanchoco', 'sonota'))
);

INSERT INTO tweets_new SELECT * FROM tweets;

DROP TABLE tweets;

ALTER TABLE tweets_new RENAME TO tweets;

CREATE INDEX IF NOT EXISTS idx_created_at ON tweets(created_at);
CREATE INDEX IF NOT EXISTS idx_type ON tweets(type);
