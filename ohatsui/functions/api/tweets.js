/**
 * GET /api/tweets
 * Cloudflare Pages Functions — D1 からツイート一覧を返す
 *
 * バインディング: env.DB → D1 database "ohatui-tweets"
 * (Cloudflare Pages プロジェクト設定 > Functions > D1 database bindings で設定)
 */
export async function onRequestGet({ env }) {
    if (!env.DB) {
        return Response.json(
            { error: 'D1 database not bound. Please configure DB binding in Pages settings.' },
            { status: 503 }
        );
    }

    try {
        const { results } = await env.DB.prepare(
            'SELECT id, tweet_id, text, created_at, image_url, like_count, retweet_count, type' +
            ' FROM tweets ORDER BY created_at ASC'
        ).all();

        return Response.json(results, {
            headers: {
                'Cache-Control': 'public, max-age=300',  // 5分キャッシュ
                'Access-Control-Allow-Origin': '*',
            },
        });
    } catch (err) {
        console.error('D1 query error:', err);
        return Response.json({ error: 'Internal server error' }, { status: 500 });
    }
}
