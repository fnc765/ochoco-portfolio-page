---
name: github-actions-deployment
description: このリポジトリの GitHub Actions ワークフロー (.github/workflows/) の構造、Secrets/Variables の一覧、Cloudflare Pages デプロイ、定期実行 (cron) ジョブ、Discord 通知、後デプロイ検証パターンを整理したスキル。新しい cron ワークフローや Cloudflare 連携ステップを追加するときの参考書。
---

# GitHub Actions / Cloudflare デプロイ スキル

## このスキルが有効なケース

- 新しい GitHub Actions ワークフローを追加するとき
- Cloudflare Pages への自動デプロイ設定を変更するとき
- 定期実行 (cron) ジョブを追加・修正するとき
- Discord 通知ステップを追加するとき
- Secrets/Variables を追加するとき
- GitHub Actions のシェルスクリプトで Cloudflare API を叩くパターンを真似たいとき

## ワークフロー一覧

```
.github/workflows/
├── deploy-cloudflare-pages.yml   # main / ohatui-db への push で自動デプロイ
├── refresh-today-tweets.yml      # 毎時 0 分 (JST 6:00-23:00) エンゲージメント更新
└── check-ohatsui-today.yml       # 毎日 JST 11:00 におはつい未登録を Discord 通知
```

| ワークフロー | トリガ | 認証 | 主な処理 |
|---|---|---|---|
| `deploy-cloudflare-pages.yml` | push to main/ohatui-db, workflow_dispatch | CF_API_TOKEN, CF_ACCOUNT_ID (var) | D1/R2 バケット作成 → バインディング設定 → `wrangler pages deploy` → post-deploy 検証 |
| `refresh-today-tweets.yml` | cron `0 21-23,0-14 * * *`, workflow_dispatch | COLLECT_SECRET | `/api/refresh-today` を curl |
| `check-ohatsui-today.yml` | cron `0 2 * * *`, workflow_dispatch | COLLECT_SECRET, DISCORD_WEBHOOK_URL | `/api/check-today` → 未登録時 Discord webhook |

## Secrets / Variables

### Repository Secrets (Settings > Secrets and variables > Actions)

| 名前 | 用途 | 使う workflow |
|---|---|---|
| `CF_API_TOKEN` | Cloudflare API トークン（D1/R2/Pages 操作用） | deploy |
| `COLLECT_SECRET` | `/api/collect`, `/api/refresh-today` 認証用 Bearer トークン | deploy, refresh, check |
| `DISCORD_WEBHOOK_URL` | Discord 通知 webhook URL | check |

### Repository Variables (Settings > Variables)

| 名前 | 用途 | 使う workflow |
|---|---|---|
| `CF_ACCOUNT_ID` | Cloudflare アカウント ID | deploy |

**Variables と Secrets の使い分け:**
- **Variables**: 漏洩しても実害がない値（アカウント ID、公開 URL）
- **Secrets**: 漏洩すると悪用される値（API トークン、Webhook URL、Bearer トークン）

## Cloudflare 連携の定型パターン

### アカウント ID の取得

```yaml
- name: Set Cloudflare Account ID
  id: cf-account
  run: echo "account_id=${{ vars.CF_ACCOUNT_ID }}" >> "$GITHUB_OUTPUT"
```

後続ステップで `${{ steps.cf-account.outputs.account_id }}` として参照。

### Cloudflare API への curl

```yaml
- name: List D1 databases
  run: |
    ACCOUNT_ID="${{ steps.cf-account.outputs.account_id }}"
    curl -s \
      -H "Authorization: Bearer $CF_API_TOKEN" \
      "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/d1/database?per_page=100"
```

### JSON パース (jq)

```yaml
- name: Get D1 database ID
  run: |
    DB_LIST=$(curl -s -H "Authorization: Bearer $CF_API_TOKEN" \
      "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/d1/database?per_page=100")
    DB_ID=$(echo "$DB_LIST" | jq -r '.result[] | select(.name == "ohatui-tweets") | .uuid // empty' | head -1)
    echo "DB_ID=$DB_ID"
```

### 安全な jq 抽出

```bash
# `// empty` で欠落時に空文字にフォールバック
DB_ID=$(echo "$DB_LIST" | jq -r '.result[].uuid // empty')

# 型変換失敗を避けるため `// "0"` や `// "false"` を付ける
UPDATED_COUNT=$(echo "$RESPONSE" | jq '.updated | length // 0')
```

### バインディング設定 (Pages プロジェクト PATCH)

```yaml
- name: Set D1 + R2 bindings
  run: |
    ACCOUNT_ID="${{ steps.cf-account.outputs.account_id }}"
    PROJECT_NAME="ochoco-portfolio"
    DB_ID="${{ steps.setup-db.outputs.db_id }}"

    BASE_CONFIG=$(jq -n \
      --arg db_id "$DB_ID" \
      '{
        d1_databases: { DB: { id: $db_id } },
        r2_buckets: { IMAGES: { name: "ohatui-images" } }
      }')

    COLLECT_SECRET_VAL="${{ secrets.COLLECT_SECRET }}"
    if [ -n "$COLLECT_SECRET_VAL" ]; then
      ENV_CONFIG=$(jq -n --arg secret "$COLLECT_SECRET_VAL" \
        '{ env_vars: { COLLECT_SECRET: { value: $secret, type: "secret_text" } } }')
      FULL_CONFIG=$(echo "$BASE_CONFIG $ENV_CONFIG" | jq -s 'add')
    else
      FULL_CONFIG="$BASE_CONFIG"
    fi

    PATCH_BODY=$(jq -n \
      --argjson prod "$FULL_CONFIG" \
      --argjson prev "$FULL_CONFIG" \
      '{ deployment_configs: { production: $prod, preview: $prev } }')

    curl -s -X PATCH \
      -H "Authorization: Bearer $CF_API_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$PATCH_BODY" \
      "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/$PROJECT_NAME"
```

## デプロイ

`cloudflare/wrangler-action@v3` を使う:

```yaml
- name: Deploy to Cloudflare Pages
  uses: cloudflare/wrangler-action@v3
  with:
    apiToken: ${{ env.CF_API_TOKEN }}
    accountId: ${{ steps.cf-account.outputs.account_id }}
    wranglerVersion: "3.99.0"
    workingDirectory: particleAnimation
    command: pages deploy --project-name=ochoco-portfolio --commit-dirty=true --commit-hash=${{ github.sha }} --commit-message="deploy ${{ github.sha }}"
```

**注意:**
- `workingDirectory` は Pages の出力ディレクトリ（`particleAnimation`）
- 関数 (`ohatsui/functions/`) は事前に `cp -r ohatsui/functions particleAnimation/functions` でコピー
- `version.json` を生成してコミットハッシュを含める → フロントで git commit 表示

## cron ワークフローの書き方

### UTC 変換の注意

cron は UTC 基準。JST の指定時刻 -9h。

| JST | cron (UTC) |
|---|---|
| 毎時 0 分 (JST 6:00-23:00) | `0 21-23,0-14 * * *` |
| 毎日 JST 11:00 | `0 2 * * *` |
| 毎日 JST 0:00 | `0 15 * * *` |

### workflow_dispatch を必ず付ける

手動実行できないとデバッグできない:

```yaml
on:
  schedule:
    - cron: '0 2 * * *'
  workflow_dispatch:
```

### 失敗を致命的エラーにしない

cron ワークフローは 1 回失敗しても問題ない場合が多い。`exit 0` で握りつぶす:

```yaml
HTTP_CODE=$(curl -sS --retry 3 --retry-delay 5 --retry-max-time 30 \
  -w '%{http_code}' -o /tmp/response.json ...)

if [ "$HTTP_CODE" != "200" ]; then
  echo "::error::API returned HTTP $HTTP_CODE (expected 200)"
  # outputs を埋めてから exit 0（次回を待つ）
  echo "found=error" >> "$GITHUB_OUTPUT"
  exit 0
fi
```

## Discord 通知パターン

```yaml
- name: Notify Discord
  if: steps.check.outputs.found == 'false' && env.DISCORD_WEBHOOK_URL != ''
  run: |
    PAYLOAD=$(jq -n \
      --arg content "【おはつい通知】${{ steps.check.outputs.date }} のおはついがまだ登録されていません！" \
      --arg missing "${{ steps.check.outputs.missing }}" \
      '{
        content: $content,
        embeds: [{
          title: "⚠️ おはつい未登録",
          description: "未登録タイプ: \($missing)",
          color: 16711680,
          fields: [
            { name: "日付", value: $date, inline: true }
          ],
          footer: { text: "登録する: https://ochoco-portfolio.pages.dev/ohatsui-db/admin/" }
        }]
      }')

    curl -sS -X POST \
      -H "Content-Type: application/json" \
      -d "$PAYLOAD" \
      "$DISCORD_WEBHOOK_URL"
```

**Webhook URL は `${{ env.DISCORD_WEBHOOK_URL }}`（env スコープ）**で参照。`secrets.DISCORD_WEBHOOK_URL` は if 条件式の中では展開できないので注意。

## Post-deploy validation

`deploy-cloudflare-pages.yml` の `Post-deploy validation - fetch-tweet API` ステップが参考になる:

```yaml
- name: Post-deploy validation
  continue-on-error: true  # 検証失敗でデプロイ全体を止めない
  run: |
    # 15秒待機（エッジ伝播）
    sleep 15

    # デプロイ URL 取得
    CF_DEPLOY_RESP=$(curl -sf -H "Authorization: Bearer $CF_API_TOKEN" \
      "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/$PROJECT_NAME/deployments?per_page=1")
    DEPLOY_URL=$(echo "$CF_DEPLOY_RESP" | jq -r '.result[0].url // empty')

    # フォールバック: subdomain
    if [ -z "$DEPLOY_URL" ]; then
      SUBDOMAIN=$(curl -sf ... | jq -r '.result.subdomain')
      DEPLOY_URL="https://$SUBDOMAIN"
    fi

    # 検証対象 API 呼び出し
    API_URL="$DEPLOY_URL/api/fetch-tweet?url=..."
    HTTP_CODE=$(curl -s -o /tmp/resp.txt -w "%{http_code}" "$API_URL")
    RESPONSE=$(cat /tmp/resp.txt)

    # JSON 妥当性
    if ! echo "$RESPONSE" | jq . >/dev/null 2>&1; then
      echo "FAIL: not JSON (HTTP $HTTP_CODE)"
      exit 1
    fi

    # 必須フィールド検証
    ERRORS=0
    [ -z "$(echo "$RESPONSE" | jq -r '.text // ""')" ] && ERRORS=$((ERRORS+1))
    # ... 各フィールド ...

    # サマリ出力
    {
      echo "## Post-deploy validation"
      echo "### API URL: $API_URL"
      echo "### HTTP Status: $HTTP_CODE"
      echo "### Response body"
      echo '```json'
      echo "$RESPONSE"
      echo '```'
    } >> "$GITHUB_STEP_SUMMARY"

    exit $ERRORS
```

**ポイント:**
- `continue-on-error: true` で検証失敗が他のステップを止めない
- `sleep 15` でエッジ伝播を待つ（Cloudflare Pages は世界中エッジに反映されるまで数秒）
- `$GITHUB_STEP_SUMMARY` に書き出すと GitHub Actions の Summary タブで見やすい
- フォールバック URL（subdomain）は環境変数で他ステップでも使えるように `$GITHUB_ENV` に書く

## GitHub Actions の制約Tips

### `if` 条件式でのシークレット参照

```yaml
# ❌ 動かない（secrets は if 式で展開不可）
if: ${{ secrets.DISCORD_WEBHOOK_URL != '' }}

# ✅ env 経由で参照
env:
  DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
if: env.DISCORD_WEBHOOK_URL != ''
```

### ステップ間データ共有

```yaml
- name: Step A
  id: step-a
  run: echo "result=foo" >> "$GITHUB_OUTPUT"

- name: Step B
  run: echo "${{ steps.step-a.outputs.result }}"
```

複数行出力は heredoc:

```bash
cat >> "$GITHUB_OUTPUT" <<EOF
key1=value1
key2=value2
EOF
```

## 新しい cron ワークフローを追加するときのチェックリスト

- [ ] スケジュールは UTC で書く（JST-9h）
- [ ] `workflow_dispatch` を `on:` に追加（手動実行用）
- [ ] 必要な Secrets を `secrets.` で参照
- [ ] 認証付き API の場合 `Authorization: Bearer` ヘッダを付ける
- [ ] HTTP 200 以外は警告に留め `exit 0` で workflow を成功させる
- [ ] `$GITHUB_STEP_SUMMARY` に結果サマリを書き出す
- [ ] Discord 通知は Webhook URL が空ならスキップ（env + if 条件）
- [ ] コミットメッセージ: `ci: ...` の prefix
