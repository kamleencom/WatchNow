/**
 * VideoPlayer Service
 * Handles video playback using Video.js.
 * Decoupled from specific DOM IDs and focuses purely on playback logic.
 */

const PLAYER_OPTIONS = {
    controls: true,
    autoplay: true,
    preload: 'auto',
    fluid: false, // CSS handles sizing
    fill: true,
    html5: {
        hls: {
            overrideNative: true // Use Video.js VHS for HLS consistency
        },
        nativeAudioTracks: true,
        nativeVideoTracks: true,
        nativeTextTracks: true
    },
    controlBar: {
        children: [
            'playToggle',
            'volumePanel',
            'currentTimeDisplay',
            'timeDivider',
            'durationDisplay',
            'progressControl',
            'liveDisplay',
            'seekToLive',
            'remainingTimeDisplay',
            'customControlSpacer',
            'playbackRateMenuButton',
            'chaptersButton',
            'descriptionsButton',
            'subsCapsButton',
            'audioTrackButton',
            'fullscreenToggle',
        ]
    }
};

const MIME_TYPES = {
    'm3u8': 'application/x-mpegURL',
    'mpd': 'application/dash+xml',
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'mkv': 'video/webm'
};

class VideoPlayerService {
    constructor() {
        this.player = null;
        this.activeContainer = null;
        this.wrapperId = 'videojs-wrapper-' + Math.random().toString(36).substr(2, 9);
    }

    init() {
        // Global Key Listener for Back/Esc/Stop
        document.addEventListener('keydown', (e) => {
            // 461: WebOS Back, 27: Esc, 8: Backspace, 413: Stop
            const exitKeys = [461, 27, 8, 413];
            // Only stop if active and NOT in an input field (prevent stopping when typing in search)
            if (this.isActive() && exitKeys.includes(e.keyCode)) {
                const tag = document.activeElement.tagName;
                if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
                    this.stop();
                }
            }
        });

        // Close button listener (if exists globally)
        const closeBtn = document.getElementById('close-player-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.stop());
        }

        console.log('[VideoPlayer] Service initialized');
    }

    /**
     * Start Playback
     * @param {Object} item - Media item { url, mimeType, etc }
     * @param {string} type - 'live', 'movie', 'series'
     * @param {HTMLElement} targetContainer - The DOM element to mount the player into
     */
    play(item, type = 'unknown', targetContainer) {
        if (!targetContainer) {
            console.error('[VideoPlayer] No target container provided.');
            return;
        }

        try {
            // 1. Resolve Media Source
            const { url, mimeType } = this._resolveMedia(item.url, type);
            console.log(`[VideoPlayer] Playing: ${item.title || 'Unknown'} -> ${url}`);

            // 2. Prepare UI (Mount/Create Player)
            this._mountPlayer(targetContainer);

            // 3. Update Styles
            if (this.activeContainer) {
                this.activeContainer.classList.add('video-active');
            }

            // 4. Load Source
            if (this.player) {
                this.player.ready(() => {
                    this.player.src([{ src: url, type: mimeType }]);
                    this.player.play().catch(e => {
                        console.warn("[VideoPlayer] Playback failed or was blocked:", e);
                    });
                });
            }
        } catch (e) {
            console.error('[VideoPlayer] Play Exception:', e);
        }
    }

    /**
     * Stop playback and reset UI
     */
    stop() {
        if (this.player) {
            this.player.pause();
            this.player.currentTime(0);
            this.player.trigger('loadstart'); // Clear display
        }

        if (this.activeContainer) {
            this.activeContainer.classList.remove('video-active');
            this.activeContainer.classList.remove('loading');
            this.activeContainer = null;
        }

        // Note: We do not dispose the player here, we keep the instance recycling for performance.
        // It will be disposed if the DOM node is lost.
    }

    /**
     * Check if player is currently playing content
     */
    isActive() {
        return this.player && !this.player.paused();
    }

    /**
     * Internal: Move or Create the Video.js DOM structure inside the target
     */
    _mountPlayer(targetContainer) {
        let wrapper = document.getElementById(this.wrapperId);

        // Check if we have an instance but the wrapper is gone (Detached/Zombie state)
        if (this.player && !wrapper) {
            console.warn('[VideoPlayer] Wrapper lost. Disposing old instance.');
            this.dispose();
        }

        if (!wrapper) {
            // Create new DOM structure
            wrapper = document.createElement('div');
            wrapper.id = this.wrapperId;
            wrapper.className = 'videojs-container-wrapper';
            wrapper.style.cssText = 'width: 100%; height: 100%; display: block;';
            wrapper.innerHTML = `<video class="video-js vjs-default-skin vjs-big-play-centered"></video>`;

            targetContainer.appendChild(wrapper);

            // Initialize Video.js
            const videoEl = wrapper.querySelector('video');
            this.player = videojs(videoEl, PLAYER_OPTIONS);
            this._setupEvents();

        } else if (wrapper.parentElement !== targetContainer) {
            // Move existing wrapper to new container
            targetContainer.appendChild(wrapper);
            if (this.player) {
                this.player.trigger('resize');
            }
        }

        this.activeContainer = targetContainer;
        wrapper.style.display = 'block';
    }

    _setupEvents() {
        if (!this.player) return;

        this.player.on('waiting', () => this._toggleLoading(true));
        this.player.on('playing', () => this._toggleLoading(false));
        this.player.on('canplay', () => this._toggleLoading(false));

        this.player.on('error', () => {
            const err = this.player.error();
            console.error('[VideoPlayer] Error:', err);
            this._toggleLoading(false);
        });
    }

    _toggleLoading(isLoading) {
        if (this.activeContainer) {
            if (isLoading) this.activeContainer.classList.add('loading');
            else this.activeContainer.classList.remove('loading');
        }
    }

    dispose() {
        if (this.player) {
            this.player.dispose();
            this.player = null;
        }
    }

    _resolveMedia(originalUrl, type) {
        if (!originalUrl) return { url: '', mimeType: '' };

        let url = originalUrl;

        // Fix: Convert .ts to .m3u8 for HLS compatibility
        if (/\.ts($|\?)/i.test(url)) {
            url = url.replace(/\.ts($|\?)/i, (match) => match.replace('.ts', '.m3u8'));
        }
        // Fix: Ensure live streams have extensions (some servers need this)
        else if ((type === 'live' || type === 'channels') && !/\.(m3u8|ts|mp4|mkv|mpd)($|\?)/i.test(url)) {
            if (url.includes('?')) {
                const parts = url.split('?');
                url = `${parts[0]}.m3u8?${parts[1]}`;
            } else {
                url = url + '.m3u8';
            }
        }

        return {
            url,
            mimeType: this._getMimeType(url)
        };
    }

    _getMimeType(url) {
        const cleanUrl = url.split('?')[0];
        const ext = cleanUrl.split('.').pop().toLowerCase();
        return MIME_TYPES[ext] || 'application/x-mpegURL';
    }
}

// Export Singleton
window.VideoPlayer = new VideoPlayerService();
