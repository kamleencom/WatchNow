/**
 * Player Module
 * Handles all video playback using Video.js, channel navigation, and player controls.
 * Video.js provides native support for HLS, audio tracks, and subtitles.
 */

/**
 * Centralized Player State Object
 * Single source of truth for all player-related state.
 */
const PlayerState = {
    // Media engine instances
    hls: null,      // Hls.js instance
    mpegts: null,   // mpegts.js instance

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
        this.destroyEngines();
        this.mode.embedded = false;
        this.mode.fullScreen = false;
        this.clearTimeouts();
        this.resetChannelNav();
    },

    destroyEngines() {
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }
        if (this.mpegts) {
            this.mpegts.pause();
            this.mpegts.unload();
            this.mpegts.detachMediaElement();
            this.mpegts.destroy();
            this.mpegts = null;
        }
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
    videoElement: null,
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
        this.videoElement = document.getElementById('video-player');
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
function setupVideoEvents() {
    const video = PlayerDOM.videoElement;
    if (!video) return;

    const setLoaderState = (isLoading) => {
        if (isLoading) {
            PlayerDOM.overlay?.classList.add('loading');
            if (PlayerDOM.nestedContainer) PlayerDOM.nestedContainer.classList.add('loading');
        } else {
            PlayerDOM.overlay?.classList.remove('loading');
            if (PlayerDOM.nestedContainer) PlayerDOM.nestedContainer.classList.remove('loading');
        }
    };

    video.addEventListener('waiting', () => setLoaderState(true));
    video.addEventListener('playing', () => setLoaderState(false));
    video.addEventListener('loadstart', () => setLoaderState(true));
    video.addEventListener('canplay', () => setLoaderState(false));
    video.addEventListener('error', (e) => {
        setLoaderState(false);
        console.error('Video Element Error:', video.error);
    });

    video.addEventListener('loadedmetadata', () => {
        console.log(`Media loaded - Resolution: ${video.videoWidth}x${video.videoHeight}`);
    });
}

/**
 * Setup player basic listeners
 * Explicitly attached to window to ensure global availability
 */
window.setupPlayer = function () {
    console.log('Initializing Native Player Module...');

    // Initialize DOM cache
    PlayerDOM.init();

    // Setup Video Events
    setupVideoEvents();

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
    const video = PlayerDOM.videoElement;
    const useClappr = appSettings.playerType === 'clappr' && typeof ClapprPlayer !== 'undefined';

    if (!useClappr && !video) {
        console.error('Video element not found');
        return;
    }

    // Determine the parent element for the player
    let playerParent = PlayerDOM.overlay;

    // Check if we should use embedded mode (nested layout)
    // For native HTML5 player: embedded mode only for live TV
    // For Clappr player: embedded mode for ALL content types in nested layout
    const useEmbeddedMode = appSettings.layoutMode === 'nested' && PlayerDOM.nestedContainer &&
        (type === 'live' || useClappr);

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

        // Move video element to nested container (for HTML5 player)
        if (!useClappr && video && video.parentElement !== PlayerDOM.nestedContainer) {
            PlayerDOM.nestedContainer.appendChild(video);
        }

        // Hide overlay elements if they were visible
        PlayerDOM.overlay.classList.remove('visible');
        PlayerDOM.overlay.classList.remove('video-playing');

        // Update Info Section
        updateNestedInfo(item);
    } else {
        // Standard Full Screen Mode (Cards layout or HTML5 player with movies/series)
        PlayerState.mode.embedded = false;
        PlayerState.mode.fullScreen = true;
        playerParent = PlayerDOM.overlay;

        // Add video-playing class to player overlay
        PlayerDOM.overlay.classList.add('video-playing');

        // Move video element back to overlay if needed (for HTML5 player)
        if (!useClappr && video && video.parentElement !== PlayerDOM.overlay) {
            PlayerDOM.overlay.insertBefore(video, PlayerDOM.previewCard);
        }

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

    const originalUrl = item.url;
    console.log(`=== Starting ${useClappr ? 'Clappr' : 'Native'} Playback ===`);
    console.log('Type:', type);
    console.log('Original URL:', originalUrl);
    console.log('Player Parent:', playerParent === PlayerDOM.overlay ? 'Overlay (Fullscreen)' : 'Nested Container (Embedded)');

    // Play the item using the appropriate player
    if (useClappr) {
        // Use Clappr player for all content types
        playClapprDirect(item, playerParent, type);
    } else {
        // Use native HTML5 player
        playChannelDirect(item);
        if (video) video.focus();
    }
}

function switchPlayerToFullScreen() {
    if (!PlayerState.mode.embedded) return;

    const useClappr = appSettings.playerType === 'clappr' && typeof ClapprPlayer !== 'undefined' && ClapprPlayer.isActive();

    if (useClappr) {
        // Move Clappr player to overlay
        ClapprPlayer.move(PlayerDOM.overlay);
    } else {
        const video = PlayerDOM.videoElement;
        if (!video) return;
        // Move video element back to overlay
        PlayerDOM.overlay.insertBefore(video, PlayerDOM.previewCard);
        video.focus();
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

    const useClappr = appSettings.playerType === 'clappr' && typeof ClapprPlayer !== 'undefined' && ClapprPlayer.isActive();

    if (useClappr) {
        // Move Clappr player to nested container
        ClapprPlayer.move(PlayerDOM.nestedContainer);
    } else {
        const video = PlayerDOM.videoElement;
        if (!video) return;
        // Move video element to embedded
        PlayerDOM.nestedContainer.appendChild(video);
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
    // Cleanup native HTML5 player
    const video = PlayerDOM.videoElement;
    if (video) {
        video.pause();
        video.src = "";
        video.load();
    }
    PlayerState.destroyEngines();

    // Cleanup Clappr player if active
    if (typeof ClapprPlayer !== 'undefined' && ClapprPlayer.isActive()) {
        ClapprPlayer.stop();
    }
}

/**
 * Plays media using Clappr player directly
 * @param {Object} item - Media item to play
 * @param {HTMLElement} parentElement - Parent element for the player
 * @param {string} type - Content type (live, movies, series)
 */
function playClapprDirect(item, parentElement, type = 'unknown') {
    if (typeof ClapprPlayer === 'undefined') {
        console.error('ClapprPlayer not available, falling back to native player');
        playChannelDirect(item);
        return;
    }

    // Stop any existing Clappr playback
    ClapprPlayer.stop();

    // Hide the native video element
    const video = PlayerDOM.videoElement;
    if (video) {
        video.style.display = 'none';
        video.pause();
        video.src = "";
    }

    // Determine the content type for Clappr
    const contentType = type || (PlayerState.channelNav.isActive ? 'live' : 'unknown');

    console.log(`Clappr: Playing ${contentType} content in ${parentElement === PlayerDOM.overlay ? 'overlay' : 'nested container'}`);

    // Start Clappr playback
    const success = ClapprPlayer.play(item, contentType, parentElement);

    if (!success) {
        console.warn('Clappr playback failed, falling back to native player');
        if (video) video.style.display = '';
        playChannelDirect(item);
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

        // Move video element back to overlay to reset state
        const video = PlayerDOM.videoElement;
        if (video) {
            video.style.display = ''; // Restore visibility
            PlayerDOM.overlay.insertBefore(video, PlayerDOM.previewCard);
        }
    }

    // Restore native video visibility (in case Clappr was used)
    const video = PlayerDOM.videoElement;
    if (video) {
        video.style.display = '';
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

    // Determine player type
    const useClappr = appSettings.playerType === 'clappr' && typeof ClapprPlayer !== 'undefined';

    // Play the target channel using appropriate player
    setTimeout(() => {
        if (useClappr) {
            // Determine parent for Clappr
            const playerParent = PlayerState.mode.embedded ? PlayerDOM.nestedContainer : PlayerDOM.overlay;
            playClapprDirect(targetChannel, playerParent, 'live');
        } else {
            playChannelDirect(targetChannel);
        }
        PlayerState.channelNav.isTransitioning = false;
    }, 300);
}

/**
 * Plays a channel directly (used for channel switching)
 */
function playChannelDirect(channel) {
    const video = PlayerDOM.videoElement;
    if (!video) return;

    // Clean up existing engines
    PlayerState.destroyEngines();

    const playbackUrl = StreamUrlUtils.getBestUrl(channel.url);
    console.log('Playing channel directly:', playbackUrl);

    // 1. Check for HLS (.m3u8)
    if (playbackUrl.includes('.m3u8') && typeof Hls !== 'undefined') {
        if (Hls.isSupported()) {
            const hls = new Hls();
            hls.loadSource(playbackUrl);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                video.play().catch(e => console.error("HLS playback failed", e));
            });
            PlayerState.hls = hls;
            return;
        }
    }

    // 2. Check for HTTP-TS (.ts)
    if (playbackUrl.includes('.ts') && typeof mpegts !== 'undefined') {
        if (mpegts.getFeatureList().mseLivePlayback) {
            const player = mpegts.createPlayer({
                type: 'mse',
                isLive: true,
                url: playbackUrl
            });
            player.attachMediaElement(video);
            player.load();
            player.play().catch(e => console.error("MPEG-TS playback failed", e));
            PlayerState.mpegts = player;
            return;
        }
    }

    // 3. Fallback to native video src
    video.src = playbackUrl;
    video.play().catch(e => {
        console.warn('Native channel playback error:', e);
        // Try original URL if transformed one fails
        if (playbackUrl !== channel.url) {
            video.src = channel.url;
            video.play().catch(err => console.error('Fallback failed:', err));
        }
    });
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
