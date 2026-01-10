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
                'fullscreenToggle'
            ]
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

        VideoJSPlayerState.player.on('loadedmetadata', () => {
            console.log('=== Standard Player Metadata ===');
            try {
                const p = VideoJSPlayerState.player;
                console.log('Player:', p);
            } catch (e) {
                console.error('Error logging metadata:', e);
            }
            console.log('================================');


        });

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
        if (/\.mkv$/i.test(url)) return 'video/webm'; // Try webm for mkv
        return 'application/x-mpegURL'; // Default to HLS
    },

    getBestUrl(originalUrl, type) {
        // Xtream Codes often provide .ts for live, but .m3u8 is more compatible with web players
        if (/\.ts$/i.test(originalUrl)) {
            // Check if it looks like an Xtream structure (optional, but safe to just replace extension for most live cases)
            return originalUrl.replace(/\.ts$/i, '.m3u8');
        }

        // Similar logic to Native
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
};

console.log('VideoJS Player Module Loaded');
