#!/usr/bin/env bash
set -euo pipefail

#=============================================================================
# ohatui-db 環境構築スクリプト
#
# Cloudflare 上に以下のリソースを作成・設定します:
#   1. Pages プロジェクト (ohatui-db)
#   2. D1 データベース (ohatui-tweets) + スキーマ適用
#   3. R2 バケット (ohatui-images)
#   4. Pages プロジェクトへの D1/R2 バインディング設定
#   5. wrangler.toml へのバインディング追記
#
# 使い方:
#   1. .env を編集して CF_API_TOKEN を設定
#   2. chmod +x setup.sh && ./setup.sh
#
# ※ 冪等設計: 既存リソースはスキップされるため何度実行しても安全です
#=============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OHATSUI_DIR="$SCRIPT_DIR/ohatsui"

# ---------- .env 読み込み ----------
if [ -f "$SCRIPT_DIR/.env" ]; then
  echo "[setup] .env を読み込み中..."
  set -a
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/.env"
  set +a
else
  echo "[setup] ERROR: .env が見つかりません。"
  exit 1
fi

if [ -z "${CF_API_TOKEN:-}" ]; then
  echo "[setup] ERROR: CF_API_TOKEN が設定されていません。"
  exit 1
fi

# ---------- デフォルト値 ----------
CF_PAGES_PROJECT="${CF_PAGES_PROJECT:-ohatui-db}"
CF_D1_DATABASE_NAME="${CF_D1_DATABASE_NAME:-ohatui-tweets}"
CF_R2_BUCKET_NAME="${CF_R2_BUCKET_NAME:-ohatui-images}"

CF_API="https://api.cloudflare.com/client/v4"
AUTH_HEADER="Authorization: Bearer $CF_API_TOKEN"

# ---------- ヘルパー ----------
cf_get()  { curl -sf -H "$AUTH_HEADER" "$1"; }
cf_post() { curl -sf -X POST -H "$AUTH_HEADER" -H "Content-Type: application/json" -d "$2" "$1"; }
cf_patch(){ curl -sf -X PATCH -H "$AUTH_HEADER" -H "Content-Type: application/json" -d "$2" "$1"; }

echo ""
echo "=========================================="
echo "  ohatui-db 環境構築開始"
echo "=========================================="

# ================================================================
# 1. Cloudflare Account ID 取得
# ================================================================
echo ""
echo "[1/5] Cloudflare Account ID を取得..."
if [ -n "${CF_ACCOUNT_ID:-}" ]; then
  echo "  .env から取得: $CF_ACCOUNT_ID"
else
  CF_ACCOUNT_ID=$(cf_get "$CF_API/accounts" | jq -r '.result[0].id')
  if [ -z "$CF_ACCOUNT_ID" ] || [ "$CF_ACCOUNT_ID" = "null" ]; then
    echo "  ERROR: Account ID を取得できません。CF_API_TOKEN を確認してください。"
    exit 1
  fi
  echo "  API から取得: $CF_ACCOUNT_ID"
fi

# ================================================================
# 2. Pages プロジェクト作成
# ================================================================
echo ""
echo "[2/5] Pages プロジェクト '$CF_PAGES_PROJECT' を確認..."
STATUS=$(cf_get "$CF_API/accounts/$CF_ACCOUNT_ID/pages/projects/$CF_PAGES_PROJECT" \
  | jq -r '.success // "false"')

if [ "$STATUS" = "true" ]; then
  echo "  既に存在。スキップ。"
else
  echo "  作成中..."
  cf_post "$CF_API/accounts/$CF_ACCOUNT_ID/pages/projects" \
    "{\"name\":\"$CF_PAGES_PROJECT\",\"production_branch\":\"main\"}" > /dev/null
  echo "  作成完了。"
fi

# ================================================================
# 3. D1 データベース作成 + スキーマ適用
# ================================================================
echo ""
echo "[3/5] D1 データベース '$CF_D1_DATABASE_NAME' を確認..."

if [ -n "${CF_D1_DATABASE_ID:-}" ]; then
  echo "  .env から取得: $CF_D1_DATABASE_ID"
else
  DB_LIST=$(cf_get "$CF_API/accounts/$CF_ACCOUNT_ID/d1/database?per_page=100")
  CF_D1_DATABASE_ID=$(echo "$DB_LIST" \
    | jq -r ".result[] | select(.name == \"$CF_D1_DATABASE_NAME\") | .uuid // empty" \
    | head -1)

  if [ -z "$CF_D1_DATABASE_ID" ]; then
    echo "  作成中..."
    CREATE_RESP=$(cf_post "$CF_API/accounts/$CF_ACCOUNT_ID/d1/database" \
      "{\"name\":\"$CF_D1_DATABASE_NAME\"}")
    CF_D1_DATABASE_ID=$(echo "$CREATE_RESP" | jq -r '.result.uuid // empty')
    if [ -z "$CF_D1_DATABASE_ID" ]; then
      echo "  ERROR: D1 作成失敗。"
      echo "$CREATE_RESP" | jq .
      exit 1
    fi
    echo "  作成完了: $CF_D1_DATABASE_ID"
  else
    echo "  既に存在: $CF_D1_DATABASE_ID"
  fi
fi

echo "  スキーマ適用中..."
SCHEMA_SQL=$(sed 's/--.*$//' "$OHATSUI_DIR/schema.sql" | tr '\n' ' ')
SCHEMA_RESP=$(curl -s -X POST \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d "{\"sql\":\"$SCHEMA_SQL\"}" \
  "$CF_API/accounts/$CF_ACCOUNT_ID/d1/database/$CF_D1_DATABASE_ID/query")
SCHEMA_OK=$(echo "$SCHEMA_RESP" | jq -r '.success // "false"')
if [ "$SCHEMA_OK" = "true" ]; then
  echo "  スキーマ適用完了。"
else
  echo "  WARNING: スキーマ適用に問題:"
  echo "$SCHEMA_RESP" | jq '{success, errors}' 2>/dev/null || echo "$SCHEMA_RESP"
fi

# ================================================================
# 4. R2 バケット作成
# ================================================================
echo ""
echo "[4/5] R2 バケット '$CF_R2_BUCKET_NAME' を確認..."
R2_LIST=$(cf_get "$CF_API/accounts/$CF_ACCOUNT_ID/r2/buckets")
BUCKET_EXISTS=$(echo "$R2_LIST" \
  | jq -r ".result.buckets[] | select(.name == \"$CF_R2_BUCKET_NAME\") | .name // empty" \
  2>/dev/null | head -1)

if [ -z "$BUCKET_EXISTS" ]; then
  echo "  作成中..."
  cf_post "$CF_API/accounts/$CF_ACCOUNT_ID/r2/buckets" \
    "{\"name\":\"$CF_R2_BUCKET_NAME\"}" > /dev/null
  echo "  作成完了。"
else
  echo "  既に存在。スキップ。"
fi

# ================================================================
# 5. Pages バインディング設定 (D1 + R2 + COLLECT_SECRET)
# ================================================================
echo ""
echo "[5/5] Pages プロジェクトにバインディングを設定..."

if [ -n "${COLLECT_SECRET:-}" ]; then
  PATCH_BODY="{\"deployment_configs\":{\"production\":{\"d1_databases\":{\"DB\":{\"id\":\"$CF_D1_DATABASE_ID\"}},\"r2_buckets\":{\"IMAGES\":{\"name\":\"$CF_R2_BUCKET_NAME\"}},\"env_vars\":{\"COLLECT_SECRET\":{\"value\":\"$COLLECT_SECRET\",\"type\":\"secret_text\"}}},\"preview\":{\"d1_databases\":{\"DB\":{\"id\":\"$CF_D1_DATABASE_ID\"}},\"r2_buckets\":{\"IMAGES\":{\"name\":\"$CF_R2_BUCKET_NAME\"}},\"env_vars\":{\"COLLECT_SECRET\":{\"value\":\"$COLLECT_SECRET\",\"type\":\"secret_text\"}}}}}"
  echo "  D1 + R2 + COLLECT_SECRET を設定。"
else
  PATCH_BODY="{\"deployment_configs\":{\"production\":{\"d1_databases\":{\"DB\":{\"id\":\"$CF_D1_DATABASE_ID\"}},\"r2_buckets\":{\"IMAGES\":{\"name\":\"$CF_R2_BUCKET_NAME\"}}},\"preview\":{\"d1_databases\":{\"DB\":{\"id\":\"$CF_D1_DATABASE_ID\"}},\"r2_buckets\":{\"IMAGES\":{\"name\":\"$CF_R2_BUCKET_NAME\"}}}}}"
  echo "  D1 + R2 を設定 (COLLECT_SECRET は未設定)。"
fi

PATCH_RESP=$(cf_patch "$CF_API/accounts/$CF_ACCOUNT_ID/pages/projects/$CF_PAGES_PROJECT" "$PATCH_BODY")
PATCH_OK=$(echo "$PATCH_RESP" | jq -r '.success // "false"')
if [ "$PATCH_OK" = "true" ]; then
  echo "  バインディング設定完了。"
else
  echo "  WARNING: バインディング設定に問題:"
  echo "$PATCH_RESP" | jq '{success, errors}' 2>/dev/null || echo "$PATCH_RESP"
fi

# wrangler.toml にバインディング追記
WRANGLER_TOML="$OHATSUI_DIR/wrangler.toml"
if ! grep -q 'd1_databases' "$WRANGLER_TOML" 2>/dev/null; then
  printf '\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "%s"\ndatabase_id = "%s"\n' \
    "$CF_D1_DATABASE_NAME" "$CF_D1_DATABASE_ID" >> "$WRANGLER_TOML"
  echo "  wrangler.toml に D1 バインディング追記。"
fi
if ! grep -q 'r2_buckets' "$WRANGLER_TOML" 2>/dev/null; then
  printf '\n[[r2_buckets]]\nbinding = "IMAGES"\nbucket_name = "%s"\n' \
    "$CF_R2_BUCKET_NAME" >> "$WRANGLER_TOML"
  echo "  wrangler.toml に R2 バインディング追記。"
fi

# ---------- .env に自動取得した値を書き戻す ----------
NEEDS_WRITE=false
if ! grep -q "^CF_ACCOUNT_ID=" "$SCRIPT_DIR/.env" 2>/dev/null; then
  NEEDS_WRITE=true
fi
if ! grep -q "^CF_D1_DATABASE_ID=" "$SCRIPT_DIR/.env" 2>/dev/null; then
  NEEDS_WRITE=true
fi
if [ "$NEEDS_WRITE" = true ]; then
  {
    echo ""
    echo "# --- setup.sh により自動設定 ---"
    grep -q "^CF_ACCOUNT_ID=" "$SCRIPT_DIR/.env" 2>/dev/null \
      || echo "CF_ACCOUNT_ID=$CF_ACCOUNT_ID"
    grep -q "^CF_D1_DATABASE_ID=" "$SCRIPT_DIR/.env" 2>/dev/null \
      || echo "CF_D1_DATABASE_ID=$CF_D1_DATABASE_ID"
  } >> "$SCRIPT_DIR/.env"
fi

# ---------- 結果表示 ----------
SUBDOMAIN=$(cf_get "$CF_API/accounts/$CF_ACCOUNT_ID/pages/projects/$CF_PAGES_PROJECT" \
  | jq -r '.result.subdomain // empty')

echo ""
echo "=========================================="
echo "  環境構築完了!"
echo ""
echo "  Pages:    $CF_PAGES_PROJECT"
echo "  D1:       $CF_D1_DATABASE_NAME ($CF_D1_DATABASE_ID)"
echo "  R2:       $CF_R2_BUCKET_NAME"
echo "  本番 URL: https://${SUBDOMAIN:-$CF_PAGES_PROJECT.pages.dev}"
echo ""
echo "  デプロイは GitHub Actions (push) または手動で:"
echo "    cd ohatsui && wrangler pages deploy . --project-name=$CF_PAGES_PROJECT"
echo "=========================================="
