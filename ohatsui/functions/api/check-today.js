/**
 * GET /api/check-today
 * 今日（JST）のおはついが登録済みかどうかをチェックするエンドポイント。
 *
 * 認証: COLLECT_SECRET による Bearer トークン認証（refresh-today.js と同一方式）
 * GitHub Actions cron から毎日 JST 11:00 に呼び出される想定。
 *
 * レスポンス:
 *   登録あり: { found: true,  tweet_count: n, date, types_found: [...], types_missing: [...] }
 *   登録なし: { found: false, tweet_count: 0, date, types_found: [],  types_missing: [...] }
 */

const GREETING_TYPES = ['ohachoco', 'konchoco', 'konbanchoco'];

/**
 * トークンと秘密をSHA-256でハッシュ化して定数時間比較（長さ漏洩防止）
 *
 * !! この関数は refresh-today.js / collect.js と同一実装です。
 * !! 変更時は全ファイルを同期してください。
 * TODO: shared/auth.js に共通化
 */
async function timingSafeCompare(token, secret) {
    const enc = new TextEncoder();
    const [hashA, hashB] = await Promise.all([
        crypto.subtle.digest('SHA-256', enc.encode(token)),
        crypto.subtle.digest('SHA-256', enc.encode(secret)),
    ]);
    return crypto.subtle.timingSafeEqual(hashA, hashB);
}

export async function onRequestGet({ request, env }) {
    // ── 認証チェック ──────────────────────────────────────────────
    // refresh-today.js L44-52 と同一パターン
    const secret = env.COLLECT_SECRET;
    if (!secret) {
        return Response.json({ error: 'COLLECT_SECRET not configured' }, { status: 503 });
    }
    const authHeader = request.headers.get('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!(await timingSafeCompare(token, secret))) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!env.DB) {
        return Response.json({ error: 'DB not configured' }, { status: 503 });
    }

    // ── JST 今日の日付範囲計算 ──────────────────────────────────────
    // !! refresh-today.js L59-64 と同一ロジック。変更時は同期してください。
    const now = new Date();
    const jstOffset = 9 * 60 * 60 * 1000;
    const jstNow = new Date(now.getTime() + jstOffset);
    const todayStr = jstNow.toISOString().slice(0, 10); // "YYYY-MM-DD"
    const startUtc = new Date(`${todayStr}T00:00:00+09:00`).toISOString();
    const endUtc   = new Date(`${todayStr}T23:59:59.999+09:00`).toISOString();

    try {
        // ── D1 クエリ ─────────────────────────────────────────────
        // 挨拶タイプのみ取得（sonota は SQL 側で除外）
        const { results: greetingTweets } = await env.DB.prepare(
            'SELECT id, type, created_at FROM tweets' +
            ' WHERE created_at >= ?1 AND created_at <= ?2' +
            ' AND type IN (\'ohachoco\', \'konchoco\', \'konbanchoco\')' +
            ' ORDER BY created_at ASC'
        ).bind(startUtc, endUtc).all();

        // 登録済みタイプと未登録タイプを集計
        const typesFound   = [...new Set(greetingTweets.map(t => t.type))];
        const typesMissing = GREETING_TYPES.filter(t => !typesFound.includes(t));

        const responseBody = {
            found:          greetingTweets.length > 0,
            tweet_count:    greetingTweets.length,
            date:           todayStr,
            types_found:    typesFound,
            types_missing:  typesMissing,
        };

        return Response.json(responseBody, {
            headers: {
                'Cache-Control': 'no-cache',
                'Access-Control-Allow-Origin': '*',
            },
        });
    } catch (err) {
        console.error('[check-today] error:', err);
        return Response.json({ error: 'Internal server error' }, { status: 500 });
    }
}
