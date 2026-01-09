/**
 * Clappr Player Module
 * Alternative player implementation using Clappr for video playback.
 * This module provides a drop-in replacement for the native HTML5 player.
 */

/**
 * Clappr Player State
 */
const ClapprPlayerState = {
    player: null,           // Clappr player instance
    isInitialized: false,   // Is player initialized
    currentSource: null,    // Current playing source URL

    // Player container ID
    containerId: 'clappr-player-container',

    // Destroy the player instance
    destroy() {
        if (this.player) {
            try {
                this.player.destroy();
            } catch (e) {
                console.warn('Error destroying Clappr player:', e);
            }
            this.player = null;
        }
        this.isInitialized = false;
        this.currentSource = null;
    },

    // Reset state
    reset() {
        this.destroy();
    }
};

/**
 * Clappr DOM References
 */
const ClapprDOM = {
    container: null,
    overlay: null,

    // Create or get the Clappr container
    getContainer(parentElement) {
        // Check if container already exists
        let container = document.getElementById(ClapprPlayerState.containerId);

        if (!container) {
            container = document.createElement('div');
            container.id = ClapprPlayerState.containerId;
            container.className = 'clappr-container';
        }

        // Append to parent if specified and not already there
        if (parentElement && container.parentElement !== parentElement) {
            parentElement.appendChild(container);
        }

        this.container = container;
        return container;
    },

    init() {
        this.overlay = document.getElementById('player-overlay');
    }
};

/**
 * Initialize Clappr Player
 * @param {string} source - Media source URL
 * @param {HTMLElement} parentElement - Parent element to mount the player
 * @param {Object} options - Additional options
 */
function initClapprPlayer(source, parentElement, options = {}) {
    // Check if Clappr is available
    if (typeof Clappr === 'undefined') {
        console.error('Clappr is not loaded. Falling back to native player.');
        return null;
    }

    // Destroy existing player
    ClapprPlayerState.destroy();

    // Get or create container
    const container = ClapprDOM.getContainer(parentElement);

    // Determine MIME type and configure source
    const mimeType = ClapprStreamUtils.getMimeType(source);

    // Player configuration
    const playerConfig = {
        parent: container,
        source: source,
        mimeType: mimeType,
        width: '100%',
        height: '100%',
        autoPlay: true,
        hideMediaControl: false,
        disableVideoTagContextMenu: true,
        playback: {
            hlsjsConfig: {
                enableWorker: true,
                lowLatencyMode: true,
                maxBufferLength: 30,
                maxMaxBufferLength: 600,
                backBufferLength: 30
            },
            recycleVideo: true
        },
        // Styling
        mediacontrol: {
            seekbar: '#8b5cf6',
            buttons: '#ffffff'
        },
        // Events
        events: {
            onReady: () => {
                console.log('Clappr player ready');
                ClapprPlayerState.isInitialized = true;
                setLoaderState(false);
            },
            onPlay: () => {
                console.log('Clappr player playing');
                setLoaderState(false);
            },
            onPause: () => {
                console.log('Clappr player paused');
            },
            onStop: () => {
                console.log('Clappr player stopped');
            },
            onError: (error) => {
                console.error('Clappr player error:', error);
                setLoaderState(false);

                // Try fallback URL if available
                if (options.fallbackUrl && options.fallbackUrl !== source) {
                    console.log('Trying fallback URL:', options.fallbackUrl);
                    changeClapprSource(options.fallbackUrl);
                }
            },
            onEnded: () => {
                console.log('Clappr player ended');
            },
            onBuffering: () => {
                setLoaderState(true);
            },
            onBufferfull: () => {
                setLoaderState(false);
            }
        },
        ...options.playerOptions
    };

    try {
        // Create Clappr player
        ClapprPlayerState.player = new Clappr.Player(playerConfig);
        ClapprPlayerState.currentSource = source;

        console.log('Clappr player initialized with source:', source);
        return ClapprPlayerState.player;
    } catch (e) {
        console.error('Failed to initialize Clappr player:', e);
        return null;
    }
}

/**
 * Helper function to set loading state
 */
function setLoaderState(isLoading) {
    const overlay = document.getElementById('player-overlay');
    const nestedContainer = document.getElementById('nested-player-container');

    if (isLoading) {
        overlay?.classList.add('loading');
        nestedContainer?.classList.add('loading');
    } else {
        overlay?.classList.remove('loading');
        nestedContainer?.classList.remove('loading');
    }
}

/**
 * Change the source of the Clappr player
 * @param {string} source - New source URL
 * @param {Object} options - Additional options
 */
function changeClapprSource(source, options = {}) {
    if (!ClapprPlayerState.player) {
        console.warn('Clappr player not initialized');
        return false;
    }

    try {
        const mimeType = ClapprStreamUtils.getMimeType(source);
        ClapprPlayerState.player.configure({
            source: source,
            mimeType: mimeType
        });
        ClapprPlayerState.currentSource = source;
        console.log('Clappr source changed to:', source);
        return true;
    } catch (e) {
        console.error('Failed to change Clappr source:', e);
        return false;
    }
}

/**
 * Play media using Clappr player
 * @param {Object} item - Media item to play
 * @param {string} type - Media type (live, movie, series)
 * @param {HTMLElement} parentElement - Parent element for the player
 */
function playClapprMedia(item, type, parentElement) {
    // Get the best URL for playback
    const playbackUrl = ClapprStreamUtils.getBestUrl(item.url, type);

    console.log('=== Starting Clappr Playback ===');
    console.log('Original URL:', item.url);
    console.log('Playback URL:', playbackUrl);

    // Show loading state
    setLoaderState(true);

    // Initialize the player
    const player = initClapprPlayer(playbackUrl, parentElement, {
        fallbackUrl: item.url !== playbackUrl ? item.url : null
    });

    if (!player) {
        console.error('Failed to initialize Clappr player, consider falling back to native');
        return false;
    }

    return true;
}

/**
 * Stop and cleanup Clappr player
 */
function stopClapprPlayer() {
    ClapprPlayerState.destroy();

    // Remove container from DOM
    const container = document.getElementById(ClapprPlayerState.containerId);
    if (container) {
        container.remove();
    }

    console.log('Clappr player stopped and cleaned up');
}

/**
 * Pause Clappr player
 */
function pauseClapprPlayer() {
    if (ClapprPlayerState.player) {
        ClapprPlayerState.player.pause();
    }
}

/**
 * Resume Clappr player
 */
function resumeClapprPlayer() {
    if (ClapprPlayerState.player) {
        ClapprPlayerState.player.play();
    }
}

/**
 * Get Clappr player current time
 */
function getClapprCurrentTime() {
    if (ClapprPlayerState.player) {
        return ClapprPlayerState.player.getCurrentTime();
    }
    return 0;
}

/**
 * Seek Clappr player
 * @param {number} time - Time in seconds
 */
function seekClapprPlayer(time) {
    if (ClapprPlayerState.player) {
        ClapprPlayerState.player.seek(time);
    }
}

/**
 * Check if Clappr player is playing
 */
function isClapprPlaying() {
    if (ClapprPlayerState.player) {
        return ClapprPlayerState.player.isPlaying();
    }
    return false;
}

/**
 * Set Clappr player volume
 * @param {number} volume - Volume level (0-100)
 */
function setClapprVolume(volume) {
    if (ClapprPlayerState.player) {
        ClapprPlayerState.player.setVolume(volume);
    }
}

/**
 * Get Clappr player volume
 */
function getClapprVolume() {
    if (ClapprPlayerState.player) {
        return ClapprPlayerState.player.getVolume();
    }
    return 100;
}

/**
 * Toggle Clappr player fullscreen
 */
function toggleClapprFullscreen() {
    if (ClapprPlayerState.player) {
        // Clappr handles fullscreen through its core
        const core = ClapprPlayerState.player.core;
        if (core && core.mediaControl) {
            core.mediaControl.toggleFullscreen();
        }
    }
}

/**
 * Stream URL Utilities for Clappr
 * Mirrors StreamUrlUtils from player.js for consistency
 */
const ClapprStreamUtils = {
    /**
     * Normalizes Xtream Codes URLs
     * Helps convert raw stream URLs into playable formats
     */
    normalizeXtreamUrl(url, extension = 'm3u8', type = 'live') {
        try {
            // If it already has a valid VOD extension, perform minimal normalization
            if (/\.(mp4|mkv|avi|webm|mov)$/i.test(url)) {
                // Determine extension from URL
                const match = url.match(/\.(mp4|mkv|avi|webm|mov)$/i);
                const actualExt = match ? match[1] : extension;

                // If it looks like an Xtream URL structure but might be malformed
                if (url.includes('/movie/') || url.includes('/series/')) {
                    // It's likely fine as is if it has credentials
                    return url;
                }
                // For live streams forcing m3u8 is usually correct, but for VODs we use the actual file
                if (type !== 'live') {
                    return url;
                }
            }

            let normalizedUrl = url;
            normalizedUrl = normalizedUrl.replace(/\.(ts|m3u8)$/i, '');
            normalizedUrl = normalizedUrl.replace(/\/live\//i, '/');

            const urlObj = new URL(normalizedUrl);
            const pathParts = urlObj.pathname.split('/').filter(p => p);

            if (pathParts.length < 3) {
                return url.replace(/\.(ts|m3u8)$/i, '') + '.' + extension;
            }

            const streamId = pathParts[pathParts.length - 1];
            const password = pathParts[pathParts.length - 2];
            const username = pathParts[pathParts.length - 3];
            const domainParts = pathParts.slice(0, pathParts.length - 3);
            const domain = urlObj.origin + (domainParts.length > 0 ? '/' + domainParts.join('/') : '');

            // For VODs (movies/series), usually the structure is /movie/user/pass/id.mp4 or /series/...
            // But normalizeXtreamUrl is mostly used for Live TV in this codebase.
            // If we are here, we might be constructing a Live URL.
            return `${domain}/live/${username}/${password}/${streamId}.${extension}`;
        } catch (e) {
            return url.replace(/\.(ts|m3u8)$/i, '') + '.' + extension;
        }
    },

    /**
     * Detects if URL is Xtream style
     */
    isXtreamStyleUrl(url) {
        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/').filter(p => p);
            // Check for numeric ID at end
            const lastPart = pathParts[pathParts.length - 1];
            const cleanLast = lastPart ? lastPart.replace(/\.(ts|m3u8|mp4|mkv)$/i, '') : '';
            return /^\d+$/.test(cleanLast) && pathParts.length >= 3;
        } catch (e) {
            return false;
        }
    },

    /**
     * Checks if URL has stream extension
     */
    hasStreamExtension(url) {
        return /\.(m3u8|ts|mp4|mkv|avi|flv|mov|webm)$/i.test(url);
    },

    /**
     * Gets best URL for playback
     * @param {string} originalUrl
     * @param {string} type - 'live', 'movie', 'series', 'unknown'
     */
    getBestUrl(originalUrl, type = 'unknown') {
        // If it's a VOD (movie/series) and has a known extension, use it directly
        if ((type === 'movie' || type === 'series' || type === 'movies') && this.hasStreamExtension(originalUrl)) {
            // For Xtream VODs, they are often direct file links (http://host:port/movie/user/pass/id.mp4)
            return originalUrl;
        }

        const isXtream = this.isXtreamStyleUrl(originalUrl);
        const hasExt = this.hasStreamExtension(originalUrl);

        if (isXtream) {
            // Only force m3u8 normalization for Live TV or if type is unknown/live default
            if (type === 'live' || type === 'channels' || (!hasExt && type === 'unknown')) {
                return this.normalizeXtreamUrl(originalUrl, 'm3u8', 'live');
            }
        } else if (!hasExt && (type === 'live' || type === 'channels')) {
            return originalUrl + '.m3u8';
        }

        return originalUrl;
    },

    /**
     * Gets MIME type for URL
     */
    getMimeType(url) {
        if (/\.m3u8$/i.test(url)) return 'application/x-mpegURL';
        if (/\.mpd$/i.test(url)) return 'application/dash+xml';
        if (/\.mp4$/i.test(url)) return 'video/mp4';
        if (/\.webm$/i.test(url)) return 'video/webm';
        if (/\.ts$/i.test(url)) return 'video/mp2t';
        if (/\.mkv$/i.test(url)) return 'video/mp4'; // Clappr/Browsers often treat MKV as MP4 for playback or depend on container support
        if (/\.mov$/i.test(url)) return 'video/quicktime';
        if (/\.avi$/i.test(url)) return 'video/x-msvideo';

        // Fallback based on content type if known via other means could be added here
        return 'video/mp4'; // Default to mp4 instead of hls for unknown in VOD context? 
        // Actually, safer to let player auto-detect or default to HLS only if it looks like a stream.
        // But for this issue, we know it's failing on MP4/MKV.
    }
};

/**
 * Move Clappr player to a new parent element
 * @param {HTMLElement} newParent - New parent element
 */
function moveClapprPlayer(newParent) {
    const container = document.getElementById(ClapprPlayerState.containerId);
    if (container && newParent) {
        newParent.appendChild(container);

        // Resize player to fit new container
        if (ClapprPlayerState.player) {
            ClapprPlayerState.player.resize({
                width: '100%',
                height: '100%'
            });
        }
    }
}

/**
 * Check if Clappr player is active
 */
function isClapprActive() {
    return ClapprPlayerState.player !== null && ClapprPlayerState.isInitialized;
}

// Initialize Clappr DOM on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    ClapprDOM.init();
});

// Export for use in other modules
window.ClapprPlayer = {
    init: initClapprPlayer,
    play: playClapprMedia,
    stop: stopClapprPlayer,
    pause: pauseClapprPlayer,
    resume: resumeClapprPlayer,
    changeSource: changeClapprSource,
    seek: seekClapprPlayer,
    getCurrentTime: getClapprCurrentTime,
    isPlaying: isClapprPlaying,
    setVolume: setClapprVolume,
    getVolume: getClapprVolume,
    toggleFullscreen: toggleClapprFullscreen,
    move: moveClapprPlayer,
    isActive: isClapprActive,
    destroy: () => ClapprPlayerState.destroy(),
    state: ClapprPlayerState,
    utils: ClapprStreamUtils
};

console.log('Clappr Player Module loaded');
