(function() {
    "use strict";

    //ref: https://codepen.io/Fata-ku/details/GRJRaj

    // ===================================
    // 定数定義
    // ===================================
    const CONFIG = {
        PARTICLE_COUNT: 200,
        RADIUS_MIN: 1,
        RADIUS_MAX: 8,
        COLORS: ["64, 32, 0", "250, 64, 0", "64, 0, 0", "200, 200, 200"],
        VELOCITY_DIVISOR: 3,
        ALPHA_DIVISOR: 3
    };

    // ===================================
    // ユーティリティ関数
    // ===================================
    const rand = (a, b) => Math.random() * (b - a) + a;

    // ===================================
    // Particleクラス
    // ===================================
    class Particle {
        constructor(canvas, colors) {
            this.canvas = canvas;
            this.colors = colors;
            this.reset();
        }

        reset() {
            this.color = this.colors[Math.floor(Math.random() * this.colors.length)];
            this.radius = rand(CONFIG.RADIUS_MIN, CONFIG.RADIUS_MAX);
            this.x = rand(0, this.canvas.width);
            this.y = rand(-20, this.canvas.height * 0.5);
            this.vx = (-5 + Math.random() * 10) / CONFIG.VELOCITY_DIVISOR;
            this.vy = (0.7 * this.radius) / CONFIG.VELOCITY_DIVISOR;
            this.valpha = rand(0.02, 0.09) / CONFIG.ALPHA_DIVISOR;
            this.opacity = 0;
        }

        update() {
            this.x += this.vx;
            this.y += this.vy;

            if (this.opacity >= 1 && this.valpha > 0) {
                this.valpha *= -1;
            }
            this.opacity += this.valpha;

            // opacityを0〜1の範囲に制限
            this.opacity = Math.min(1, Math.max(0, this.opacity));

            if (this.opacity <= 0 || this.radius <= 0 || this.y > this.canvas.height) {
                this.reset();
            }
        }

        draw(context) {
            const fillAlpha = Math.min(this.opacity, 0.85);

            context.fillStyle = `rgba(${this.color}, ${fillAlpha})`;
            context.beginPath();
            context.arc(this.x, this.y, this.radius, 0, 2 * Math.PI, false);
            context.fill();
        }
    }

    // ===================================
    // ParticleAnimationクラス
    // ===================================
    class ParticleAnimation {
        constructor() {
            this.canvas = document.getElementById("bg");
            if (!this.canvas) {
                console.error('Canvas element with id "bg" not found');
                return;
            }

            this.context = this.canvas.getContext("2d");
            if (!this.context) {
                console.error('Failed to get 2d context from canvas');
                return;
            }

            this.particles = [];

            this.init();
            this.setupEventListeners();

            // 関数をバインドして再利用
            this.animate = this.animate.bind(this);
            this.animate();
        }

        init() {
            this.resizeCanvas();
            this.createParticles();
        }

        resizeCanvas() {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            this.createParticles();
        }

        createParticles() {
            this.particles = [];
            for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
                this.particles.push(new Particle(this.canvas, CONFIG.COLORS));
            }
        }

        setupEventListeners() {
            // リサイズイベント（デバウンス付き）
            let resizeTimeout;
            window.addEventListener('resize', () => {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(() => {
                    this.resizeCanvas();
                }, 150);
            }, false);
        }

        animate() {
            // clearとupdate/drawを1つのループで処理
            this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);

            for (const particle of this.particles) {
                particle.update();
                particle.draw(this.context);
            }

            requestAnimationFrame(this.animate);
        }
    }

    // パーティクルアニメーション初期化（DOMContentLoaded後に遅延）
    let particleAnimation = null;

    // ===================================
    // UIコントローラークラス
    // ===================================
    class UIController {
        constructor() {
            this.LOADING_DURATION = 1000;
            this.FADE_DURATION = 500;
            this.MESSAGES = [
                'チョコレートのちょこだよ！',
                'うどんせいばーすき！',
                'よろしくね！',
                '赤メガネがトレードマーク！',
                '仲良くしてね！',
                'VRChatで遊ぼう！'
            ];

            this.loader = document.getElementById('loader');
            this.content = document.getElementById('content');
            this.profileImg = document.querySelector('.profile-img');
            this.profileSection = document.querySelector('.profile-section');
            this.speechBubbleText = document.querySelector('.speech-bubble p');
            this.lastMessage = '';

            this.init();
        }

        init() {
            this.setupProfileImageError();
        }

        startLoading() {
            setTimeout(() => {
                this.hideLoader();
            }, this.LOADING_DURATION);
        }

        hideLoader() {
            if (!this.loader || !this.content) return;

            this.loader.style.opacity = '0';

            setTimeout(() => {
                this.loader.style.display = 'none';
                this.content.style.display = 'block';
                this.content.classList.add('show');
                this.setupRandomMessages();
            }, this.FADE_DURATION);
        }

        setupRandomMessages() {
            if (!this.profileSection || !this.speechBubbleText) return;

            // PC用：マウスホバー
            this.profileSection.addEventListener('mouseenter', () => {
                const randomMessage = this.getRandomMessage();
                this.speechBubbleText.textContent = randomMessage;
            });

            // スマホ用：タップ
            this.profileSection.addEventListener('click', (e) => {
                e.preventDefault();
                const randomMessage = this.getRandomMessage();
                this.speechBubbleText.textContent = randomMessage;

                // activeクラスを追加して吹き出しを表示
                this.profileSection.classList.add('active');

                // 3秒後に非表示
                setTimeout(() => {
                    this.profileSection.classList.remove('active');
                }, 3000);
            });
        }

        getRandomMessage() {
            const availableMessages = this.MESSAGES.filter(msg => msg !== this.lastMessage);
            const randomMessage = availableMessages[Math.floor(Math.random() * availableMessages.length)];
            this.lastMessage = randomMessage;
            return randomMessage;
        }

        setupProfileImageError() {
            if (!this.profileImg) return;

            this.profileImg.addEventListener('error', () => {
                this.profileImg.style.backgroundColor = '#333';
                this.profileImg.alt = 'プロフィール画像が見つかりません';
            });
        }
    }

    // 初期化（DOMContentLoaded後に実行）
    document.addEventListener('DOMContentLoaded', () => {
        particleAnimation = new ParticleAnimation();
        const uiController = new UIController();
        uiController.startLoading();
    });

})();
