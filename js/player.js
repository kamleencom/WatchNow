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
    timeouts: {
        preview: null    // Auto-hide preview card timeout
    },

    // Channel navigation state
    channelNav: {
        isActive: false,           // Is channel nav enabled for current playback
        currentChannel: null,      // Currently playing channel object
        currentIndex: -1,          // Index in channelList
        channelList: [],           // Flat list of all channels for navigation
        previewVisible: false,     // Is preview card showing
        previewDirection: null,    // 'next' or 'prev'
        isTransitioning: false     // Is currently switching channels
    },

    // Helper methods for common state operations
    reset() {

        this.mode.embedded = false;
        this.mode.fullScreen = false;
        this.clearTimeouts();
        this.resetChannelNav();
    },



    clearTimeouts() {
        if (this.timeouts.preview) {
            clearTimeout(this.timeouts.preview);
            this.timeouts.preview = null;
        }
    },

    resetChannelNav() {
        this.channelNav.isActive = false;
        this.channelNav.currentChannel = null;
        this.channelNav.currentIndex = -1;
        this.channelNav.previewVisible = false;
        this.channelNav.previewDirection = null;
        this.channelNav.isTransitioning = false;
        // Note: channelList is kept to avoid rebuilding on every close
    }
};

/**
 * Cached DOM Element References
 * Initialized once to avoid repeated getElementById calls.
 * Note: nestedContainer uses a getter since it's dynamically created.
 */
const PlayerDOM = {

    overlay: null,
    previewCard: null,
    closeBtn: null,
    infoSection: null,

    // Getter for nestedContainer - dynamically created based on layout mode
    get nestedContainer() {
        return document.getElementById('nested-player-container');
    },

    // Initialize all DOM references
    init() {

        this.overlay = document.getElementById('player-overlay');
        this.previewCard = document.getElementById('next-channel-preview');
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

            // Handle channel navigation (up/down arrows)
            if (typeof handleChannelNavigation === 'function' && handleChannelNavigation(e)) {
                return; // Event was handled by channel navigation
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

    // Initialize channel navigation for live TV
    if (type === 'live' || type === 'channels') {
        initChannelNav(item);
    } else {
        PlayerState.channelNav.isActive = false;
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

    // Hide any visible preview
    hideNextChannelPreview();

    // Find and focus the currently playing channel in the channels panel
    let targetChannel = null;

    if (PlayerState.channelNav.currentChannel && PlayerState.channelNav.currentChannel.url) {
        const channelUrl = PlayerState.channelNav.currentChannel.url;
        const itemsSidebar = document.querySelector('.items-sidebar.visible');

        if (itemsSidebar) {
            const matchingBtn = itemsSidebar.querySelector(`.nested-list-item[data-url="${CSS.escape(channelUrl)}"]`);

            if (matchingBtn) {
                itemsSidebar.querySelectorAll('.nested-list-item').forEach(b => b.classList.remove('active'));
                matchingBtn.classList.add('active');
                targetChannel = matchingBtn;
            }
        }
    }

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
    // If in Full Screen & Nested Mode with channel navigation active -> Go back to Embedded
    // This only applies to Live TV, not movies/series
    if (PlayerState.mode.fullScreen && appSettings.layoutMode === 'nested' && PlayerState.channelNav.isActive) {
        switchPlayerToEmbedded();
        return;
    }

    // Use centralized cleanup
    cleanupPlayback();

    hideNextChannelPreview();

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


// --- Channel Navigation Feature ---

/**
 * Builds a flat list of all channels for navigation
 */
function buildChannelList() {
    const channels = [];
    const channelData = state.aggregatedData.channels;

    // Flatten all channel groups into a single array
    Object.keys(channelData).sort().forEach(group => {
        channelData[group].forEach(channel => {
            channels.push({
                ...channel,
                group: group
            });
        });
    });

    return channels;
}

/**
 * Initializes channel navigation when a channel starts playing
 */
function initChannelNav(playingChannel) {
    if (PlayerState.channelNav.channelList.length === 0) {
        PlayerState.channelNav.channelList = buildChannelList();
    }

    const index = PlayerState.channelNav.channelList.findIndex(ch => ch.url === playingChannel.url);

    PlayerState.channelNav.currentChannel = playingChannel;
    PlayerState.channelNav.currentIndex = index;
    PlayerState.channelNav.isActive = true;
    PlayerState.channelNav.previewVisible = false;
    PlayerState.channelNav.isTransitioning = false;

    console.log(`Channel Nav initialized. Index: ${index}/${PlayerState.channelNav.channelList.length}`);
}

/**
 * Resets channel navigation state
 */
function resetChannelNavState() {
    PlayerState.resetChannelNav();
    PlayerState.clearTimeouts();
}

/**
 * Calculates the channel index for a given direction (wraps around)
 */
function calculateChannelIndex(direction) {
    const listLength = PlayerState.channelNav.channelList.length;
    if (listLength === 0) return -1;

    const currentIndex = PlayerState.channelNav.currentIndex;

    if (direction === 'next') {
        return (currentIndex + 1) % listLength;
    } else {
        return currentIndex - 1 < 0 ? listLength - 1 : currentIndex - 1;
    }
}

/**
 * Gets the next channel in the list (wraps around)
 */
function getNextChannel() {
    const index = calculateChannelIndex('next');
    return index >= 0 ? PlayerState.channelNav.channelList[index] : null;
}

/**
 * Gets the previous channel in the list (wraps around)
 */
function getPreviousChannel() {
    const index = calculateChannelIndex('prev');
    return index >= 0 ? PlayerState.channelNav.channelList[index] : null;
}

/**
 * Shows the channel preview card for a given direction
 */
function showChannelPreview(direction) {
    let targetChannel = null;
    let label = '';

    if (direction === 'next') {
        targetChannel = getNextChannel();
        label = 'Next Channel';
    } else {
        targetChannel = getPreviousChannel();
        label = 'Previous Channel';
    }

    if (!targetChannel) return;
    if (!PlayerDOM.previewCard) return;

    // Populate data
    PlayerDOM.previewCard.querySelector('.preview-title').textContent = targetChannel.title;
    PlayerDOM.previewCard.querySelector('.preview-label').textContent = label;
    PlayerDOM.previewCard.querySelector('.preview-meta').textContent = direction === 'next' ? 'Press ▼ to switch' : 'Press ▲ to switch';

    // Show card
    PlayerDOM.previewCard.classList.remove('preview-next', 'preview-prev');
    PlayerDOM.previewCard.classList.add(direction === 'next' ? 'preview-next' : 'preview-prev');
    PlayerDOM.previewCard.classList.add('visible');
    PlayerState.channelNav.previewVisible = true;
    PlayerState.channelNav.previewDirection = direction;

    // Auto hide after 5 seconds
    PlayerState.clearTimeouts();
    PlayerState.timeouts.preview = setTimeout(() => {
        hideNextChannelPreview();
    }, 5000);
}

/**
 * Hides the next channel preview card
 */
function hideNextChannelPreview() {
    if (PlayerDOM.previewCard) {
        PlayerDOM.previewCard.classList.remove('visible');
    }
    PlayerState.channelNav.previewVisible = false;
    PlayerState.clearTimeouts();
    PlayerState.channelNav.previewDirection = null;
}

/**
 * Switches to a channel in the specified direction
 */
function switchChannel(direction) {
    if (PlayerState.channelNav.isTransitioning) return;

    const isNext = direction === 'next';
    const targetChannel = isNext ? getNextChannel() : getPreviousChannel();
    if (!targetChannel) return;

    PlayerState.channelNav.isTransitioning = true;
    hideNextChannelPreview();

    console.log(`Switching to ${direction} channel:`, targetChannel.title);

    // Show channel switch indicator
    showChannelSwitchIndicator(targetChannel.title, isNext ? 'down' : 'up');

    // Cleanup current playback
    cleanupPlayback();

    // Update state
    PlayerState.channelNav.currentIndex = calculateChannelIndex(direction);
    PlayerState.channelNav.currentChannel = targetChannel;

    // Play the target channel using VideoJS
    setTimeout(() => {
        if (typeof VideoJSPlayer !== 'undefined') {
            const playerParent = PlayerState.mode.embedded ? PlayerDOM.nestedContainer : PlayerDOM.overlay;
            VideoJSPlayer.play(targetChannel, 'live', playerParent);
        }
        PlayerState.channelNav.isTransitioning = false;
    }, 300);
}

/**
 * Shows a brief channel switch indicator
 */
function showChannelSwitchIndicator(channelName, direction) {
    const existing = document.querySelector('.channel-switch-indicator');
    if (existing) existing.remove();

    const indicator = document.createElement('div');
    indicator.className = `channel-switch-indicator ${direction}`;
    indicator.textContent = channelName;

    PlayerDOM.overlay.appendChild(indicator);

    setTimeout(() => {
        indicator.remove();
    }, 1500);
}

/**
 * Handles channel navigation key presses
 */
function handleChannelNavigation(event) {
    if (!PlayerState.channelNav.isActive) return false;
    if (PlayerState.channelNav.isTransitioning) return true;

    if (!PlayerDOM.overlay.classList.contains('visible')) return false;

    const isDownKey = event.keyCode === 40 || event.key === 'ArrowDown';
    const isUpKey = event.keyCode === 38 || event.key === 'ArrowUp';

    if (isDownKey) {
        event.preventDefault();
        event.stopPropagation();

        if (PlayerState.channelNav.previewVisible && PlayerState.channelNav.previewDirection === 'next') {
            switchChannel('next');
        } else {
            showChannelPreview('next');
        }
        return true;
    }

    if (isUpKey) {
        event.preventDefault();
        event.stopPropagation();

        if (PlayerState.channelNav.previewVisible && PlayerState.channelNav.previewDirection === 'prev') {
            switchChannel('prev');
        } else {
            showChannelPreview('prev');
        }
        return true;
    }

    // Left/Right - hide preview if visible
    const isLeftRight = event.keyCode === 37 || event.keyCode === 39 ||
        event.key === 'ArrowLeft' || event.key === 'ArrowRight';
    if (isLeftRight && PlayerState.channelNav.previewVisible) {
        hideNextChannelPreview();
    }

    return false;
}

/**
 * Updates the info section in the nested layout with the current channel details.
 */
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
