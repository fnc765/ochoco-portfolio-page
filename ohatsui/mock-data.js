/**
 * おはついアーカイブ モックデータ
 * 将来的にはCloudflare Workers APIから取得する
 */
const MOCK_TWEETS = (() => {
    const types = [
        { keyword: "おはちょこ", type: "ohachoco", weight: 7 },
        { keyword: "こんちょこ", type: "konchoco", weight: 2 },
        { keyword: "こんばんちょこ", type: "konbanchoco", weight: 1 }
    ];

    const greetings = {
        ohachoco: [
            "おはちょこ〜！今日もいい天気！",
            "おはちょこ！今日も元気にいくよ〜",
            "おはちょこ〜 ねむい…でもがんばる！",
            "おはちょこ！！朝からVRChatだよ〜",
            "おはちょこ〜 今日は何しようかな",
            "おはちょこ！みんなおはよ〜！",
            "おはちょこ〜 いい朝だね！",
            "おはちょこ！今日も一日よろしく〜",
            "おはちょこ〜 コーヒー飲んでる",
            "おはちょこ！新しいアバターお披露目！"
        ],
        konchoco: [
            "こんちょこ〜！午後からも頑張るよ",
            "こんちょこ！お昼ごはん食べた〜",
            "こんちょこ〜 今日も楽しい一日！",
            "こんちょこ！午後のワールド巡り開始〜"
        ],
        konbanchoco: [
            "こんばんちょこ〜！今日もお疲れ様！",
            "こんばんちょこ！夜のVRChatタイム",
            "こんばんちょこ〜 今日も楽しかった！",
            "こんばんちょこ！みんなおやすみ〜"
        ]
    };

    const hashtags = ["#VRChat", "#おはつい", "#VRChat_おはつい"];

    const tweets = [];
    const startDate = new Date("2024-04-01");
    const endDate = new Date("2026-03-14");
    let tweetId = 1000000000;

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        // 95%の確率でおはついする（たまにサボる）
        if (Math.random() > 0.95) continue;

        // タイプをランダムに選択（重み付き）
        const totalWeight = types.reduce((sum, t) => sum + t.weight, 0);
        let rand = Math.random() * totalWeight;
        let selectedType = types[0];
        for (const t of types) {
            rand -= t.weight;
            if (rand <= 0) {
                selectedType = t;
                break;
            }
        }

        // 投稿時間を設定
        let hour, minute;
        if (selectedType.type === "ohachoco") {
            hour = 6 + Math.floor(Math.random() * 5); // 6-10時
            minute = Math.floor(Math.random() * 60);
        } else if (selectedType.type === "konchoco") {
            hour = 12 + Math.floor(Math.random() * 4); // 12-15時
            minute = Math.floor(Math.random() * 60);
        } else {
            hour = 18 + Math.floor(Math.random() * 5); // 18-22時
            minute = Math.floor(Math.random() * 60);
        }

        const createdAt = new Date(d);
        createdAt.setHours(hour, minute, 0, 0);

        const textOptions = greetings[selectedType.type];
        const text = textOptions[Math.floor(Math.random() * textOptions.length)];
        const tags = hashtags.slice(0, 1 + Math.floor(Math.random() * hashtags.length)).join(" ");

        const colorIndex = (tweetId % 6);
        const colors = ["2d1b4e", "1b3a4e", "4e1b2d", "1b4e3a", "3a1b4e", "4e3a1b"];
        const bgColor = colors[colorIndex];

        tweets.push({
            id: String(tweetId++),
            text: `${text} ${tags}`,
            created_at: createdAt.toISOString(),
            image_url: `https://placehold.co/400x300/${bgColor}/fff?text=${encodeURIComponent(selectedType.keyword)}`,
            like_count: Math.floor(Math.random() * 50) + 5,
            retweet_count: Math.floor(Math.random() * 15),
            type: selectedType.type
        });
    }

    return tweets;
})();
