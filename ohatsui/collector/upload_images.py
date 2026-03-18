#!/usr/bin/env python3
"""
おはついDB 画像一括アップロードスクリプト

D1 に登録済みのツイートの画像を取得し、150×150 にリサイズして
R2 バケット (ohatui-images) に thumbnails/{tweet_id}.jpg として保存する。

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

──────────────────────────────────────
"""

import argparse
import io
import json
import os
import sys
import time
from pathlib import Path

try:
    import boto3
    import requests
    from botocore.exceptions import ClientError as BotoClientError
    from PIL import Image
except ImportError as e:
    print(f"必要なパッケージが不足: {e}")
    print("pip install pillow boto3 requests")
    sys.exit(1)

THUMB_SIZE = (150, 150)
R2_BUCKET = "ohatui-images"
R2_KEY_PREFIX = "thumbnails/"


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
    except BotoClientError:
        return False


def download_and_resize(image_url):
    """画像をダウンロードして 150×150 にリサイズ"""
    # pbs.twimg.com の場合は小サイズを取得
    if "pbs.twimg.com" in image_url:
        # URL パラメータで小サイズ指定
        sep = "&" if "?" in image_url else "?"
        image_url = f"{image_url}{sep}format=jpg&name=thumb"

    resp = requests.get(image_url, headers={"User-Agent": "bot"}, timeout=30)
    resp.raise_for_status()

    img = Image.open(io.BytesIO(resp.content))
    img = img.convert("RGB")

    # アスペクト比を保ちつつ 150×150 にクロップ
    img.thumbnail((max(THUMB_SIZE), max(THUMB_SIZE)), Image.LANCZOS)
    # 正方形にクロップ
    w, h = img.size
    left = (w - THUMB_SIZE[0]) // 2
    top = (h - THUMB_SIZE[1]) // 2
    img = img.crop((left, top, left + THUMB_SIZE[0], top + THUMB_SIZE[1]))

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    buf.seek(0)
    return buf


def resize_local_image(file_path):
    """ローカル画像ファイルを 150×150 にリサイズ"""
    img = Image.open(file_path)
    img = img.convert("RGB")

    img.thumbnail((max(THUMB_SIZE), max(THUMB_SIZE)), Image.LANCZOS)
    w, h = img.size
    left = (w - THUMB_SIZE[0]) // 2
    top = (h - THUMB_SIZE[1]) // 2
    img = img.crop((left, top, left + THUMB_SIZE[0], top + THUMB_SIZE[1]))

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
            buf = download_and_resize(image_url)
            upload_to_r2(r2_client, r2_key, buf)
            uploaded += 1
            print(f"  [{i+1}/{len(tweets)}] ok: {tweet_id}")
        except Exception as e:
            failed += 1
            print(f"  [{i+1}/{len(tweets)}] FAIL: {tweet_id} - {e}")

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
            buf = resize_local_image(file_path)
            upload_to_r2(r2_client, r2_key, buf)
            uploaded += 1
            print(f"  [{i+1}/{len(image_files)}] ok: {tweet_id}")
        except Exception as e:
            failed += 1
            print(f"  [{i+1}/{len(image_files)}] FAIL: {tweet_id} - {e}")

    print(f"\n[upload] 完了: {uploaded} 件アップロード, {skipped} 件スキップ, {failed} 件失敗")


def main():
    parser = argparse.ArgumentParser(description="おはついDB 画像一括アップロード")
    parser.add_argument(
        "--archive",
        help="X アーカイブの tweets_media/ ディレクトリパス (指定時はローカルファイルから読み込み)",
    )
    args = parser.parse_args()

    account_id = get_env("CF_ACCOUNT_ID")
    access_key_id = get_env("CF_R2_ACCESS_KEY_ID")
    secret_access_key = get_env("CF_R2_SECRET_ACCESS_KEY")

    r2_client = create_r2_client(account_id, access_key_id, secret_access_key)

    if args.archive:
        mode_archive(r2_client, args.archive)
    else:
        mode_d1(r2_client)


if __name__ == "__main__":
    main()
