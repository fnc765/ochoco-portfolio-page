#!/usr/bin/env python3
"""
おはついDB 画像一括アップロード・一括インポートスクリプト

D1 に登録済みのツイートの画像を取得し、
R2 バケット (ohatui-images) に images/small/{tweet_id}.jpg として保存する。

──────────────────────────────────────
使い方
──────────────────────────────────────

1. 依存パッケージのインストール:
   pip install pillow boto3 requests

2. D1 から画像URLを取得 → Twitter から画像DL → R2 にアップロード:

   CF_ACCOUNT_ID=xxx \
   CF_API_TOKEN=xxx \
   CF_D1_DATABASE_ID=xxx \
   CF_R2_ACCESS_KEY_ID=xxx \
   CF_R2_SECRET_ACCESS_KEY=xxx \
     python upload_images.py

3. X アーカイブのメディアフォルダから直接アップロード:

   CF_ACCOUNT_ID=xxx \
   CF_R2_ACCESS_KEY_ID=xxx \
   CF_R2_SECRET_ACCESS_KEY=xxx \
     python upload_images.py --archive /path/to/twitter-data/data/tweets_media/

4. X アーカイブから一括インポート (D1登録 + R2画像アップロード):

   CF_API_TOKEN=xxx \
     python upload_images.py --import-archive /path/to/twitter-data/data/

   ※ CF_ACCOUNT_ID, CF_D1_DATABASE_ID は省略可（APIから自動取得）

──────────────────────────────────────
"""

import argparse
import io
import json
import os
import re
import sys
import time
from datetime import datetime

# Windows ターミナルで絵文字・日本語の UnicodeEncodeError を防止
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
if sys.stderr.encoding != 'utf-8':
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlparse

try:
    import boto3
    import requests
    from botocore.exceptions import ClientError as BotoClientError
    from PIL import Image
except ImportError as e:
    print(f"必要なパッケージが不足: {e}")
    print("pip install pillow boto3 requests")
    sys.exit(1)

R2_BUCKET = "ohatui-images"
R2_KEY_PREFIX = "images/small/"
ALLOWED_IMAGE_HOSTS = {"pbs.twimg.com", "abs.twimg.com"}
MAX_IMAGE_PIXELS = 25_000_000  # 約5000x5000

GREETING_PATTERN = re.compile(r'おはちょこ|こんちょこ|こんばんちょこ')


def get_env(key):
    val = os.environ.get(key)
    if not val:
        print(f"環境変数 {key} が未設定です")
        sys.exit(1)
    return val


def create_r2_client(account_id, access_key_id, secret_access_key):
    """Cloudflare R2 の S3 互換クライアントを作成"""
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=access_key_id,
        aws_secret_access_key=secret_access_key,
        region_name="auto",
    )


def fetch_tweets_from_d1(api_token, account_id, database_id):
    """D1 から image_url が設定されているツイートを取得"""
    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database/{database_id}/query"
    resp = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json",
        },
        json={"sql": "SELECT id, image_url FROM tweets WHERE image_url IS NOT NULL"},
    )
    resp.raise_for_status()
    data = resp.json()
    if not data.get("success"):
        print(f"D1 API エラー: {data.get('errors')}")
        sys.exit(1)
    return data["result"][0]["results"]


def check_r2_exists(r2_client, key):
    """R2 にオブジェクトが存在するか確認"""
    try:
        r2_client.head_object(Bucket=R2_BUCKET, Key=key)
        return True
    except BotoClientError as e:
        if e.response["Error"]["Code"] == "404":
            return False
        raise


def download_image(image_url):
    """画像をダウンロードして返す"""
    parsed = urlparse(image_url)
    if parsed.scheme != "https":
        print(f"  [SKIP] HTTPS以外のスキーム: {parsed.scheme}")
        return None
    if parsed.hostname not in ALLOWED_IMAGE_HOSTS:
        print(f"  [SKIP] 許可されていないホスト: {parsed.hostname}")
        return None

    # pbs.twimg.com の場合は小サイズを取得
    if "pbs.twimg.com" in image_url:
        # URL パラメータで小サイズ指定
        sep = "&" if "?" in image_url else "?"
        image_url = f"{image_url}{sep}format=jpg&name=small"

    resp = requests.get(image_url, headers={"User-Agent": "bot"}, timeout=30)
    resp.raise_for_status()

    buf = io.BytesIO(resp.content)
    buf.seek(0)
    return buf


def convert_local_image(file_path):
    """ローカル画像ファイルをJPEGに変換"""
    img = Image.open(file_path)
    if img.width * img.height > MAX_IMAGE_PIXELS:
        raise ValueError(f"画像が大きすぎます: {img.size}")
    img = img.convert("RGB")

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    buf.seek(0)
    return buf


def upload_to_r2(r2_client, key, data):
    """R2 にアップロード"""
    r2_client.put_object(
        Bucket=R2_BUCKET,
        Key=key,
        Body=data,
        ContentType="image/jpeg",
    )


# ──────────────────────────────────────
# Cloudflare REST API ヘルパー（import-archive 用）
# ──────────────────────────────────────


def get_account_id(api_token):
    """CF_API_TOKEN から Account ID を自動取得"""
    resp = requests.get(
        "https://api.cloudflare.com/client/v4/accounts",
        headers={"Authorization": f"Bearer {api_token}"},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["result"][0]["id"]


def get_d1_database_id(api_token, account_id, db_name="ohatui-tweets"):
    """データベース名からD1 Database IDを取得"""
    resp = requests.get(
        f"https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database?per_page=100",
        headers={"Authorization": f"Bearer {api_token}"},
        timeout=30,
    )
    resp.raise_for_status()
    for db in resp.json()["result"]:
        if db["name"] == db_name:
            return db["uuid"]
    raise ValueError(f"D1 database '{db_name}' が見つかりません")


def upload_to_r2_api(api_token, account_id, key, data, content_type="image/jpeg"):
    """Cloudflare R2 REST API でファイルをアップロード"""
    resp = requests.put(
        f"https://api.cloudflare.com/client/v4/accounts/{account_id}/r2/buckets/{R2_BUCKET}/objects/{key}",
        headers={
            "Authorization": f"Bearer {api_token}",
            "Content-Type": content_type,
        },
        data=data,
        timeout=60,
    )
    if not resp.ok:
        print(f"    R2 API エラー: {resp.status_code} {resp.text[:200]}")
    resp.raise_for_status()


def check_r2_exists_api(api_token, account_id, key):
    """Cloudflare R2 REST API でオブジェクトの存在確認"""
    resp = requests.head(
        f"https://api.cloudflare.com/client/v4/accounts/{account_id}/r2/buckets/{R2_BUCKET}/objects/{key}",
        headers={"Authorization": f"Bearer {api_token}"},
        timeout=30,
    )
    if resp.status_code not in (200, 404):
        print(f"    R2 存在確認エラー: {resp.status_code}")
    return resp.status_code == 200


# ──────────────────────────────────────
# Xアーカイブ一括インポート機能
# ──────────────────────────────────────


def parse_tweets_js(filepath):
    """tweets.js をパースしてツイートリストを返す"""
    raw = Path(filepath).read_text(encoding="utf-8")
    # 先頭の `window.YTD.tweets.part0 = ` 等を除去
    json_str = re.sub(r'^window\.YTD\.\w+\.part\d+\s*=\s*', '', raw)
    # 末尾の `;` を除去
    json_str = re.sub(r';?\s*$', '', json_str)
    items = json.loads(json_str)
    # 各アイテムの item["tweet"] ?? item を取得
    return [item.get("tweet", item) for item in items]


def is_greeting(text):
    """テキストがおはつい（挨拶ツイート）かどうか判定"""
    return bool(GREETING_PATTERN.search(text))


def detect_type(text):
    """ツイートのタイプを判定する"""
    if re.search(r'こんばんちょこ', text):
        return 'konbanchoco'
    if re.search(r'こんちょこ', text):
        return 'konchoco'
    return 'ohachoco'


def parse_twitter_date(twitter_date_str):
    """Twitter形式の日時をISO 8601 UTCに変換"""
    # "Mon Jan 01 00:00:00 +0000 2024" → "2024-01-01T00:00:00.000Z"
    try:
        dt = parsedate_to_datetime(twitter_date_str)
        return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    except Exception:
        # フォールバック: strptime（Cロケールでのみ動作）
        dt = datetime.strptime(twitter_date_str, "%a %b %d %H:%M:%S %z %Y")
        return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def insert_tweet_to_d1(api_token, account_id, database_id, tweet_data):
    """D1 REST APIでツイートをINSERT (ON CONFLICT DO UPDATE)"""
    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database/{database_id}/query"
    sql = (
        "INSERT INTO tweets"
        " (id, tweet_id, text, created_at, image_url, like_count, retweet_count, type)"
        " VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
        " ON CONFLICT(id) DO UPDATE SET"
        " text = excluded.text,"
        " created_at = excluded.created_at,"
        " image_url = COALESCE(tweets.image_url, excluded.image_url),"
        " like_count = MAX(tweets.like_count, excluded.like_count),"
        " retweet_count = MAX(tweets.retweet_count, excluded.retweet_count),"
        " type = excluded.type"
    )
    resp = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json",
        },
        json={
            "sql": sql,
            "params": [
                tweet_data["id"],
                tweet_data["tweet_id"],
                tweet_data["text"],
                tweet_data["created_at"],
                tweet_data["image_url"],
                tweet_data["like_count"],
                tweet_data["retweet_count"],
                tweet_data["type"],
            ],
        },
    )
    resp.raise_for_status()
    data = resp.json()
    if not data.get("success"):
        raise RuntimeError(f"D1 API エラー: {data.get('errors')}")
    return data


def find_media_file(tweets_media_dir, tweet_id):
    """tweets_media/ フォルダから tweet_id に一致する画像ファイルを探す"""
    for f in tweets_media_dir.iterdir():
        if f.name.startswith(f"{tweet_id}-") and f.suffix.lower() in (".jpg", ".jpeg", ".png", ".gif", ".webp"):
            return f
    return None


def build_media_index(tweets_media_dir):
    """tweets_media/ のファイルを tweet_id でインデックス化"""
    index = {}
    base = tweets_media_dir.resolve()
    if not base.exists():
        return index
    for f in base.iterdir():
        if f.is_symlink():
            continue  # シンボリックリンク除外
        if not f.resolve().is_relative_to(base):
            continue
        if f.is_file() and f.suffix.lower() in (".jpg", ".jpeg", ".png", ".gif", ".webp"):
            tid = f.stem.split("-")[0]
            if tid not in index:  # 最初のマッチを採用
                index[tid] = f
    return index


def import_archive(archive_data_dir, dry_run=False):
    """Xアーカイブからおはついを一括インポート"""
    if dry_run:
        print("=== Dry Run モード（実際のアップロードは行いません）===")
        print()
        api_token = account_id = database_id = None
    else:
        # 1. 環境変数から認証情報取得（CF_API_TOKEN のみ必須）
        api_token = os.environ.get("CF_API_TOKEN", "").strip()
        if not api_token:
            print("エラー: 環境変数 CF_API_TOKEN が未設定です")
            sys.exit(1)

        # Account ID: 環境変数があればそちらを優先、なければAPIから自動取得
        account_id = os.environ.get("CF_ACCOUNT_ID")
        if account_id:
            print(f"[import] Account ID (環境変数): {account_id[:8]}...")
        else:
            print("[import] Cloudflare Account ID を取得中...")
            account_id = get_account_id(api_token)
            print(f"[import] Account ID: {account_id[:8]}...")

        # D1 Database ID: 環境変数があればそちらを優先、なければAPIから自動取得
        database_id = os.environ.get("CF_D1_DATABASE_ID")
        if database_id:
            print(f"[import] Database ID (環境変数): {database_id[:8]}...")
        else:
            print("[import] D1 Database ID を取得中...")
            database_id = get_d1_database_id(api_token, account_id)
            print(f"[import] Database ID: {database_id[:8]}...")

    data_dir = Path(archive_data_dir)
    tweets_js_path = data_dir / "tweets.js"
    if not tweets_js_path.exists():
        # tweet.js の場合もある
        tweets_js_path = data_dir / "tweet.js"
    if not tweets_js_path.exists():
        print(f"[import] tweets.js が見つかりません: {data_dir}")
        sys.exit(1)

    tweets_media_dir = data_dir / "tweets_media"
    has_media_dir = tweets_media_dir.is_dir()
    if not has_media_dir:
        print("[import] tweets_media/ フォルダが見つかりません。画像アップロードはスキップします。")

    # 2. tweets.js パース
    print(f"[import] ファイルを読み込み中: {tweets_js_path}")
    all_tweets = parse_tweets_js(tweets_js_path)
    print(f"tweets.js から {len(all_tweets)} 件のツイートを読み込みました")

    # 3. リツイート・リプライ除外フィルタ
    retweet_count = 0
    reply_count = 0
    original_tweets = []
    for raw in all_tweets:
        text = raw.get("full_text") or raw.get("text") or ""
        # リツイート除外
        if text.startswith("RT @") or "retweeted_status" in raw:
            retweet_count += 1
            continue
        # リプライ除外
        reply_id = raw.get("in_reply_to_status_id") or raw.get("in_reply_to_status_id_str") or ""
        if str(reply_id).strip():
            reply_count += 1
            continue
        original_tweets.append(raw)

    print(f"リツイート除外: {retweet_count} 件")
    print(f"リプライ除外: {reply_count} 件")
    print(f"自分のオリジナルツイート: {len(original_tweets)} 件")

    # 4. おはついフィルタ + タイプ判定
    greetings = []
    for raw in original_tweets:
        text = raw.get("full_text") or raw.get("text") or ""
        if is_greeting(text):
            greetings.append(raw)

    # 5. 統計表示
    print(f"おはつい検出: {len(greetings)} 件 / {len(original_tweets)} 件")
    if not greetings:
        print("[import] 対象ツイートがありません。")
        return

    # 日付順にソート（parse_twitter_dateで日時オブジェクトに変換してソート）
    def _sort_key(t):
        try:
            return parse_twitter_date(t.get("created_at", ""))
        except Exception:
            return ""

    greetings.sort(key=_sort_key)

    # メディアインデックスの構築（ループ前に1回だけ）
    media_index = {}
    if has_media_dir:
        media_index = build_media_index(tweets_media_dir)

    # 5. 各おはついに対してD1登録 + 画像アップロード
    saved = 0
    img_uploaded = 0
    img_skipped = 0
    skipped = 0
    errors = 0
    type_counts = {}  # タイプ別カウント（dry-run用）
    has_image_count = 0  # 画像付きカウント（dry-run用）

    if dry_run:
        print()
        print("--- おはつい一覧 ---")

    for i, raw in enumerate(greetings):
        try:
            text = raw.get("full_text") or raw.get("text") or ""
            # メディア添付の t.co URL をテキストから除去（画像サムネイルリンクなので不要）
            clean_text = re.sub(r'\s*https?://t\.co/\S+', '', text).strip()
            tweet_id = raw.get("id_str") or raw.get("id", "")
            if not tweet_id or not str(tweet_id).strip():
                print(f"  [SKIP] ID不明のツイート")
                skipped += 1
                continue

            # image_url: entities.media[0].media_url_https があれば取得
            image_url = None
            entities = raw.get("entities") or {}
            media_list = entities.get("media") or []
            if media_list:
                image_url = media_list[0].get("media_url_https")

            tweet_data = {
                "id": tweet_id,
                "tweet_id": tweet_id,
                "text": clean_text,
                "created_at": parse_twitter_date(raw.get("created_at", "")),
                "image_url": image_url,
                "like_count": int(raw.get("favorite_count", 0)),
                "retweet_count": int(raw.get("retweet_count", 0)),
                "type": detect_type(text),
            }

            # タイプ別カウント
            t = tweet_data["type"]
            type_counts[t] = type_counts.get(t, 0) + 1

            # 画像有無カウント
            has_image = image_url is not None or (has_media_dir and tweet_id in media_index)
            if has_image:
                has_image_count += 1

            if dry_run:
                img_mark = "📷あり" if has_image else "📷なし"
                like_count = tweet_data["like_count"]
                rt_count = tweet_data["retweet_count"]
                text_preview = clean_text[:30].replace("\n", " ")
                print(f"[{i+1}/{len(greetings)}] {tweet_data['created_at']} | {tweet_data['type']} | ❤️{like_count} 🔄{rt_count} | {img_mark} | {text_preview}...")
                saved += 1
                continue

            # a. D1にINSERT OR REPLACE
            insert_tweet_to_d1(api_token, account_id, database_id, tweet_data)
            saved += 1
            print(f"  [{i+1}/{len(greetings)}] ✓ {tweet_id} [{tweet_data['type']}] {tweet_data['created_at'][:10]} \"{text[:20]}...\"")

            # b. メディアインデックスから該当画像を探す（REST API使用）
            if has_media_dir:
                media_file = media_index.get(tweet_id)
                if media_file:
                    r2_key = f"{R2_KEY_PREFIX}{tweet_id}.jpg"
                    exists = check_r2_exists_api(api_token, account_id, r2_key)
                    if not exists:
                        try:
                            buf = convert_local_image(media_file)
                            upload_to_r2_api(api_token, account_id, r2_key, buf)
                            img_uploaded += 1
                            print(f"    📷 画像アップロード完了: {r2_key}")
                        except Exception as e:
                            print(f"    ❌ 画像アップロード失敗 {tweet_id}: {type(e).__name__}: {e}")
                    else:
                        img_skipped += 1
                        print(f"    ⏭ 画像スキップ（既存）: {r2_key}")

            # c. レート制限: 0.2秒間隔
            time.sleep(0.2)

        except Exception as e:
            print(f"  [{i+1}/{len(greetings)}] [ERROR] ツイート処理失敗: {type(e).__name__}: {e}")
            errors += 1
            time.sleep(0.2)
            continue

    # 6. 結果サマリー表示
    print()
    if dry_run:
        print("--- サマリー ---")
        print(f"総ツイート数: {len(all_tweets)}")
        print(f"リツイート除外: {retweet_count}")
        print(f"リプライ除外: {reply_count}")
        print(f"オリジナルツイート: {len(original_tweets)}")
        print(f"おはつい検出数: {len(greetings)}")
        for t_name in sorted(type_counts.keys()):
            print(f"  {t_name}: {type_counts[t_name]}")
        print(f"画像付き: {has_image_count} / {len(greetings)}")
    else:
        print(f"\n--- サマリー ---")
        print(f"D1登録: {saved} 件")
        print(f"画像アップロード: {img_uploaded} 件")
        print(f"画像スキップ（既存）: {img_skipped} 件")
        print(f"エラー: {errors} 件")


def mode_d1(r2_client):
    """D1 のツイートデータから画像を取得してR2にアップロード"""
    api_token = get_env("CF_API_TOKEN")
    account_id = get_env("CF_ACCOUNT_ID")
    database_id = get_env("CF_D1_DATABASE_ID")

    print("[upload] D1 からツイート一覧を取得中...")
    tweets = fetch_tweets_from_d1(api_token, account_id, database_id)
    print(f"[upload] {len(tweets)} 件のツイート (画像あり)")

    uploaded = 0
    skipped = 0
    failed = 0

    for i, tweet in enumerate(tweets):
        tweet_id = tweet["id"]
        image_url = tweet["image_url"]
        r2_key = f"{R2_KEY_PREFIX}{tweet_id}.jpg"

        # 既にR2にある場合はスキップ
        if check_r2_exists(r2_client, r2_key):
            skipped += 1
            print(f"  [{i+1}/{len(tweets)}] skip (exists): {tweet_id}")
            continue

        try:
            buf = download_image(image_url)
            upload_to_r2(r2_client, r2_key, buf)
            uploaded += 1
            print(f"  [{i+1}/{len(tweets)}] ok: {tweet_id}")
        except Exception as e:
            failed += 1
            print(f"  [{i+1}/{len(tweets)}] FAIL: {tweet_id} - {type(e).__name__}")

        # レート制限対策
        time.sleep(0.2)

    print(f"\n[upload] 完了: {uploaded} 件アップロード, {skipped} 件スキップ, {failed} 件失敗")


def mode_archive(r2_client, archive_dir):
    """X アーカイブのメディアフォルダから画像をR2にアップロード"""
    media_path = Path(archive_dir)
    if not media_path.is_dir():
        print(f"ディレクトリが見つかりません: {archive_dir}")
        sys.exit(1)

    # tweets_media/ には {tweet_id}-{media_url_hash}.jpg 形式のファイルがある
    image_files = sorted(media_path.glob("*.*"))
    image_files = [f for f in image_files if f.suffix.lower() in (".jpg", ".jpeg", ".png", ".gif", ".webp")]
    print(f"[upload] {len(image_files)} 件のメディアファイルを検出")

    uploaded = 0
    skipped = 0
    failed = 0

    for i, file_path in enumerate(image_files):
        # ファイル名から tweet_id を抽出 (例: 1234567890-img.jpg → 1234567890)
        tweet_id = file_path.stem.split("-")[0]
        if not tweet_id.isdigit():
            print(f"  [{i+1}/{len(image_files)}] skip (invalid name): {file_path.name}")
            skipped += 1
            continue

        r2_key = f"{R2_KEY_PREFIX}{tweet_id}.jpg"

        if check_r2_exists(r2_client, r2_key):
            skipped += 1
            continue

        try:
            buf = convert_local_image(file_path)
            upload_to_r2(r2_client, r2_key, buf)
            uploaded += 1
            print(f"  [{i+1}/{len(image_files)}] ok: {tweet_id}")
        except Exception as e:
            failed += 1
            print(f"  [{i+1}/{len(image_files)}] FAIL: {tweet_id} - {type(e).__name__}")

    print(f"\n[upload] 完了: {uploaded} 件アップロード, {skipped} 件スキップ, {failed} 件失敗")


def main():
    parser = argparse.ArgumentParser(description="おはついDB 画像一括アップロード")
    parser.add_argument(
        "--archive",
        help="X アーカイブの tweets_media/ ディレクトリパス (指定時はローカルファイルから読み込み)",
    )
    parser.add_argument(
        "--import-archive",
        type=str,
        help="Xアーカイブのdataディレクトリパスを指定して一括インポート",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="実際のアップロード/DB登録をせずに検出結果のみ表示",
    )
    args = parser.parse_args()

    if args.import_archive:
        import_archive(args.import_archive, dry_run=args.dry_run)
    elif args.archive:
        account_id = get_env("CF_ACCOUNT_ID")
        access_key_id = get_env("CF_R2_ACCESS_KEY_ID")
        secret_access_key = get_env("CF_R2_SECRET_ACCESS_KEY")
        r2_client = create_r2_client(account_id, access_key_id, secret_access_key)
        mode_archive(r2_client, args.archive)
    else:
        account_id = get_env("CF_ACCOUNT_ID")
        access_key_id = get_env("CF_R2_ACCESS_KEY_ID")
        secret_access_key = get_env("CF_R2_SECRET_ACCESS_KEY")
        r2_client = create_r2_client(account_id, access_key_id, secret_access_key)
        mode_d1(r2_client)


if __name__ == "__main__":
    main()
