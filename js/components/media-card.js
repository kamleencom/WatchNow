/**
 * MediaCard Component
 * A unified, reusable card component for movies, series, and channels
 * Supports variations: simple card, continue watching card with progress, and bucket cards
 */

class MediaCard {
    /**
     * Create a media card
     * @param {Object} item - The media item data
     * @param {string} type - Type of card: 'movies', 'series', 'live', 'bucket'
     * @param {Object} options - Configuration options
     * @param {boolean} options.showProgress - Show progress bar (for continue watching)
     * @param {number} options.progressPercent - Progress percentage (0-100)
     * @param {number} options.progressTime - Current watch time in seconds
     * @param {number} options.progressDuration - Total duration in seconds
     * @param {Object} options.continueWatchingMeta - Metadata for continue watching (season, episode, etc.)
     * @param {Function} options.onClick - Custom click handler
     * @param {Function} options.onFavoriteToggle - Custom favorite toggle handler
     * @param {boolean} options.showFavoriteButton - Show the favorite button (default: true)

     * @param {string} options.width - Custom width
     * @param {string} options.height - Custom height
     * @param {boolean} options.isBucketCard - Render as a bucket folder card
     * @returns {HTMLElement} The card element
     */
    static create(item, type, options = {}) {
        const {
            showProgress = false,
            progressPercent = 0,
            progressTime = 0,
            progressDuration = 0,
            continueWatchingMeta = {},
            onClick = null,
            onFavoriteToggle = null,
            showFavoriteButton = true,

            width = null,
            height = null,
            isBucketCard = false
        } = options;

        // If it's a bucket card, render specially
        if (isBucketCard) {
            return this._createBucketCard(item, type, options);
        }

        // If showProgress is true, wrap the card in a continue watching wrapper
        if (showProgress) {
            return this._createContinueWatchingCard(item, type, options);
        }

        // Otherwise create a standard card
        return this._createStandardCard(item, type, options);
    }

    /**
     * Create a standard media card (movies, series, channels)
     * @private
     */
    static _createStandardCard(item, type, options = {}) {
        const {
            onClick = null,
            onFavoriteToggle = null,
            showFavoriteButton = true,

            width = null,
            height = null
        } = options;

        // Ensure unique URL ID for series/movies if missing (crucial for favorites)
        if (!item.url) {
            if (type === 'series' && (item.id || item.series_id)) {
                item.url = `series://${item.id || item.series_id}`;
            } else if (type === 'movies' && (item.id || item.stream_id)) {
                item.url = `movie://${item.id || item.stream_id}`;
            } else if (item.id) {
                // Fallback
                item.url = `item://${item.id}`;
            }
        }

        const card = document.createElement('div');
        card.className = `card card-${type === 'live' ? 'channel' : type} focusable`;
        card.tabIndex = -1;
        card.dataset.url = item.url;

        // Store item data for favorites
        const favoriteType = type === 'live' ? 'channels' : type;
        card.dataset.favoriteType = favoriteType;
        card.dataset.itemData = JSON.stringify(item);

        // Apply custom dimensions if provided
        if (width) card.style.width = width;
        if (height) card.style.height = height;

        // Create image
        const img = document.createElement('img');
        img.className = 'card-image';
        img.loading = 'lazy';

        // Generate appropriate placeholder
        const placeholder = this._getPlaceholder(item.title, type);

        // Set source
        if (item.logo) {
            img.src = item.logo;
            img.onerror = () => {
                img.src = placeholder;
                img.style.objectFit = 'cover';
            };
        } else {
            img.src = placeholder;
            img.style.objectFit = 'cover';
        }

        card.appendChild(img);

        // Favorite Button
        if (showFavoriteButton) {
            const isFavorite = this._isItemFavorite(item, favoriteType);
            const favBtn = document.createElement('button');
            favBtn.className = `favorite-btn ${isFavorite ? 'active' : ''}`;
            favBtn.innerHTML = `<i data-lucide="star" style="${isFavorite ? 'fill: currentColor;' : ''}"></i>`;
            favBtn.title = isFavorite ? 'Remove from Favorites' : 'Add to Favorites';
            if (window.lucide) {
                lucide.createIcons({ root: favBtn });
            }

            favBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (onFavoriteToggle) {
                    onFavoriteToggle(item, favoriteType, favBtn);
                } else if (typeof toggleFavorite !== 'undefined') {
                    toggleFavorite(item, favoriteType, favBtn);
                }
            });

            card.appendChild(favBtn);
        }

        // Overlay with Title + Badges + Status
        const overlay = document.createElement('div');
        overlay.className = 'card-overlay';

        // Add Badges if present
        if (item.badges && item.badges.length) {
            const badgesDiv = document.createElement('div');
            badgesDiv.className = 'card-badges';
            item.badges.forEach(b => {
                if (b === 'CATCHUP') return; // Skip CATCHUP on cards
                const span = document.createElement('span');
                span.className = 'badge';
                span.textContent = b;
                badgesDiv.appendChild(span);
            });
            if (badgesDiv.hasChildNodes()) overlay.appendChild(badgesDiv);
        }

        const titleDiv = document.createElement('div');
        titleDiv.className = 'card-title';
        titleDiv.textContent = item.title || item.name || 'Unknown';



        overlay.appendChild(titleDiv);
        card.appendChild(overlay);

        // Track focus for yellow button
        card.addEventListener('focus', () => {
            if (typeof state !== 'undefined') {
                state.focusedItem = { item, type: favoriteType, card };
            }
        });

        // Click handler
        card.addEventListener('click', () => {


            if (onClick) {
                onClick(item, type, card);
            } else {
                // Default click behavior
                if (type === 'live') {
                    if (typeof updatePlayerInfo !== 'undefined') {
                        updatePlayerInfo(item);
                    }
                    if (typeof VideoPlayer !== 'undefined') {
                        VideoPlayer.play(item, type);
                    }
                } else {
                    // Movies & Series -> Click opens detail panel in nested view
                    if (typeof handleNestedMediaClick !== 'undefined') {
                        handleNestedMediaClick(item, type, card);
                    }
                }
            }
        });



        return card;
    }

    /**
     * Create a continue watching card with progress bar and metadata
     * @private
     */
    static _createContinueWatchingCard(item, type, options = {}) {
        const {
            progressPercent = 0,
            progressTime = 0,
            progressDuration = 0,
            continueWatchingMeta = {},
            onClick = null,
            width = '220px',
            height = '330px'
        } = options;

        // WRAPPER: Contains Card (Image) + Meta (Text below)
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.gap = '10px';
        wrapper.style.width = width;
        wrapper.style.flex = '0 0 auto';

        // Create the base card
        const cardOptions = {
            ...options,
            showProgress: false, // Prevent recursion

            width: '100%',
            height: height
        };
        const card = this._createStandardCard(item, type, cardOptions);

        // Override card styles for wrapper context
        card.style.flex = 'none';
        card.style.marginBottom = '0';

        // Remove default click handler and add custom one
        const newCard = card.cloneNode(true);

        // Re-attach focus tracking
        newCard.addEventListener('focus', () => {
            if (typeof state !== 'undefined') {
                state.focusedItem = { item, type, card: newCard };
            }
        });
        newCard.addEventListener('mouseenter', () => {
            if (typeof state !== 'undefined') {
                state.focusedItem = { item, type, card: newCard };
            }
        });

        // Re-add favorite button functionality
        const favBtn = newCard.querySelector('.favorite-btn');
        if (favBtn) {
            favBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const favoriteType = type === 'live' ? 'channels' : type;
                if (typeof toggleFavorite !== 'undefined') {
                    toggleFavorite(item, favoriteType, favBtn);
                }
            });
        }

        // Add custom click handler for continue watching
        newCard.addEventListener('click', () => {
            if (onClick) {
                onClick(item, type, newCard, continueWatchingMeta);
            }
        });

        // Add Progress Bar (On the card image, bottom edge)
        const percent = Math.min(100, Math.max(0, progressPercent));
        const barContainer = document.createElement('div');
        barContainer.style.position = 'absolute';
        barContainer.style.bottom = '0';
        barContainer.style.left = '0';
        barContainer.style.width = '100%';
        barContainer.style.height = '4px';
        barContainer.style.background = 'rgba(255,255,255,0.2)';
        barContainer.style.zIndex = '20';

        const barFill = document.createElement('div');
        barFill.style.width = `${percent}%`;
        barFill.style.height = '100%';
        barFill.style.background = 'var(--primary-color)';
        barContainer.appendChild(barFill);

        newCard.appendChild(barContainer);

        // Adjust overlay background
        const defaultOverlay = newCard.querySelector('.card-overlay');
        if (defaultOverlay) {
            defaultOverlay.style.background = 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)';
        }

        wrapper.appendChild(newCard);

        // Add META INFO (Text Below Card)
        const metaRow = document.createElement('div');
        metaRow.style.display = 'flex';
        metaRow.style.justifyContent = 'space-between';
        metaRow.style.alignItems = 'center';
        metaRow.style.padding = '0 4px';
        metaRow.style.opacity = '0.8';

        // Left Side: Icon + S/E or type info
        const leftTags = document.createElement('div');
        leftTags.style.display = 'flex';
        leftTags.style.alignItems = 'center';
        leftTags.style.gap = '8px';
        leftTags.style.color = '#a1a1aa';
        leftTags.style.fontSize = '18px';
        leftTags.style.fontWeight = '500';

        let iconName = 'film'; // Default movie
        if (type === 'series') iconName = 'clapperboard';
        else if (type === 'live') iconName = 'tv';

        let tagText = '';
        if (type === 'series') {
            const { season, episode } = continueWatchingMeta;
            if (season && episode) {
                tagText = `S${season} E${episode}`;
            } else {
                tagText = 'Series';
            }
        }

        leftTags.innerHTML = `
            <i data-lucide="${iconName}" style="width:22px; height:22px;"></i>
            <span>${tagText}</span>
        `;

        // Right Side: Percentage
        const rightTag = document.createElement('div');
        rightTag.className = 'watch-percentage';
        rightTag.style.fontSize = '22px';
        rightTag.style.color = 'var(--primary-color)';
        rightTag.style.fontWeight = 'bold';
        rightTag.textContent = `${Math.round(percent)}%`;

        metaRow.appendChild(leftTags);
        metaRow.appendChild(rightTag);

        wrapper.appendChild(metaRow);

        // Initialize Lucide icons
        if (window.lucide) {
            lucide.createIcons({ root: wrapper });
        }

        return wrapper;
    }

    /**
     * Create a bucket folder card
     * @private
     */
    static _createBucketCard(item, type, options = {}) {
        const {
            onClick = null,
            width = '340px',
            height = '220px'
        } = options;

        const card = document.createElement('div');
        card.className = 'card focusable bucket-card';
        card.tabIndex = 0;
        card.style.flex = '0 0 auto';
        card.style.width = width;
        card.style.height = height;
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.justifyContent = 'center';
        card.style.alignItems = 'center';
        card.style.cursor = 'pointer';
        card.style.background = 'rgba(168, 85, 247, 0.1)';
        // Use same border as regular cards for consistent focus selector
        // (6px transparent border that becomes visible on focus via CSS)
        // Note: Will need inner border for visual separation

        // Determine icon based on type
        let iconName = 'folder';
        if (type === 'channels' || type === 'live') iconName = 'tv';
        else if (type === 'movies') iconName = 'film';
        else if (type === 'series') iconName = 'clapperboard';

        card.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 20px; width: 100%; height: 100%; box-sizing: border-box;">
                <i data-lucide="${iconName}" style="width: 48px; height: 48px; color: var(--primary-color);"></i>
                <span style="font-size: 20px; font-weight: 600; text-align: center; padding: 0 12px;">${item.name || item.title}</span>
                <span style="font-size: 16px; opacity: 0.6; text-transform: capitalize;">${type}</span>
            </div>
        `;

        // Add click handler
        if (onClick) {
            card.addEventListener('click', () => onClick(item, type, card));
        }

        // Initialize Lucide icons
        if (window.lucide) {
            lucide.createIcons({ root: card });
        }

        return card;
    }

    /**
     * Generate placeholder image for a card
     * @private
     */
    /**
     * Generate placeholder image for a card
     * @private
     */
    static _getPlaceholder(title, type) {
        if (typeof getPlaceholder !== 'undefined') {
            return getPlaceholder(title, type);
        }
        return '';
    }

    /**
     * Check if an item is in favorites
     * @private
     */
    static _isItemFavorite(item, favoriteType) {
        // Use favoritesManager directly if available
        if (typeof favoritesManager !== 'undefined') {
            return favoritesManager.isItemFavorite(item, favoriteType);
        }

        // Fallback to state.favorites
        if (typeof state !== 'undefined' && state.favorites && state.favorites[favoriteType]) {
            return state.favorites[favoriteType].some(fav => fav.url === item.url);
        }
        return false;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MediaCard;
}
