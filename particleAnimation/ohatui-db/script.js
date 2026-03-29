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

    /** R2キャッシュ経由のサムネイルURLを返す。image_url がない場合は null */
    function getThumbnailUrl(tweet) {
        if (!tweet.image_url) return null;
        return `/api/image/${tweet.id}`;
    }

    // ===================================
    // データ取得・処理
    // ===================================
    // データ変数（initData() で初期化）
    let tweets = [];
    let tweetsByDate = {};
    let milestones = {};
    let sortedAsc = [];

    /**
     * /api/tweets から取得、失敗時は MOCK_TWEETS にフォールバック
     */
    async function loadTweets() {
        try {
            const res = await fetch('/api/tweets');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (!Array.isArray(data)) throw new Error('Invalid response');
            console.log(`[ohatsui] APIから ${data.length} 件取得`);
            return data;
        } catch (e) {
            console.warn('[ohatsui] API未接続、モックデータを使用:', e.message);
            return typeof MOCK_TWEETS !== 'undefined' ? MOCK_TWEETS : [];
        }
    }

    function initData(rawTweets) {
        tweets = [...rawTweets].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        tweetsByDate = {};
        tweets.forEach(t => {
            const key = getDateKey(t.created_at);
            if (!tweetsByDate[key]) tweetsByDate[key] = [];
            tweetsByDate[key].push(t);
        });

        sortedAsc = [...tweets].reverse();
        milestones = {};
        sortedAsc.forEach((t, i) => {
            const num = i + 1;
            if (num === 1 || num === 50 || num === 100 || num === 200 || num === 365 || num === 500 || num === 700 || num % 100 === 0) {
                milestones[t.id] = num;
            }
        });
    }

    // ===================================
    // 背景タイルアニメーション
    // ===================================
    function initTileBackground() {
        const container = document.getElementById("tile-background");
        if (!container) return;

        const images = tweets
            .filter(t => t.image_url)
            .slice(0, 20)
            .map(t => getThumbnailUrl(t));

        if (images.length === 0) return;

        const tilesPerRow = 20;
        const MAX_ROWS = 20;
        let prevRowCount = -1;
        let prevTileSize = -1;

        function calcTileSize() {
            return window.innerWidth <= 768 ? 120 : 150;
        }

        function calcRowCount(tileSize) {
            const tileHeight = tileSize + 8; // img height + margin-bottom/gap
            return Math.min(Math.ceil(window.innerHeight / tileHeight) + 1, MAX_ROWS);
        }

        function buildRows() {
            const tileSize = calcTileSize();
            const rowCount = calcRowCount(tileSize);

            // 値が変わっていなければ再構築しない
            if (rowCount === prevRowCount && tileSize === prevTileSize) return;
            prevRowCount = rowCount;
            prevTileSize = tileSize;

            container.innerHTML = "";
            for (let row = 0; row < rowCount; row++) {
                const rowEl = document.createElement("div");
                rowEl.className = `tile-row ${row % 2 === 0 ? "tile-row-left" : "tile-row-right"}`;

                // 行ごとにシャッフルした順序を生成
                const rowImages = [...images].sort(() => Math.random() - 0.5);

                // 2セット分（無限ループ用）- 同じ行内は同じ順序でシームレスにループ
                for (let set = 0; set < 2; set++) {
                    for (let i = 0; i < tilesPerRow; i++) {
                        const img = document.createElement("img");
                        img.src = rowImages[i % rowImages.length];
                        img.alt = "";
                        img.loading = "lazy";
                        rowEl.appendChild(img);
                    }
                }

                container.appendChild(rowEl);
            }
        }

        // 重複登録防止: 前回のリスナーがあれば除去
        if (initTileBackground._resizeHandler) {
            window.removeEventListener("resize", initTileBackground._resizeHandler);
        }
        initTileBackground._resizeHandler = debounce(buildRows, 300);

        buildRows();
        window.addEventListener("resize", initTileBackground._resizeHandler);
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

        const todayThumb = getThumbnailUrl(t);
        if (todayThumb) {
            container.innerHTML = `
                <div class="today-card-inner">
                    <img src="${todayThumb}" alt="今日のおはつい" class="today-image" data-tweet-id="${t.id}">
                    <div class="today-info">
                        ${getTypeBadge(t.type)}
                        <p class="today-text">${escapeHtml(t.text)}</p>
                        <div class="today-meta">
                            <span><i class="fas fa-clock" aria-hidden="true"></i> ${formatDateTime(t.created_at)}</span>
                            <span><i class="fas fa-heart" aria-hidden="true"></i> ${t.like_count}</span>
                            <span><i class="fas fa-retweet" aria-hidden="true"></i> ${t.retweet_count}</span>
                        </div>
                        ${milestones[t.id] ? `<div class="modal-milestone">${milestones[t.id]}回目のおはつい！</div>` : ""}
                        ${t.tweet_id ? `<a href="https://x.com/i/status/${t.tweet_id}" target="_blank" rel="noopener noreferrer" class="tweet-link"><i class="fab fa-x-twitter" aria-hidden="true"></i> 元のポストを見る</a>` : ""}
                    </div>
                </div>
            `;
            container.querySelector(".today-image")?.addEventListener("click", () => openModal(t));
        } else {
            container.innerHTML = `
                <div class="today-text-card">
                    <div class="today-text-card-inner">
                        ${getTypeBadge(t.type)}
                        <p class="today-text-large">${escapeHtml(t.text)}</p>
                        <div class="today-meta">
                            <span><i class="fas fa-clock" aria-hidden="true"></i> ${formatDateTime(t.created_at)}</span>
                            ${t.like_count ? `<span><i class="fas fa-heart" aria-hidden="true"></i> ${t.like_count}</span>` : ""}
                            ${t.retweet_count ? `<span><i class="fas fa-retweet" aria-hidden="true"></i> ${t.retweet_count}</span>` : ""}
                        </div>
                        ${milestones[t.id] ? `<div class="modal-milestone">${milestones[t.id]}回目のおはつい！</div>` : ""}
                        ${t.tweet_id ? `<a href="https://x.com/i/status/${t.tweet_id}" target="_blank" rel="noopener noreferrer" class="tweet-link"><i class="fab fa-x-twitter" aria-hidden="true"></i> 元のポストを見る</a>` : ""}
                    </div>
                </div>
            `;
        }
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
            const thumb = getThumbnailUrl(t);
            return `
                <div class="onthisday-card" data-tweet-id="${t.id}">
                    ${thumb ? `<img src="${thumb}" alt="${year}年のおはつい" loading="lazy">` : ''}
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

        // 月内の最大エンゲージメントを計算（色の正規化用・トップ日の特定）
        let maxEngagement = 0;
        let topDay = -1;
        for (let d = 1; d <= daysInMonth; d++) {
            const key = `${heatmapYear}-${String(heatmapMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            if (tweetsByDate[key]) {
                const t = tweetsByDate[key][0];
                const eng = (t.like_count || 0) + (t.retweet_count || 0);
                if (eng > maxEngagement) { maxEngagement = eng; topDay = d; }
            }
        }

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

            let cellStyle = "";
            let statsHtml = "";

            if (hasTweet) {
                const likes = tweet.like_count || 0;
                const rts = tweet.retweet_count || 0;
                const engagement = likes + rts;
                const ratio = maxEngagement > 0 ? engagement / maxEngagement : 0;
                const alpha = (0.2 + ratio * 0.8).toFixed(2);
                cellStyle = `style="background: rgba(220, 53, 69, ${alpha});"`;

                statsHtml = `<span class="heatmap-stats"><span class="heatmap-stat-like"><i class="fas fa-heart" aria-hidden="true"></i>${likes}</span><span class="heatmap-stat-rt"><i class="fas fa-retweet" aria-hidden="true"></i>${rts}</span></span>`;
            }

            const tooltip = hasTweet
                ? `${d}日 - ${getTypeLabel(tweet.type)} ♥${tweet.like_count || 0} <i class="fas fa-retweet" aria-hidden="true"></i>${tweet.retweet_count || 0}`
                : `${d}日 - なし`;

            const isTop = hasTweet && d === topDay && maxEngagement > 0;
            html += `
                <div class="heatmap-cell ${hasTweet ? "active" : ""}${isTop ? " top" : ""}" ${hasTweet ? `data-tweet-id="${tweet.id}" ${cellStyle}` : ""}>
                    <span class="heatmap-tooltip">${tooltip}</span>
                    ${statsHtml}
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
        const thumb = getThumbnailUrl(t);
        container.innerHTML = `
            ${thumb ? `<img src="${thumb}" alt="おはつい" loading="lazy">` : ''}
            <p class="fun-tweet-text">${escapeHtml(t.text)}</p>
            <p class="fun-tweet-date">${formatDate(t.created_at)}</p>
        `;
        container.style.cursor = "pointer";
        container.onclick = () => openModal(t);
    }

    // ===================================
    // ギャラリー・検索
    // ===================================
    const ITEMS_PER_PAGE = 12;
    let currentPage = 1;
    let filteredTweets = [];
    let galleryObserver = null;
    let isLoadingMore = false;

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
        renderGallery(false);
        initInfiniteScroll();
    }

    function renderGallery(append = false) {
        const container = document.getElementById("gallery-grid");
        const info = document.getElementById("search-result-info");
        if (!container) return;

        const start = append ? (currentPage - 1) * ITEMS_PER_PAGE : 0;
        const end = currentPage * ITEMS_PER_PAGE;
        const items = filteredTweets.slice(start, end);
        const hasMore = end < filteredTweets.length;

        if (!append) {
            container.innerHTML = "";
        }

        if (info) info.textContent = `${filteredTweets.length}件のおはつい`;

        const fragment = document.createDocumentFragment();
        items.forEach(t => {
            const ms = milestones[t.id];
            const thumb = getThumbnailUrl(t);
            const wrapper = document.createElement("div");
            wrapper.innerHTML = `
                <div class="gallery-item" data-tweet-id="${t.id}">
                    ${ms ? `<span class="milestone-badge">${ms}回目</span>` : ""}
                    ${thumb ? `<img src="${thumb}" alt="おはつい" loading="lazy">` : ''}
                    <div class="gallery-item-info">
                        <p class="gallery-item-text">${escapeHtml(t.text)}</p>
                        <p class="gallery-item-date">${formatDate(t.created_at)}</p>
                    </div>
                </div>
            `;
            const itemEl = wrapper.firstElementChild;
            itemEl.addEventListener("click", () => openModal(t));
            fragment.appendChild(itemEl);
        });
        container.appendChild(fragment);

        const sentinel = document.getElementById("scroll-sentinel");
        if (sentinel) {
            sentinel.style.display = hasMore ? "block" : "none";
            if (!hasMore && galleryObserver) {
                galleryObserver.disconnect();
                galleryObserver = null;
            }
        }

        const loadBtn = document.getElementById("load-more-btn");
        if (loadBtn) loadBtn.style.display = "none";
    }

    function initInfiniteScroll() {
        const sentinel = document.getElementById("scroll-sentinel");
        if (!sentinel) return;

        if (galleryObserver) {
            galleryObserver.disconnect();
        }

        galleryObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !isLoadingMore) {
                    const hasMore = currentPage * ITEMS_PER_PAGE < filteredTweets.length;
                    if (hasMore) {
                        isLoadingMore = true;
                        currentPage++;
                        renderGallery(true);
                        isLoadingMore = false;
                    }
                }
            });
        }, {
            rootMargin: "200px"
        });

        galleryObserver.observe(sentinel);
    }

    // ===================================
    // モーダル
    // ===================================
    function openModal(t) {
        const modal = document.getElementById("tweet-modal");
        const body = document.getElementById("modal-body");
        if (!modal || !body) return;

        const ms = milestones[t.id];

        const modalThumb = getThumbnailUrl(t);
        body.innerHTML = `
            ${modalThumb ? `<img src="${modalThumb}" alt="おはつい" class="modal-image" style="cursor:zoom-in;" data-full-src="${modalThumb}">` : ''}
            <div class="modal-body-inner">
                ${getTypeBadge(t.type)}
                <p class="modal-text">${escapeHtml(t.text)}</p>
                <div class="modal-meta">
                    <span><i class="fas fa-clock" aria-hidden="true"></i> ${formatDateTime(t.created_at)}</span>
                    <span><i class="fas fa-heart" aria-hidden="true"></i> ${t.like_count}</span>
                    <span><i class="fas fa-retweet" aria-hidden="true"></i> ${t.retweet_count}</span>
                </div>
                ${ms ? `<div class="modal-milestone">${ms}回目のおはつい！</div>` : ""}
                ${t.tweet_id ? `<a href="https://x.com/i/status/${t.tweet_id}" target="_blank" rel="noopener noreferrer" class="tweet-link"><i class="fab fa-x-twitter" aria-hidden="true"></i> 元のポストを見る</a>` : ""}
            </div>
        `;

        // 画像クリックでライトボックス表示
        const modalImg = body.querySelector(".modal-image");
        if (modalImg) {
            modalImg.addEventListener("click", () => openLightbox(modalImg.src));
        }

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
    // ライトボックス（画像拡大表示）
    // ===================================
    function openLightbox(src) {
        const lb = document.getElementById("image-lightbox");
        const img = document.getElementById("lightbox-img");
        if (!lb || !img) return;
        img.src = src;
        lb.style.display = "flex";
    }

    function closeLightbox() {
        const lb = document.getElementById("image-lightbox");
        if (lb) lb.style.display = "none";
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
            }, 500);
        }, 800);
    }

    // ===================================
    // 初期化
    // ===================================
    document.addEventListener("DOMContentLoaded", async () => {
        // データ取得（API → フォールバック）
        const rawTweets = await loadTweets();
        initData(rawTweets);
        filteredTweets = [...tweets];

        // 背景タイル・ローディング
        initTileBackground();
        hideLoader();

        // メインコンテンツ
        renderToday();
        renderOnThisDay();
        renderStats();

        // おたのしみ
        renderRandomTweet();
        renderFortune();

        // ギャラリー
        renderGallery(false);
        initInfiniteScroll();

        // イベントリスナー
        document.getElementById("random-btn")?.addEventListener("click", renderRandomTweet);

        // 検索
        document.getElementById("search-text")?.addEventListener("input", debounce(filterTweets, 300));
        document.getElementById("search-date-from")?.addEventListener("change", filterTweets);
        document.getElementById("search-date-to")?.addEventListener("change", filterTweets);
        document.getElementById("search-type")?.addEventListener("change", filterTweets);

        // モーダル
        document.getElementById("modal-close")?.addEventListener("click", closeModal);
        document.getElementById("modal-overlay")?.addEventListener("click", closeModal);

        // ライトボックス
        document.getElementById("lightbox-overlay")?.addEventListener("click", closeLightbox);
        document.getElementById("lightbox-close")?.addEventListener("click", closeLightbox);

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                const lb = document.getElementById("image-lightbox");
                if (lb && lb.style.display === "flex") {
                    closeLightbox();
                } else {
                    closeModal();
                }
            }
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
