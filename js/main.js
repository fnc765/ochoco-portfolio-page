/**
 * メインJavaScriptファイル
 * ローディング画面の制御とページアニメーションを管理
 * Phase 2: tsParticlesによるパーティクルエフェクト追加
 */

// tsParticles初期化（Phase 2）
const initParticles = () => {
    tsParticles.load("particles-js", {
        particles: {
            number: {
                value: 50,
                density: {
                    enable: true,
                    value_area: 800
                }
            },
            color: {
                value: "#ffffff"
            },
            shape: {
                type: "circle"
            },
            opacity: {
                value: 0.6,
                random: true,
                anim: {
                    enable: true,
                    speed: 1,
                    opacity_min: 0.2,
                    sync: false
                }
            },
            size: {
                value: 3,
                random: true,
                anim: {
                    enable: true,
                    speed: 2,
                    size_min: 0.5,
                    sync: false
                }
            },
            line_linked: {
                enable: true,
                distance: 150,
                color: "#ffffff",
                opacity: 0.2,
                width: 1
            },
            move: {
                enable: true,
                speed: 1.3,
                direction: "none",
                random: true,
                straight: false,
                out_mode: "out",
                bounce: false,
                attract: {
                    enable: false,
                    rotateX: 600,
                    rotateY: 1200
                }
            }
        },
        interactivity: {
            detect_on: "canvas",
            events: {
                onhover: {
                    enable: true,
                    mode: "grab"
                },
                onclick: {
                    enable: true,
                    mode: "push"
                },
                resize: true
            },
            modes: {
                grab: {
                    distance: 140,
                    line_linked: {
                        opacity: 0.5
                    }
                },
                push: {
                    particles_nb: 4
                }
            }
        },
        retina_detect: true
    });
};

// ページ読み込み完了時の処理
window.addEventListener('load', () => {
    const loader = document.getElementById('loader');
    const content = document.getElementById('content');

    // tsParticlesを初期化（Phase 2）
    initParticles();

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
