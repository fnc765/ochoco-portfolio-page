(function() {
    "use strict";

    // ===================================
    // ユーティリティ
    // ===================================
    function formatDate(dateStr) {
        const d = new Date(dateStr);
        return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
    }

    function formatTime(dateStr) {
        const d = new Date(dateStr);
        return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }

    function formatDateTime(dateStr) {
        return `${formatDate(dateStr)} ${formatTime(dateStr)}`;
    }

    function getDateKey(dateStr) {
        const d = new Date(dateStr);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }

    function getMonthDay(dateStr) {
        const d = new Date(dateStr);
        return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }

    function getTypeBadge(type) {
        const labels = {
            ohachoco: "おはちょこ",
            konchoco: "こんちょこ",
            konbanchoco: "こんばんちょこ"
        };
        return `<span class="today-type-badge badge-${type}">${labels[type] || type}</span>`;
    }

    function getTypeLabel(type) {
        const labels = {
            ohachoco: "おはちょこ",
            konchoco: "こんちょこ",
            konbanchoco: "こんばんちょこ"
        };
        return labels[type] || type;
    }

    // 日付のみ比較用
    function toDateOnly(d) {
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }

    // ===================================
    // Twitter 埋め込み
    // ===================================
    let pendingTweetId = null;

    function createTweetEmbed(tweetId) {
        const el = document.getElementById("today-tweet-embed");
        if (!el) return;
        if (window.twttr && window.twttr.widgets) {
            window.twttr.widgets.createTweet(tweetId, el, { theme: "dark", dnt: true });
        } else {
            // widgets.js がまだ読み込まれていない場合はポーリング（最大10秒）
            let tries = 0;
            const poll = setInterval(() => {
                tries++;
                if (window.twttr && window.twttr.widgets) {
                    clearInterval(poll);
                    window.twttr.widgets.createTweet(tweetId, el, { theme: "dark", dnt: true });
                } else if (tries >= 100) {
                    clearInterval(poll);
                }
            }, 100);
        }
    }

    // ===================================
    // データ処理
    // ===================================
    // ツイートを日付順にソート（新しい順）
    const tweets = [...MOCK_TWEETS].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // 日付ごとのマップ
    const tweetsByDate = {};
    tweets.forEach(t => {
        const key = getDateKey(t.created_at);
        if (!tweetsByDate[key]) tweetsByDate[key] = [];
        tweetsByDate[key].push(t);
    });

    // マイルストーン計算（投稿順にインデックス付与）
    const sortedAsc = [...tweets].reverse();
    const milestones = {};
    sortedAsc.forEach((t, i) => {
        const num = i + 1;
        if (num === 1 || num === 50 || num === 100 || num === 200 || num === 365 || num === 500 || num === 700 || num % 100 === 0) {
            milestones[t.id] = num;
        }
    });

    // ===================================
    // 背景タイルアニメーション
    // ===================================
    function initTileBackground() {
        const container = document.getElementById("tile-background");
        if (!container) return;

        const images = tweets
            .filter(t => t.image_url)
            .map(t => t.image_url);

        if (images.length === 0) return;

        const rowCount = 4;
        const tilesPerRow = 20;

        for (let row = 0; row < rowCount; row++) {
            const rowEl = document.createElement("div");
            rowEl.className = `tile-row ${row % 2 === 0 ? "tile-row-left" : "tile-row-right"}`;

            // 2セット分（無限ループ用）
            for (let set = 0; set < 2; set++) {
                for (let i = 0; i < tilesPerRow; i++) {
                    const img = document.createElement("img");
                    const idx = (row * tilesPerRow + i) % images.length;
                    img.src = images[idx];
                    img.alt = "";
                    img.loading = "lazy";
                    rowEl.appendChild(img);
                }
            }

            container.appendChild(rowEl);
        }
    }

    // ===================================
    // 今日のおはつい
    // ===================================
    function renderToday() {
        const container = document.getElementById("today-content");
        if (!container) return;

        const today = new Date();
        const todayKey = getDateKey(today.toISOString());
        const todayTweets = tweetsByDate[todayKey];

        if (!todayTweets || todayTweets.length === 0) {
            container.innerHTML = `
                <div class="today-empty">
                    <i class="fas fa-moon" aria-hidden="true"></i>
                    今日のおはちょこはまだだよ！
                </div>
            `;
            return;
        }

        const t = todayTweets[0];

        // tweet_id がある場合は Twitter 公式埋め込みで表示
        if (t.tweet_id) {
            container.innerHTML = `
                <div class="today-embed-wrapper">
                    ${getTypeBadge(t.type)}
                    ${milestones[t.id] ? `<div class="modal-milestone">${milestones[t.id]}回目のおはつい！</div>` : ""}
                    <div id="today-tweet-embed"></div>
                </div>
            `;
            // widgets.js が読み込まれるまでポーリングして createTweet() で生成
            // (blockquote + load() は display:none 時に処理済みフラグが立ち再描画されないため使わない)
            pendingTweetId = t.tweet_id;
            return;
        }

        container.innerHTML = `
            <div class="today-card-inner">
                <img src="${t.image_url}" alt="今日のおはつい" class="today-image" data-tweet-id="${t.id}">
                <div class="today-info">
                    ${getTypeBadge(t.type)}
                    <p class="today-text">${escapeHtml(t.text)}</p>
                    <div class="today-meta">
                        <span><i class="fas fa-clock" aria-hidden="true"></i> ${formatDateTime(t.created_at)}</span>
                        <span><i class="fas fa-heart" aria-hidden="true"></i> ${t.like_count}</span>
                        <span><i class="fas fa-retweet" aria-hidden="true"></i> ${t.retweet_count}</span>
                    </div>
                    ${milestones[t.id] ? `<div class="modal-milestone">${milestones[t.id]}回目のおはつい！</div>` : ""}
                </div>
            </div>
        `;

        container.querySelector(".today-image")?.addEventListener("click", () => openModal(t));
    }

    // ===================================
    // 去年の今日
    // ===================================
    function renderOnThisDay() {
        const container = document.getElementById("onthisday-content");
        if (!container) return;

        const today = new Date();
        const monthDay = getMonthDay(today.toISOString());
        const currentYear = today.getFullYear();

        const matchingTweets = tweets.filter(t => {
            const d = new Date(t.created_at);
            return getMonthDay(t.created_at) === monthDay && d.getFullYear() !== currentYear;
        });

        if (matchingTweets.length === 0) {
            container.innerHTML = `<div class="onthisday-empty">去年の今日のおはついはまだありません</div>`;
            return;
        }

        container.innerHTML = matchingTweets.map(t => {
            const year = new Date(t.created_at).getFullYear();
            return `
                <div class="onthisday-card" data-tweet-id="${t.id}">
                    <img src="${t.image_url}" alt="${year}年のおはつい" loading="lazy">
                    <div class="onthisday-card-body">
                        <p class="onthisday-year">${year}年</p>
                        <p class="onthisday-text">${escapeHtml(t.text)}</p>
                    </div>
                </div>
            `;
        }).join("");

        container.querySelectorAll(".onthisday-card").forEach(card => {
            card.addEventListener("click", () => {
                const id = card.dataset.tweetId;
                const tweet = tweets.find(t => t.id === id);
                if (tweet) openModal(tweet);
            });
        });
    }

    // ===================================
    // 統計情報
    // ===================================
    function renderStats() {
        // 総おはつい数
        document.querySelector("#stat-total .stat-value").textContent = tweets.length.toLocaleString();

        // 連続記録計算
        const dateSet = new Set(Object.keys(tweetsByDate));
        const { current, max } = calculateStreaks(dateSet);
        document.querySelector("#stat-streak .stat-value").textContent = `${current}日`;
        document.querySelector("#stat-max-streak .stat-value").textContent = `${max}日`;

        // おはちょこ時計（ohachocoの平均投稿時間）
        const ohachocoTweets = tweets.filter(t => t.type === "ohachoco");
        if (ohachocoTweets.length > 0) {
            const totalMinutes = ohachocoTweets.reduce((sum, t) => {
                const d = new Date(t.created_at);
                return sum + d.getHours() * 60 + d.getMinutes();
            }, 0);
            const avgMinutes = Math.round(totalMinutes / ohachocoTweets.length);
            const avgH = Math.floor(avgMinutes / 60);
            const avgM = avgMinutes % 60;
            document.querySelector("#stat-clock .stat-value").textContent =
                `${String(avgH).padStart(2, "0")}:${String(avgM).padStart(2, "0")}`;
        }

        // 種類別バー
        renderTypeBars();

        // 今月の達成率
        renderMonthlyProgress();

        // 曜日別
        renderWeekdayBars();

        // カレンダーヒートマップ
        initHeatmap();
    }

    function calculateStreaks(dateSet) {
        const dates = Array.from(dateSet).sort();
        if (dates.length === 0) return { current: 0, max: 0 };

        let maxStreak = 1;
        let currentStreak = 1;

        for (let i = 1; i < dates.length; i++) {
            const prev = new Date(dates[i - 1]);
            const curr = new Date(dates[i]);
            const diff = (curr - prev) / (1000 * 60 * 60 * 24);

            if (diff === 1) {
                currentStreak++;
                maxStreak = Math.max(maxStreak, currentStreak);
            } else {
                currentStreak = 1;
            }
        }

        // 現在の連続日数（今日or昨日から遡る）
        const today = getDateKey(new Date().toISOString());
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayKey = getDateKey(yesterday.toISOString());

        let streak = 0;
        let checkDate = dateSet.has(today) ? new Date() : (dateSet.has(yesterdayKey) ? yesterday : null);

        if (checkDate) {
            while (true) {
                const key = getDateKey(checkDate.toISOString());
                if (dateSet.has(key)) {
                    streak++;
                    checkDate.setDate(checkDate.getDate() - 1);
                } else {
                    break;
                }
            }
        }

        return { current: streak, max: maxStreak };
    }

    function renderTypeBars() {
        const container = document.getElementById("type-bars");
        if (!container) return;

        const counts = { ohachoco: 0, konchoco: 0, konbanchoco: 0 };
        tweets.forEach(t => { if (counts[t.type] !== undefined) counts[t.type]++; });
        const total = tweets.length || 1;

        const types = [
            { key: "ohachoco", label: "おはちょこ", color: "ohachoco" },
            { key: "konchoco", label: "こんちょこ", color: "konchoco" },
            { key: "konbanchoco", label: "こんばんちょこ", color: "konbanchoco" }
        ];

        container.innerHTML = types.map(t => {
            const pct = Math.round((counts[t.key] / total) * 100);
            return `
                <div class="type-bar-row">
                    <span class="type-bar-label">${t.label}</span>
                    <div class="type-bar-track">
                        <div class="type-bar-fill ${t.color}" style="width: ${pct}%">${pct}%</div>
                    </div>
                </div>
            `;
        }).join("");
    }

    function renderMonthlyProgress() {
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const daysSoFar = today.getDate();

        let count = 0;
        for (let d = 1; d <= daysSoFar; d++) {
            const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            if (tweetsByDate[key]) count++;
        }

        const pct = Math.round((count / daysSoFar) * 100);
        const bar = document.getElementById("progress-bar");
        const text = document.getElementById("progress-text");
        const detail = document.getElementById("progress-detail");

        if (bar) bar.style.width = `${pct}%`;
        if (text) text.textContent = `${pct}%`;
        if (detail) detail.textContent = `${daysSoFar}日中${count}日達成（${month + 1}月）`;
    }

    function renderWeekdayBars() {
        const container = document.getElementById("weekday-bars");
        if (!container) return;

        const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
        const dayCounts = [0, 0, 0, 0, 0, 0, 0];
        const dayTotals = [0, 0, 0, 0, 0, 0, 0];

        // 全期間の各曜日の日数と投稿数を計算
        const firstDate = new Date(sortedAsc[0]?.created_at || Date.now());
        const lastDate = new Date();

        for (let d = new Date(firstDate); d <= lastDate; d.setDate(d.getDate() + 1)) {
            dayTotals[d.getDay()]++;
        }

        tweets.forEach(t => {
            dayCounts[new Date(t.created_at).getDay()]++;
        });

        const rates = dayNames.map((_, i) => dayTotals[i] ? Math.round((dayCounts[i] / dayTotals[i]) * 100) : 0);
        const maxRate = Math.max(...rates, 1);

        container.innerHTML = dayNames.map((name, i) => {
            const height = Math.max(4, (rates[i] / maxRate) * 90);
            return `
                <div class="weekday-bar">
                    <div class="weekday-bar-fill" style="height: ${height}%">
                        <span class="weekday-bar-value">${rates[i]}%</span>
                    </div>
                    <span class="weekday-bar-label">${name}</span>
                </div>
            `;
        }).join("");
    }

    // ===================================
    // カレンダーヒートマップ
    // ===================================
    let heatmapYear, heatmapMonth;

    function initHeatmap() {
        const today = new Date();
        heatmapYear = today.getFullYear();
        heatmapMonth = today.getMonth();
        renderHeatmap();

        document.getElementById("heatmap-prev")?.addEventListener("click", () => {
            heatmapMonth--;
            if (heatmapMonth < 0) { heatmapMonth = 11; heatmapYear--; }
            renderHeatmap();
        });

        document.getElementById("heatmap-next")?.addEventListener("click", () => {
            heatmapMonth++;
            if (heatmapMonth > 11) { heatmapMonth = 0; heatmapYear++; }
            renderHeatmap();
        });
    }

    function renderHeatmap() {
        const container = document.getElementById("heatmap");
        const label = document.getElementById("heatmap-month-label");
        if (!container || !label) return;

        label.textContent = `${heatmapYear}年${heatmapMonth + 1}月`;

        const dayHeaders = ["日", "月", "火", "水", "木", "金", "土"];
        const firstDay = new Date(heatmapYear, heatmapMonth, 1).getDay();
        const daysInMonth = new Date(heatmapYear, heatmapMonth + 1, 0).getDate();

        let html = dayHeaders.map(d => `<div class="heatmap-header">${d}</div>`).join("");

        // 空セル
        for (let i = 0; i < firstDay; i++) {
            html += `<div class="heatmap-cell empty"></div>`;
        }

        // 日付セル
        for (let d = 1; d <= daysInMonth; d++) {
            const key = `${heatmapYear}-${String(heatmapMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const hasTweet = !!tweetsByDate[key];
            const tweet = hasTweet ? tweetsByDate[key][0] : null;
            const tooltip = hasTweet
                ? `${d}日 - ${getTypeLabel(tweet.type)}`
                : `${d}日 - なし`;

            html += `
                <div class="heatmap-cell ${hasTweet ? "active" : ""}" ${hasTweet ? `data-tweet-id="${tweet.id}"` : ""}>
                    <span class="heatmap-tooltip">${tooltip}</span>
                </div>
            `;
        }

        container.innerHTML = html;

        // ヒートマップセルのクリックイベント
        container.querySelectorAll(".heatmap-cell.active").forEach(cell => {
            cell.style.cursor = "pointer";
            cell.addEventListener("click", () => {
                const id = cell.dataset.tweetId;
                const tweet = tweets.find(t => t.id === id);
                if (tweet) openModal(tweet);
            });
        });
    }

    // ===================================
    // おたのしみ機能
    // ===================================
    function renderRandomTweet() {
        const container = document.getElementById("random-tweet");
        if (!container || tweets.length === 0) return;

        const t = tweets[Math.floor(Math.random() * tweets.length)];
        renderFunTweet(container, t);
    }

    function renderFortune() {
        const container = document.getElementById("fortune-tweet");
        const msgEl = document.getElementById("fortune-message");
        if (!container || tweets.length === 0) return;

        // 日付シードでランダム
        const today = new Date();
        const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
        const idx = seed % tweets.length;
        const t = tweets[idx];
        renderFunTweet(container, t);

        const fortunes = [
            "今日はいいことがありそう！",
            "のんびりした一日になりそう",
            "新しい出会いがあるかも！",
            "元気いっぱいの一日！",
            "ゆったり過ごすのが吉",
            "友だちと過ごすと楽しい日",
            "VRChatで素敵な出会いがありそう",
            "今日のラッキーカラーはチョコレート色"
        ];
        if (msgEl) msgEl.textContent = fortunes[seed % fortunes.length];
    }

    function renderFunTweet(container, t) {
        container.innerHTML = `
            <img src="${t.image_url}" alt="おはつい" loading="lazy">
            <p class="fun-tweet-text">${escapeHtml(t.text)}</p>
            <p class="fun-tweet-date">${formatDate(t.created_at)}</p>
        `;
    }

    // ===================================
    // ギャラリー・検索
    // ===================================
    const ITEMS_PER_PAGE = 12;
    let currentPage = 1;
    let filteredTweets = [...tweets];

    function filterTweets() {
        const text = document.getElementById("search-text")?.value.toLowerCase() || "";
        const dateFrom = document.getElementById("search-date-from")?.value || "";
        const dateTo = document.getElementById("search-date-to")?.value || "";
        const type = document.getElementById("search-type")?.value || "";

        filteredTweets = tweets.filter(t => {
            if (text && !t.text.toLowerCase().includes(text)) return false;
            const dateKey = getDateKey(t.created_at);
            if (dateFrom && dateKey < dateFrom) return false;
            if (dateTo && dateKey > dateTo) return false;
            if (type && t.type !== type) return false;
            return true;
        });

        currentPage = 1;
        renderGallery();
    }

    function renderGallery() {
        const container = document.getElementById("gallery-grid");
        const loadBtn = document.getElementById("load-more-btn");
        const info = document.getElementById("search-result-info");
        if (!container) return;

        const items = filteredTweets.slice(0, currentPage * ITEMS_PER_PAGE);
        const hasMore = items.length < filteredTweets.length;

        if (info) info.textContent = `${filteredTweets.length}件のおはつい`;

        container.innerHTML = items.map(t => {
            const ms = milestones[t.id];
            return `
                <div class="gallery-item" data-tweet-id="${t.id}">
                    ${ms ? `<span class="milestone-badge">${ms}回目</span>` : ""}
                    <img src="${t.image_url}" alt="おはつい" loading="lazy">
                    <div class="gallery-item-info">
                        <p class="gallery-item-text">${escapeHtml(t.text)}</p>
                        <p class="gallery-item-date">${formatDate(t.created_at)}</p>
                    </div>
                </div>
            `;
        }).join("");

        if (loadBtn) loadBtn.style.display = hasMore ? "block" : "none";

        // クリックイベント
        container.querySelectorAll(".gallery-item").forEach(item => {
            item.addEventListener("click", () => {
                const id = item.dataset.tweetId;
                const tweet = tweets.find(t => t.id === id);
                if (tweet) openModal(tweet);
            });
        });
    }

    // ===================================
    // モーダル
    // ===================================
    function openModal(t) {
        const modal = document.getElementById("tweet-modal");
        const body = document.getElementById("modal-body");
        if (!modal || !body) return;

        const ms = milestones[t.id];

        body.innerHTML = `
            <img src="${t.image_url}" alt="おはつい" class="modal-image">
            <div class="modal-body-inner">
                ${getTypeBadge(t.type)}
                <p class="modal-text">${escapeHtml(t.text)}</p>
                <div class="modal-meta">
                    <span><i class="fas fa-clock" aria-hidden="true"></i> ${formatDateTime(t.created_at)}</span>
                    <span><i class="fas fa-heart" aria-hidden="true"></i> ${t.like_count}</span>
                    <span><i class="fas fa-retweet" aria-hidden="true"></i> ${t.retweet_count}</span>
                </div>
                ${ms ? `<div class="modal-milestone">${ms}回目のおはつい！</div>` : ""}
            </div>
        `;

        modal.style.display = "flex";
        document.body.style.overflow = "hidden";
    }

    function closeModal() {
        const modal = document.getElementById("tweet-modal");
        if (modal) {
            modal.style.display = "none";
            document.body.style.overflow = "";
        }
    }

    // ===================================
    // HTMLエスケープ
    // ===================================
    function escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    // ===================================
    // ローディング
    // ===================================
    function hideLoader() {
        const loader = document.getElementById("loader");
        const content = document.getElementById("content");
        if (!loader || !content) return;

        setTimeout(() => {
            loader.style.opacity = "0";
            setTimeout(() => {
                loader.style.display = "none";
                content.style.display = "block";
                content.classList.add("show");
                // コンテンツ表示後に埋め込みを生成
                if (pendingTweetId) {
                    createTweetEmbed(pendingTweetId);
                }
            }, 500);
        }, 800);
    }

    // ===================================
    // 初期化
    // ===================================
    document.addEventListener("DOMContentLoaded", () => {
        // 背景タイル
        initTileBackground();

        // ローディング
        hideLoader();

        // メインコンテンツ
        renderToday();
        renderOnThisDay();
        renderStats();

        // おたのしみ
        renderRandomTweet();
        renderFortune();

        // ギャラリー
        renderGallery();

        // イベントリスナー
        document.getElementById("random-btn")?.addEventListener("click", renderRandomTweet);

        document.getElementById("load-more-btn")?.addEventListener("click", () => {
            currentPage++;
            renderGallery();
        });

        // 検索
        document.getElementById("search-text")?.addEventListener("input", debounce(filterTweets, 300));
        document.getElementById("search-date-from")?.addEventListener("change", filterTweets);
        document.getElementById("search-date-to")?.addEventListener("change", filterTweets);
        document.getElementById("search-type")?.addEventListener("change", filterTweets);

        // モーダル
        document.getElementById("modal-close")?.addEventListener("click", closeModal);
        document.getElementById("modal-overlay")?.addEventListener("click", closeModal);
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") closeModal();
        });
    });

    // デバウンス
    function debounce(fn, delay) {
        let timer;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

})();
