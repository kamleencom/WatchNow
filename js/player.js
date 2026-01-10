/**
 * Player Module
 * Handles all video playback using Video.js, channel navigation, and player controls.
 * Video.js.
 */
const PlayerState = {
    // Media engine instances
    // VideoJS manages its own instances internally in VideoJSPlayerState

    // Player display mode
    mode: {
        embedded: false,    // Playing in nested layout container
        fullScreen: false   // Playing in fullscreen overlay
    },

    // Timeout references
    // Timeout references
    timeouts: {},



    // Helper methods for common state operations
    reset() {

        this.mode.embedded = false;
        this.mode.fullScreen = false;
        this.clearTimeouts();
    },



    clearTimeouts() {
        // No timeouts currently
    },


};

/**
 * Cached DOM Element References
 * Initialized once to avoid repeated getElementById calls.
 * Note: nestedContainer uses a getter since it's dynamically created.
 */
const PlayerDOM = {

    overlay: null,

    closeBtn: null,
    infoSection: null,

    // Getter for nestedContainer - dynamically created based on layout mode
    get nestedContainer() {
        return document.getElementById('nested-player-container');
    },

    // Initialize all DOM references
    init() {

        this.overlay = document.getElementById('player-overlay');

        this.closeBtn = document.getElementById('close-player-btn');
        this.infoSection = document.getElementById('nested-player-info');
    }
};

// Video.js init removed. Native video is used directly.

/**
 * Setup native video element event listeners
 */


/**
 * Setup player basic listeners
 * Explicitly attached to window to ensure global availability
 */
window.setupPlayer = function () {
    console.log('Initializing Native Player Module...');

    // Initialize DOM cache
    PlayerDOM.init();

    // Setup Video Events
    // Setup Video Events - Removed (Handled by VideoJS)

    // Close button listener
    if (PlayerDOM.closeBtn) {
        PlayerDOM.closeBtn.addEventListener('click', closePlayer);
    }

    // Key listener for player controls
    document.addEventListener('keydown', (e) => {
        if (PlayerDOM.overlay && PlayerDOM.overlay.classList.contains('visible')) {
            // Back or Esc to close
            if (e.keyCode === 461 || e.keyCode === 27 || e.keyCode === 8) { // Back or Esc
                closePlayer();
                return;
            }


        }
    });
};

/**
 * Stream URL Utilities Module
 * Handles URL normalization, detection, and variant generation for Xtream and other stream formats.
 */
const StreamUrlUtils = {
    /**
     * Converts an Xtream Codes URL to proper format with /live/ prefix and extension.
     */
    normalizeXtreamUrl(url, extension = 'm3u8') {
        try {
            let normalizedUrl = url;

            // Remove existing extensions (.ts, .m3u8)
            normalizedUrl = normalizedUrl.replace(/\.(ts|m3u8)$/i, '');

            // Remove /live/ prefix if present to normalize
            normalizedUrl = normalizedUrl.replace(/\/live\//i, '/');

            const urlObj = new URL(normalizedUrl);
            const pathParts = urlObj.pathname.split('/').filter(p => p);

            // Need at least 3 parts: username/password/streamId
            if (pathParts.length < 3) {
                console.log('URL does not match Xtream pattern, returning as-is with extension');
                return url.replace(/\.(ts|m3u8)$/i, '') + '.' + extension;
            }

            // Extract parts
            const streamId = pathParts[pathParts.length - 1];
            const password = pathParts[pathParts.length - 2];
            const username = pathParts[pathParts.length - 3];

            // Build the base domain
            const domainParts = pathParts.slice(0, pathParts.length - 3);
            const domain = urlObj.origin + (domainParts.length > 0 ? '/' + domainParts.join('/') : '');

            // Build the proper Xtream URL with /live/ prefix
            const properUrl = `${domain}/live/${username}/${password}/${streamId}.${extension}`;

            console.log(`Normalized Xtream URL: ${url} -> ${properUrl}`);
            return properUrl;
        } catch (e) {
            console.error('Error normalizing Xtream URL:', e);
            return url.replace(/\.(ts|m3u8)$/i, '') + '.' + extension;
        }
    },

    /**
     * Detects if a URL is an Xtream Codes style stream URL.
     */
    isXtreamStyleUrl(url) {
        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/').filter(p => p);

            const filteredParts = pathParts.filter(p => p.toLowerCase() !== 'live');
            const lastPart = filteredParts[filteredParts.length - 1];
            const cleanLast = lastPart ? lastPart.replace(/\.(ts|m3u8)$/i, '') : '';
            const endsWithNumber = /^\d+$/.test(cleanLast);

            return endsWithNumber && filteredParts.length >= 3;
        } catch (e) {
            return false;
        }
    },

    /**
     * Checks if URL already has a streaming extension
     */
    hasStreamExtension(url) {
        return /\.(m3u8|ts|mp4|mkv|avi|flv|mov|webm)$/i.test(url);
    },

    /**
     * Checks if URL is a direct video file (MP4, MKV, etc.)
     */
    isDirectVideoFile(url) {
        return /\.(mp4|mkv|avi|flv|mov|webm)$/i.test(url);
    },

    /**
     * Gets the best URL to try for playback
     */
    getBestUrl(originalUrl) {
        const isXtream = this.isXtreamStyleUrl(originalUrl);
        const hasExt = this.hasStreamExtension(originalUrl);

        if (isXtream) {
            // For Xtream URLs, prefer HLS format with /live/ prefix
            return this.normalizeXtreamUrl(originalUrl, 'm3u8');
        } else if (!hasExt) {
            // No extension, try adding .m3u8
            return originalUrl + '.m3u8';
        }

        // Return as-is
        return originalUrl;
    },

    /**
     * Gets the MIME type for Video.js based on URL
     */
    getMimeType(url) {
        if (/\.m3u8$/i.test(url)) {
            return 'application/x-mpegURL';
        } else if (/\.mpd$/i.test(url)) {
            return 'application/dash+xml';
        } else if (/\.mp4$/i.test(url)) {
            return 'video/mp4';
        } else if (/\.webm$/i.test(url)) {
            return 'video/webm';
        } else if (/\.ts$/i.test(url)) {
            return 'video/mp2t';
        }
        // Default to HLS for unknown streams
        return 'application/x-mpegURL';
    }
};


/**
 * Main playback function
 */
async function playMedia(item, type = 'unknown') {
    // Determine the parent element for the player
    let playerParent = PlayerDOM.overlay;

    // Always use VideoJS
    const useVideoJS = true;

    // Check if we should use embedded mode (nested layout)
    // VideoJS player: embedded mode for ALL content types in nested layout
    const useEmbeddedMode = appSettings.layoutMode === 'nested' && PlayerDOM.nestedContainer;

    // Logic for Embedded vs Full Screen
    if (useEmbeddedMode) {
        // Embedded Mode (Nested Layout)
        PlayerState.mode.embedded = true;
        PlayerState.mode.fullScreen = false;
        playerParent = PlayerDOM.nestedContainer;

        // Hide placeholder and add video-playing class
        const placeholder = PlayerDOM.nestedContainer.querySelector('.placeholder-icon');
        if (placeholder) placeholder.style.display = 'none';
        PlayerDOM.nestedContainer.classList.add('video-playing');

        // Hide overlay elements if they were visible
        PlayerDOM.overlay.classList.remove('visible');
        PlayerDOM.overlay.classList.remove('video-playing');

        // Update Info Section
        updateNestedInfo(item);
    } else {
        // Standard Full Screen Mode
        PlayerState.mode.embedded = false;
        PlayerState.mode.fullScreen = true;
        playerParent = PlayerDOM.overlay;

        // Add video-playing class to player overlay
        PlayerDOM.overlay.classList.add('video-playing');
        PlayerDOM.overlay.classList.add('visible');
    }



    // Show loading state
    PlayerDOM.overlay.classList.add('loading');
    if (PlayerDOM.nestedContainer) PlayerDOM.nestedContainer.classList.add('loading');

    console.log(`=== Starting VideoJS Playback ===`);
    console.log('Type:', type);
    console.log('URL:', item.url);
    console.log('Player Parent:', playerParent === PlayerDOM.overlay ? 'Overlay (Fullscreen)' : 'Nested Container (Embedded)');

    // Play with VideoJS
    if (typeof VideoJSPlayer !== 'undefined') {
        VideoJSPlayer.play(item, type, playerParent);
    } else {
        console.error("VideoJSPlayer module not loaded!");
    }
}

function switchPlayerToFullScreen() {
    if (!PlayerState.mode.embedded) return;

    if (typeof VideoJSPlayer !== 'undefined' && VideoJSPlayer.isActive()) {
        // Move VideoJS player into overlay
        VideoJSPlayer.move(PlayerDOM.overlay);
    }

    PlayerDOM.overlay.classList.add('visible');
    PlayerState.mode.embedded = false;
    PlayerState.mode.fullScreen = true;
}

function switchPlayerToEmbedded() {
    if (appSettings.layoutMode !== 'nested') {
        closePlayer();
        return;
    }

    if (!PlayerDOM.nestedContainer) {
        closePlayer();
        return;
    }

    if (typeof VideoJSPlayer !== 'undefined' && VideoJSPlayer.isActive()) {
        // Move VideoJS player to nested container
        VideoJSPlayer.move(PlayerDOM.nestedContainer);
    }

    PlayerDOM.overlay.classList.remove('visible');

    PlayerState.mode.embedded = true;
    PlayerState.mode.fullScreen = false;



    if (!targetChannel) {
        targetChannel = document.querySelector('.nested-list-item.active');
    }

    if (targetChannel) {
        targetChannel.focus();
        if (typeof nav !== 'undefined' && nav.setFocus) {
            nav.setFocus(targetChannel, false);
        }
    }
}

/**
 * Centralized cleanup function for stopping all video playback.
 */
function cleanupPlayback() {
    // Cleanup VideoJS player if active
    if (typeof VideoJSPlayer !== 'undefined' && VideoJSPlayer.isActive()) {
        VideoJSPlayer.destroy();
    }
}



function closePlayer() {


    // Use centralized cleanup
    cleanupPlayback();



    PlayerDOM.overlay.classList.remove('visible');
    PlayerDOM.overlay.classList.remove('video-playing');
    PlayerState.mode.embedded = false;
    PlayerState.mode.fullScreen = false;

    // If we were embedded, show placeholder again and remove video-playing class
    if (PlayerDOM.nestedContainer) {
        PlayerDOM.nestedContainer.classList.remove('video-playing');
        const placeholder = PlayerDOM.nestedContainer.querySelector('.placeholder-icon');
        if (placeholder) placeholder.style.display = 'flex';



    }

    nav.focusFirst(); // Return focus
}



function updateNestedInfo(item) {
    const infoContainer = document.getElementById('nested-player-info');
    if (!infoContainer) return;

    const nameEl = document.getElementById('nested-channel-name');
    const logoContainer = infoContainer.querySelector('.channel-logo-large');
    const programTitle = document.getElementById('nested-program-title');
    const programDesc = document.getElementById('nested-program-desc');

    if (nameEl) nameEl.textContent = item.title;

    if (logoContainer) {
        if (item.logo) {
            logoContainer.innerHTML = `<img src="${item.logo}" alt="" onerror="this.parentElement.innerHTML='<span class=\\'placeholder-logo\\'><i data-lucide=\\'tv\\'></i></span>'; if(window.lucide) window.lucide.createIcons();">`;
        } else {
            logoContainer.innerHTML = `<span class="placeholder-logo"><i data-lucide="tv"></i></span>`;
            if (window.lucide && window.lucide.createIcons) window.lucide.createIcons({ root: logoContainer });
        }
    }

    // Reset program info since we don't have EPG data yet
    if (programTitle) programTitle.textContent = "No Program Information";
    if (programDesc) programDesc.textContent = "Select a channel from the list to start watching.";
}
