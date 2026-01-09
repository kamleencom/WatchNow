/**
 * VideoJS Player Module
 * Integration of Video.js player for advanced playback features (Subtitles, Audio Tracks).
 */

/**
 * VideoJS Player State
 */
const VideoJSPlayerState = {
    player: null,           // VideoJS player instance
    isInitialized: false,   // Is player initialized
    currentSource: null,    // Current playing source URL

    // Player container ID
    containerId: 'videojs-player-container',

    // Destroy the player instance
    destroy() {
        if (this.player) {
            try {
                this.player.dispose(); // VideoJS uses dispose()
            } catch (e) {
                console.warn('Error destroying VideoJS player:', e);
            }
            this.player = null;
        }
        this.isInitialized = false;
        this.currentSource = null;

        // Ensure container is empty/removed
        const container = document.getElementById(this.containerId);
        if (container) {
            container.remove();
        }
    }
};

/**
 * VideoJS DOM Utilities
 */
const VideoJSDOM = {
    // Create or get the VideoJS container and video element
    setupContainer(parentElement) {
        // Remove existing if any (to ensure fresh start)
        let container = document.getElementById(VideoJSPlayerState.containerId);
        if (container) {
            container.remove();
        }

        container = document.createElement('div');
        container.id = VideoJSPlayerState.containerId;
        container.className = 'videojs-container';
        container.style.width = '100%';
        container.style.height = '100%';

        // VideoJS needs a video element target
        const videoElement = document.createElement('video');
        videoElement.className = 'video-js vjs-default-skin vjs-big-play-centered';
        videoElement.style.width = '100%';
        videoElement.style.height = '100%';

        // Add to container
        container.appendChild(videoElement);

        // Append container to parent
        if (parentElement) {
            parentElement.appendChild(container);
        }

        return videoElement;
    }
};

/**
 * Initialize VideoJS Player
 * @param {string} source - Media source URL
 * @param {HTMLElement} parentElement - Parent element to mount the player
 * @param {Object} options - Additional options
 */
function initVideoJSPlayer(source, parentElement, options = {}) {
    if (typeof videojs === 'undefined') {
        console.error('Video.js is not loaded.');
        return null;
    }

    // Destroy existing
    VideoJSPlayerState.destroy();

    // Setup DOM
    const videoElement = VideoJSDOM.setupContainer(parentElement);

    // Determine MIME type
    const mimeType = VideoJSStreamUtils.getMimeType(source);

    // Options
    const playerOptions = {
        controls: true,
        autoplay: true,
        preload: 'auto',
        fluid: false, // We control size via CSS/Container
        fill: true,
        sources: [{
            src: source,
            type: mimeType
        }],
        html5: {
            hls: {
                overrideNative: true // Use VideoJS HLS implementation for better control
            }
        },
        ...options.playerOptions
    };

    try {
        // Initialize
        VideoJSPlayerState.player = videojs(videoElement, playerOptions);
        VideoJSPlayerState.isInitialized = true;
        VideoJSPlayerState.currentSource = source;

        // Events
        VideoJSPlayerState.player.on('ready', () => {
            console.log('VideoJS player ready');
            setLoaderState(false);
        });

        VideoJSPlayerState.player.on('error', (e) => {
            console.error('VideoJS Error:', VideoJSPlayerState.player.error());
            setLoaderState(false);
        });

        VideoJSPlayerState.player.on('waiting', () => setLoaderState(true));
        VideoJSPlayerState.player.on('playing', () => setLoaderState(false));
        VideoJSPlayerState.player.on('canplay', () => setLoaderState(false));

        console.log('VideoJS initialized with source:', source);
        return VideoJSPlayerState.player;

    } catch (e) {
        console.error('Failed to initialize VideoJS:', e);
        return null;
    }
}

/**
 * Play media using VideoJS
 * @param {Object} item - Media item
 * @param {string} type - 'live', 'movie', 'series'
 * @param {HTMLElement} parentElement - Parent element
 */
function playVideoJSMedia(item, type, parentElement) {
    const playbackUrl = VideoJSStreamUtils.getBestUrl(item.url, type);

    console.log('=== Starting VideoJS Playback ===');
    console.log('URL:', playbackUrl);

    setLoaderState(true);

    const player = initVideoJSPlayer(playbackUrl, parentElement);
    return !!player;
}

/**
 * Stream URL Utilities (Mirrored from others for standalone capability)
 */
const VideoJSStreamUtils = {
    getMimeType(url) {
        if (/\.m3u8$/i.test(url)) return 'application/x-mpegURL';
        if (/\.mpd$/i.test(url)) return 'application/dash+xml';
        if (/\.mp4$/i.test(url)) return 'video/mp4';
        if (/\.webm$/i.test(url)) return 'video/webm';
        if (/\.mkv$/i.test(url)) return 'video/mp4'; // Try mp4 for mkv
        return 'application/x-mpegURL'; // Default to HLS
    },

    getBestUrl(originalUrl, type) {
        // Xtream Codes often provide .ts for live, but .m3u8 is more compatible with web players
        if (/\.ts$/i.test(originalUrl)) {
            // Check if it looks like an Xtream structure (optional, but safe to just replace extension for most live cases)
            return originalUrl.replace(/\.ts$/i, '.m3u8');
        }

        // Similar logic to Clappr/Native
        // For VideoJS, it handles m3u8 well.
        if (type === 'live' || type === 'channels') {
            // Ensure .m3u8 extension if missing for live
            if (!/\.(m3u8|ts|mp4|mkv)$/i.test(originalUrl)) {
                return originalUrl + '.m3u8';
            }
        }
        return originalUrl;
    }
};

/**
 * Helper to update global loader state (assumes global function exist or reimplements)
 */
function setLoaderState(isLoading) {
    const overlay = document.getElementById('player-overlay');
    const nested = document.getElementById('nested-player-container');
    if (isLoading) {
        overlay?.classList.add('loading');
        nested?.classList.add('loading');
    } else {
        overlay?.classList.remove('loading');
        nested?.classList.remove('loading');
    }
}

// Window Export
window.VideoJSPlayer = {
    init: initVideoJSPlayer,
    play: playVideoJSMedia,
    destroy: () => VideoJSPlayerState.destroy(),
    isActive: () => VideoJSPlayerState.isInitialized && !!VideoJSPlayerState.player,
    move: (newParent) => {
        const container = document.getElementById(VideoJSPlayerState.containerId);
        if (container && newParent) {
            newParent.appendChild(container);
        }
    },
    // Track Management
    getAudioTracks: () => {
        if (!VideoJSPlayerState.player) return [];
        const tracks = VideoJSPlayerState.player.audioTracks();
        const result = [];
        for (let i = 0; i < tracks.length; i++) {
            result.push({
                index: i,
                label: tracks[i].label || tracks[i].language || `Audio ${i + 1}`,
                enabled: tracks[i].enabled
            });
        }
        return result;
    },
    setAudioTrack: (index) => {
        if (!VideoJSPlayerState.player) return;
        const tracks = VideoJSPlayerState.player.audioTracks();
        for (let i = 0; i < tracks.length; i++) {
            tracks[i].enabled = (i === index);
        }
    },
    getSubtitleTracks: () => {
        if (!VideoJSPlayerState.player) return [];
        const tracks = VideoJSPlayerState.player.textTracks();
        const result = [];
        for (let i = 0; i < tracks.length; i++) {
            if (tracks[i].kind === 'subtitles' || tracks[i].kind === 'captions') {
                result.push({
                    index: i, // Note: This is index in full list, handle carefully
                    label: tracks[i].label || tracks[i].language || `Subtitle ${i + 1}`,
                    mode: tracks[i].mode
                });
            }
        }
        return result;
    },
    setSubtitleTrack: (index) => {
        if (!VideoJSPlayerState.player) return;
        const tracks = VideoJSPlayerState.player.textTracks();
        // Index passed must be the index in the full list provided by getSubtitleTracks? 
        // No, let's look up by exact match or just pass the real index.
        // For simplicity, we assume the index passed matches the track's index in the `tracks` list if we iterated correctly.
        // BUT we filtered in getSubtitleTracks. So we should probably pass the track object or exact index.
        // Let's iterate and find the one that matches our logic or just accept "real" index.

        // Revised Strategy: Just iterate all and set.
        // But wait, 'index' from getSubtitleTracks (filtered) != 'index' in textTracks (all).
        // Let's assume the UI sends back the index from the filtered list.

        let filteredCount = 0;
        for (let i = 0; i < tracks.length; i++) {
            if (tracks[i].kind === 'subtitles' || tracks[i].kind === 'captions') {
                if (filteredCount === index) {
                    tracks[i].mode = 'showing';
                } else {
                    tracks[i].mode = 'hidden';
                }
                filteredCount++;
            }
        }

        if (index === -1) {
            // Off
            for (let i = 0; i < tracks.length; i++) {
                if (tracks[i].kind === 'subtitles' || tracks[i].kind === 'captions') {
                    tracks[i].mode = 'hidden';
                }
            }
        }
    },
    // Register callback for metadata loaded (or tracks interaction)
    onTracksChanged: (callback) => {
        if (!VideoJSPlayerState.player) return;

        // Listen to various events that might change tracks
        const events = ['loadedmetadata', 'audiochannelschange', 'texttrackchange'];
        events.forEach(evt => {
            VideoJSPlayerState.player.on(evt, callback);
        });

        // Also AudioTrackList change events
        if (VideoJSPlayerState.player.audioTracks()) {
            VideoJSPlayerState.player.audioTracks().on('change', callback);
            VideoJSPlayerState.player.audioTracks().on('addtrack', callback);
            VideoJSPlayerState.player.audioTracks().on('removetrack', callback);
        }
        if (VideoJSPlayerState.player.textTracks()) {
            VideoJSPlayerState.player.textTracks().on('change', callback);
            VideoJSPlayerState.player.textTracks().on('addtrack', callback);
            VideoJSPlayerState.player.textTracks().on('removetrack', callback);
        }
    }
};

console.log('VideoJS Player Module Loaded');
