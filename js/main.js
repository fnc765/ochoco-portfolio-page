/**
 * メインJavaScriptファイル
 * ローディング画面の制御とページアニメーションを管理
 */

// ページ読み込み完了時の処理
window.addEventListener('load', () => {
    const loader = document.getElementById('loader');
    const content = document.getElementById('content');

    // 1秒間ローディング画面を表示
    setTimeout(() => {
        // ローダーをフェードアウト
        loader.style.opacity = '0';

        // フェードアウト完了後にローダーを非表示にしてコンテンツを表示
        setTimeout(() => {
            loader.style.display = 'none';
            content.style.display = 'block';
            content.classList.add('show');
        }, 500);
    }, 1000);
});

// 画像読み込みエラー時の処理
document.addEventListener('DOMContentLoaded', () => {
    const profileImg = document.querySelector('.profile-img');

    if (profileImg) {
        profileImg.addEventListener('error', () => {
            // 画像が見つからない場合、代替の背景色を表示
            profileImg.style.backgroundColor = '#333';
            profileImg.alt = 'プロフィール画像が見つかりません';
        });
    }
});

// スムーズスクロールの実装（将来の拡張用）
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});
