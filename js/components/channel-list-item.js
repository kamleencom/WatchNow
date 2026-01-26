/**
 * ChannelListItem Component
 * Reusable channel list item creation for Live TV, Catchup, and Favorites views.
 * Eliminates duplicated channel list item HTML generation across the codebase.
 */

class ChannelListItem {
    /**
     * Create a channel list item element
     * @param {Object} item - The channel item data
     * @param {Object} options - Configuration options
     * @param {boolean} options.showFavoriteIcon - Show star icon if item is favorite (default: true)
     * @param {boolean} options.alwaysShowStar - Always show star regardless of favorite status (default: false)
     * @param {Function} options.onClick - Click handler function
     * @param {string} options.favoriteType - Type for favorite checking ('channels', 'movies', 'series')
     * @param {Function} options.onFocus - Focus handler function
     * @returns {HTMLElement} The channel list item element
     */
    static create(item, options = {}) {
        const {
            showFavoriteIcon = true,
            alwaysShowStar = false,
            onClick = null,
            favoriteType = 'channels',
            onFocus = null
        } = options;

        const btn = document.createElement('div');
        btn.className = 'nested-list-item focusable';
        btn.tabIndex = 0;
        btn.dataset.url = item.url;

        // Build logo HTML
        const logoHtml = this._buildLogoHtml(item);

        // Build badges HTML
        const badgesHtml = this._buildBadgesHtml(item);

        // Build favorite icon HTML
        const favoriteHtml = this._buildFavoriteHtml(item, favoriteType, showFavoriteIcon, alwaysShowStar);

        // Assemble the inner HTML
        btn.innerHTML = `
            <div class="channel-list-content" style="display:flex; align-items:center;">
                ${favoriteHtml}
                ${logoHtml}
                <div class="channel-info-row" style="display:flex; align-items:center; flex:1; min-width:0;">
                    <span class="channel-list-title" style="margin-right:8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.title || item.name}</span>
                    ${badgesHtml}
                </div>
            </div>
        `;

        // Add click handler
        if (onClick) {
            btn.addEventListener('click', () => onClick(item, btn));
        }

        // Add keyboard support
        btn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') btn.click();
        });

        // Add focus handler for favorites tracking
        if (onFocus) {
            btn.addEventListener('focus', () => onFocus(item, favoriteType, btn));
        } else {
            // Default focus tracking for state.focusedItem
            btn.addEventListener('focus', () => {
                if (typeof state !== 'undefined') {
                    state.focusedItem = { item, type: favoriteType, card: btn };
                }
            });
        }

        // Initialize lucide icons for this item
        if (window.lucide) {
            lucide.createIcons({ root: btn });
        }

        return btn;
    }

    /**
     * Build logo HTML for the channel
     * @private
     */
    static _buildLogoHtml(item) {
        if (item.logo) {
            return `<img src="${item.logo}" alt="" class="channel-list-logo" onerror="window.handleChannelLogoError(this)">`;
        }
        return `<span class="channel-list-icon"><i data-lucide="tv"></i></span>`;
    }

    /**
     * Build badges HTML for the channel
     * @private
     */
    static _buildBadgesHtml(item) {
        if (!item.badges || !item.badges.length) {
            return '';
        }

        let badgesHtml = '<div class="channel-badges">';
        item.badges.forEach(b => {
            if (b === 'CATCHUP') {
                badgesHtml += '<span class="badge badge-catchup" title="Catchup Available"><i data-lucide="clock" style="width:18px; height:18px;"></i></span>';
            } else {
                badgesHtml += `<span class="badge">${b}</span>`;
            }
        });
        badgesHtml += '</div>';

        return badgesHtml;
    }

    /**
     * Build favorite icon HTML
     * @private
     */
    static _buildFavoriteHtml(item, favoriteType, showFavoriteIcon, alwaysShowStar) {
        if (!showFavoriteIcon && !alwaysShowStar) {
            return '';
        }

        let isFav = alwaysShowStar;

        if (!alwaysShowStar && typeof favoritesManager !== 'undefined') {
            isFav = favoritesManager.isItemFavorite(item, favoriteType);
        }

        if (isFav) {
            return `<span class="favorite-icon-container" style="display:flex; align-items:center; margin-right:8px;">
                <i data-lucide="star" style="width:20px; height:20px; color:#ffb020; fill:currentColor;"></i>
            </span>`;
        }

        // Return empty container for consistent layout (can be updated later)
        return `<span class="favorite-icon-container" style="display:flex; align-items:center;"></span>`;
    }

    /**
     * Create multiple channel list items and append to a container
     * @param {Array} items - Array of channel items
     * @param {HTMLElement} container - Container element to append to
     * @param {Object} options - Options to pass to each item
     * @returns {HTMLElement|null} First created element (for focus handling)
     */
    static createList(items, container, options = {}) {
        if (!container || !Array.isArray(items)) return null;

        let firstElement = null;

        items.forEach((item, index) => {
            const element = this.create(item, options);
            container.appendChild(element);

            if (index === 0) {
                firstElement = element;
            }
        });

        return firstElement;
    }

    /**
     * Update the favorite icon state on an existing list item
     * @param {HTMLElement} listItem - The list item element
     * @param {boolean} isFavorite - Whether the item is now a favorite
     */
    static updateFavoriteState(listItem, isFavorite) {
        if (!listItem) return;

        const container = listItem.querySelector('.favorite-icon-container');
        if (!container) return;

        if (isFavorite) {
            container.innerHTML = '<i data-lucide="star" style="width:20px; height:20px; color:#ffb020; fill:currentColor;"></i>';
            container.style.marginRight = '8px';
        } else {
            container.innerHTML = '';
            container.style.marginRight = '0px';
        }

        if (window.lucide) {
            lucide.createIcons({ root: container });
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChannelListItem;
}
