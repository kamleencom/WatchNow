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
        vhs: {
            overrideNative: true
        },
        nativeAudioTracks: true,
        nativeVideoTracks: true,
        nativeTextTracks: true,
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
    'mkv': 'video/webm',
    'ts': 'application/x-mpegURL'
};

class VideoPlayerService {
    constructor() {
        this.player = null;
        this.activeContainer = null;
        this.infoContainer = null;
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
     * @param {string} type - 'live', 'movie', 'series'
     * @param {HTMLElement} targetContainer - The DOM element to mount the player into
     * @param {HTMLElement} [infoContainer] - Optional container to display track info
     */
    play(item, type = 'unknown', targetContainer, infoContainer = null, startTime = 0) {
        if (!targetContainer) {
            console.error('[VideoPlayer] No target container provided.');
            return;
        }

        try {
            // 1. Resolve Media Source
            const { url, mimeType } = this._resolveMedia(item.url, type);
            console.log(`[VideoPlayer] Playing: ${item.title || 'Unknown'} -> ${url}`);

            this.currentItem = item;
            this.currentType = type;
            this.infoContainer = infoContainer;
            if (this.infoContainer) {
                this.infoContainer.innerHTML = '';
                this.infoContainer.style.display = 'none';
            }

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
                    if (startTime > 0) {
                        this.player.currentTime(startTime);
                    }
                    this.player.play().catch(e => {
                        console.warn("[VideoPlayer] Playback failed or was blocked:", e);
                    });
                });
                console.log(this.player);
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
            this.activeContainer.classList.remove('loading');
            this.activeContainer = null;
        }

        if (this.infoContainer) {
            this.infoContainer.innerHTML = '';
            this.infoContainer.style.display = 'none';
            this.infoContainer = null;
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

        // Progress Tracker
        this.player.on('timeupdate', () => {
            const time = this.player.currentTime();
            const duration = this.player.duration();

            // Only track if valid duration and not live stream (unless it has duration like catchup)
            // Infinity duration usually means live.
            if (!duration || duration === Infinity || isNaN(duration)) return;

            // Throttle: Save every 5s or so? Or just let it be fast enough since it's one key.
            // Let's do a simple check to not save every millisecond. 
            // Saving every 5s is good practice.
            const now = Date.now();
            if (this._lastSave && (now - this._lastSave < 5000)) return;
            this._lastSave = now;

            if (this.currentItem && this.currentItem.url) {
                try {
                    const storeKey = 'watchnow_watch_progress';
                    const data = JSON.parse(localStorage.getItem(storeKey) || '{}');

                    data[this.currentItem.url] = {
                        url: this.currentItem.url,
                        title: this.currentItem.title,
                        logo: this.currentItem.logo || null,
                        season: this.currentItem.season || null,
                        episode: this.currentItem.episode || null,
                        item: this.currentItem, // Full item for card reconstruction
                        type: this.currentType,
                        time: time,
                        duration: duration,
                        lastWatched: now
                    };

                    localStorage.setItem(storeKey, JSON.stringify(data));
                } catch (e) { console.error("Tracking Error", e); }
            }
        });

        this.player.on('error', () => {
            const err = this.player.error();
            console.error('[VideoPlayer] Error:', err);
            this._toggleLoading(false);
        });

        this.player.on('loadedmetadata', () => {
            this._updateTrackInfo();
        });

        // Listen for track changes
        if (this.player.audioTracks && this.player.audioTracks()) {
            this.player.audioTracks().on('change', () => this._updateTrackInfo());
            this.player.audioTracks().on('addtrack', () => this._updateTrackInfo());
        }
        if (this.player.textTracks && this.player.textTracks()) {
            this.player.textTracks().on('change', () => this._updateTrackInfo());
            this.player.textTracks().on('addtrack', () => this._updateTrackInfo());
        }
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

        // Fix: Convert .ts to .m3u8 for HLS compatibility (EXCEPT for timeshift URLs)
        // Check for both path-based timeshift (/timeshift/) and PHP endpoint (/streaming/timeshift.php)
        const isTimeshiftUrl = url.includes('/timeshift/') || url.includes('/streaming/timeshift.php');
        if (/\.ts($|\?)/i.test(url) && !isTimeshiftUrl) {
            url = url.replace(/\.ts($|\?)/i, (match) => match.replace('.ts', '.m3u8'));
        }
        // Fix: Ensure live streams have extensions (some servers need this)
        // Skip timeshift URLs as they handle streaming directly
        else if ((type === 'live' || type === 'channels') && !isTimeshiftUrl && !/\.(m3u8|ts|mp4|mkv|mpd|php)($|\?)/i.test(url)) {
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

    _updateTrackInfo() {
        if (!this.infoContainer || !this.player) return;

        const audioTracks = this.player.audioTracks ? Array.from(this.player.audioTracks()) : [];
        const textTracks = this.player.textTracks ? Array.from(this.player.textTracks()) : [];

        // Filter text tracks for subtitles/captions
        const subs = textTracks.filter(t => t.kind === 'subtitles' || t.kind === 'captions');

        if (audioTracks.length === 0 && subs.length === 0) {
            this.infoContainer.style.display = 'none';
            return;
        }

        let html = '<div style="display:flex; gap:20px; flex-wrap:wrap;">';

        // Audio
        if (audioTracks.length > 0) {
            html += '<div style="display:flex; flex-direction:column; gap:4px;">';
            html += '<span style="font-weight:600; color:#fff; display:flex; align-items:center; gap:5px;"><i data-lucide="music" style="width:14px;"></i> Audio</span>';
            html += '<div style="display:flex; flex-wrap:wrap; gap:8px;">';
            audioTracks.forEach(t => {
                const label = t.label || t.language || 'Unknown';
                const isActive = t.enabled;
                html += `<span style="background:${isActive ? 'var(--primary-color)' : 'rgba(255,255,255,0.1)'}; padding:2px 8px; border-radius:4px; font-size:11px;">${label}</span>`;
            });
            html += '</div></div>';
        }

        // Subs
        if (subs.length > 0) {
            html += '<div style="display:flex; flex-direction:column; gap:4px;">';
            html += '<span style="font-weight:600; color:#fff; display:flex; align-items:center; gap:5px;"><i data-lucide="subtitles" style="width:14px;"></i> Subtitles</span>';
            html += '<div style="display:flex; flex-wrap:wrap; gap:8px;">';
            subs.forEach(t => {
                const label = t.label || t.language || 'Unknown';
                const isActive = t.mode === 'showing';
                html += `<span style="background:${isActive ? 'var(--primary-color)' : 'rgba(255,255,255,0.1)'}; padding:2px 8px; border-radius:4px; font-size:11px;">${label}</span>`;
            });
            html += '</div></div>';
        }

        html += '</div>';

        this.infoContainer.innerHTML = html;
        this.infoContainer.style.display = 'block';

        // Refresh icons if lucide is available
        if (window.lucide) {
            lucide.createIcons({ root: this.infoContainer });
        }
    }
}

// Export Singleton
window.VideoPlayer = new VideoPlayerService();
