/**
 * PlayerContainer Component
 * Reusable player container HTML generation for Live TV, Movies, Series, and Catchup views.
 * Eliminates duplicated player container HTML across the codebase.
 */

class PlayerContainer {
    /**
     * Create a player container for Live TV / Catchup views
     * @param {Object} options - Configuration options
     * @param {boolean} options.showCatchupList - Show catchup programs list instead of program info
     * @param {string} options.placeholderText - Placeholder text for empty state
     * @returns {string} HTML string for the player container
     */
    static createLive(options = {}) {
        const {
            showCatchupList = false,
            placeholderText = 'Select a channel to play'
        } = options;

        const programInfoHtml = showCatchupList ? `
            <div class="catchup-programs-container">
                <h3 style="margin-bottom:10px; font-size:16px; color:#ddd;">Previous Programs</h3>
                <div id="catchup-list" class="catchup-list">
                    <div style="padding:20px; text-align:center; color:#666;">Select a channel to view previous programs.</div>
                </div>
            </div>
        ` : `
            <div class="program-info">
                <h3 id="nested-program-title">No Program Information</h3>
                <p id="nested-program-desc" class="program-description">Select a channel from the list to start watching.</p>
            </div>
        `;

        return `
            <div class="nested-content-wrapper">
                <div id="nested-player-container">
                    <div class="tv-static"></div>
                    <img src="assets/ok_logo.svg" alt="" class="player-logo-watermark">
                    <div class="placeholder-icon" style="display:flex; flex-direction:column; align-items:center;">
                        <span style="color: rgba(255,255,255,0.4); font-size: 13px; margin-top: 120px;">${placeholderText}</span>
                    </div>
                </div>
                <div id="nested-player-info">
                    <div class="info-header">
                        <div class="channel-logo-large">
                            <span class="placeholder-logo"><i data-lucide="tv"></i></span>
                        </div>
                        <div class="channel-details">
                            <h2 id="nested-channel-name" class="channel-name">Select a Channel</h2>
                        </div>
                    </div>
                    ${programInfoHtml}
                </div>
            </div>
        `;
    }

    /**
     * Create a player container for VOD (Movies) view
     * @param {Object} options - Configuration options
     * @param {string} options.placeholderText - Placeholder text for empty state
     * @param {boolean} options.showTrackInfo - Show track info container
     * @returns {string} HTML string for the player container
     */
    static createVod(options = {}) {
        const {
            placeholderText = "Click 'Play Now' to start",
            showTrackInfo = true
        } = options;

        const trackInfoHtml = showTrackInfo ? `
            <div id="track-info-container" class="track-info-panel" style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 8px; font-size: 13px; color: #ccc; display: none;"></div>
        ` : '';

        return `
            <div id="nested-player-container">
                <div class="tv-static"></div>
                <img src="assets/ok_logo.svg" alt="" class="player-logo-watermark">
                <div class="placeholder-icon">
                    <i data-lucide="play-circle" style="width:50px; height:50px; opacity:0.5; margin-bottom:10px;"></i>
                    <div style="color: rgba(255,255,255,0.4);">${placeholderText}</div>
                </div>
            </div>
            ${trackInfoHtml}
        `;
    }

    /**
     * Create a player container for Series view with episode section
     * @param {Object} options - Configuration options
     * @param {string} options.placeholderText - Placeholder text for empty state
     * @returns {string} HTML string for the player container with episodes section
     */
    static createSeries(options = {}) {
        const {
            placeholderText = 'Select an episode to play'
        } = options;

        return `
            <div class="main-player-section">
                <div class="player-column">
                    <div id="nested-player-container">
                        <div class="tv-static"></div>
                        <img src="assets/ok_logo.svg" alt="" class="player-logo-watermark">
                        <div class="placeholder-icon">
                            <i data-lucide="play-circle" style="width:50px; height:50px; opacity:0.5; margin-bottom:10px;"></i>
                            <div style="color: rgba(255,255,255,0.4);">${placeholderText}</div>
                        </div>
                    </div>
                    <div id="track-info-container" class="track-info-panel" style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 8px; font-size: 13px; color: #ccc; display: none;"></div>
                </div>
                <div class="episodes-section">
                    <div id="season-tabs" class="season-tabs"></div>
                    <div id="episodes-list" class="episodes-list-vertical"></div>
                </div>
            </div>
        `;
    }

    /**
     * Initialize lucide icons within a container
     * @param {HTMLElement} container - Container element
     */
    static initIcons(container) {
        if (window.lucide && container) {
            lucide.createIcons({ root: container });
        }
    }

    /**
     * Reset a player container to its initial state (with static/placeholder)
     * @param {HTMLElement} playerContainer - The #nested-player-container element
     * @param {string} placeholderText - Optional placeholder text
     */
    static reset(playerContainer, placeholderText = 'Select a channel to play') {
        if (!playerContainer) return;

        playerContainer.innerHTML = `
            <div class="tv-static"></div>
            <img src="assets/ok_logo.svg" alt="" class="player-logo-watermark">
            <div class="placeholder-icon" style="display:flex; flex-direction:column; align-items:center;">
                <span style="color: rgba(255,255,255,0.4); font-size: 13px; margin-top: 120px;">${placeholderText}</span>
            </div>
        `;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PlayerContainer;
}
