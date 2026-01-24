/**
 * ViewLayoutFactory Component
 * Creates reusable layout structures for nested views with sidebars and content areas.
 * Eliminates duplicated layout HTML generation across home-view.js and live-view.js.
 */

class ViewLayoutFactory {
    /**
     * Create a sidebar + content area layout (for channels/items with player)
     * @param {Object} options - Configuration options
     * @param {string} options.sidebarId - ID for the sidebar panel
     * @param {string} options.contentId - ID for the content area
     * @param {string} options.headerTitle - Title text for the header
     * @param {string} options.closeBtnId - ID for the close button (optional)
     * @param {boolean} options.showCloseBtn - Whether to show close button (default: true)
     * @param {boolean} options.showCatchupList - Whether to show catchup list in player (default: false)
     * @param {boolean} options.includePlayer - Whether to include player HTML (default: true)
     * @param {string} options.placeholderText - Placeholder text for player (optional)
     * @returns {Object} { container, sidebar, listContainer, contentArea, closeBtn }
     */
    static createSidebarWithPlayer(options = {}) {
        const {
            sidebarId = 'items-panel',
            contentId = 'content-area',
            headerTitle = 'Items',
            closeBtnId = null,
            showCloseBtn = true,
            showCatchupList = false,
            includePlayer = true,
            placeholderText = 'Select a channel to play'
        } = options;

        // Create main container
        const container = document.createElement('div');
        container.className = 'nested-view-container';
        container.style.height = '100%';
        container.style.minHeight = '600px';
        container.style.display = 'flex';

        // Create sidebar
        const sidebar = document.createElement('div');
        sidebar.id = sidebarId;
        sidebar.className = 'nested-sidebar items-sidebar visible';

        // Create header
        const header = document.createElement('div');
        header.className = 'nested-header';
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';

        const titleSpan = document.createElement('span');
        titleSpan.textContent = headerTitle;
        header.appendChild(titleSpan);

        // Close button (optional)
        let closeBtn = null;
        if (showCloseBtn) {
            closeBtn = document.createElement('button');
            closeBtn.className = 'btn btn-text focusable small-icon-btn';
            if (closeBtnId) closeBtn.id = closeBtnId;
            closeBtn.innerHTML = '<i data-lucide="x"></i>';
            header.appendChild(closeBtn);
        }

        sidebar.appendChild(header);

        // Create list container
        const listContainer = document.createElement('div');
        listContainer.className = 'nested-list';
        sidebar.appendChild(listContainer);

        // Create content area
        const contentArea = document.createElement('div');
        contentArea.id = contentId;
        contentArea.className = 'nested-content-area';

        // Add player HTML if requested
        if (includePlayer && typeof PlayerContainer !== 'undefined') {
            contentArea.innerHTML = PlayerContainer.createLive({
                showCatchupList: showCatchupList,
                placeholderText: placeholderText
            });
            PlayerContainer.initIcons(contentArea);
        }

        // Assemble
        container.appendChild(sidebar);
        container.appendChild(contentArea);

        // Initialize icons
        if (window.lucide) {
            lucide.createIcons({ root: container });
        }

        return {
            container,
            sidebar,
            listContainer,
            contentArea,
            closeBtn,
            // Helper to update header title
            setHeaderTitle: (title) => {
                titleSpan.textContent = title;
            }
        };
    }

    /**
     * Create a sidebar + grid layout (for movies/series/buckets)
     * @param {Object} options - Configuration options
     * @param {string} options.contentId - ID for the content area
     * @param {string} options.headerTitle - Title text for the header
     * @param {string} options.closeBtnId - ID for the close button (optional)
     * @param {string} options.gridId - ID for the grid container (optional)
     * @returns {Object} { container, contentArea, gridContainer, closeBtn }
     */
    static createContentWithGrid(options = {}) {
        const {
            contentId = 'content-area',
            headerTitle = 'Items',
            closeBtnId = null,
            gridId = 'media-grid'
        } = options;

        // Create main container
        const container = document.createElement('div');
        container.className = 'nested-view-container';
        container.style.height = '100%';
        container.style.minHeight = '600px';
        container.style.display = 'flex';

        // Create content area (full width for grid)
        const contentArea = document.createElement('div');
        contentArea.id = contentId;
        contentArea.className = 'nested-content-area';
        contentArea.style.width = '100%';
        contentArea.style.height = '100%';
        contentArea.style.overflowY = 'auto';
        contentArea.style.padding = '40px';

        // Create header row
        const headerRow = document.createElement('div');
        headerRow.style.display = 'flex';
        headerRow.style.alignItems = 'center';
        headerRow.style.justifyContent = 'space-between';
        headerRow.style.marginBottom = '30px';

        const titleEl = document.createElement('h2');
        titleEl.className = 'section-title';
        titleEl.style.margin = '0';
        titleEl.textContent = headerTitle;
        headerRow.appendChild(titleEl);

        // Close button
        let closeBtn = null;
        closeBtn = document.createElement('button');
        closeBtn.className = 'btn btn-text focusable';
        if (closeBtnId) closeBtn.id = closeBtnId;
        closeBtn.innerHTML = '<i data-lucide="x"></i> Close';
        headerRow.appendChild(closeBtn);

        contentArea.appendChild(headerRow);

        // Create grid container
        const gridContainer = document.createElement('div');
        gridContainer.id = gridId;
        gridContainer.className = 'favorites-grid nested-media-grid';
        contentArea.appendChild(gridContainer);

        // Assemble
        container.appendChild(contentArea);

        // Initialize icons
        if (window.lucide) {
            lucide.createIcons({ root: container });
        }

        return {
            container,
            contentArea,
            gridContainer,
            closeBtn,
            // Helper to update header title
            setHeaderTitle: (title) => {
                titleEl.textContent = title;
            }
        };
    }

    /**
     * Create a full nested layout with categories sidebar, items sidebar, and content area
     * Used for main views like Live TV, Movies, Series, Catchup
     * @param {Object} options - Configuration options
     * @param {string} options.viewId - Base ID for the view (e.g., 'live', 'movies')
     * @param {boolean} options.showItemsSidebar - Whether to show items sidebar (default: false for movies/series)
     * @returns {Object} { container, categoriesSidebar, categoriesList, itemsSidebar, itemsList, contentArea }
     */
    static createNestedViewLayout(options = {}) {
        const {
            viewId = 'view',
            showItemsSidebar = false
        } = options;

        // Create main container
        const container = document.createElement('div');
        container.className = 'nested-view-container';

        // Categories Sidebar
        const categoriesSidebar = document.createElement('div');
        categoriesSidebar.id = `categories-panel-${viewId}`;
        categoriesSidebar.className = 'nested-sidebar categories-sidebar focusable-group';
        categoriesSidebar.innerHTML = '<div class="nested-header">Categories</div>';

        const categoriesList = document.createElement('div');
        categoriesList.className = 'nested-list';
        categoriesSidebar.appendChild(categoriesList);

        container.appendChild(categoriesSidebar);

        // Items Sidebar (optional - for live/catchup)
        let itemsSidebar = null;
        let itemsList = null;
        if (showItemsSidebar) {
            itemsSidebar = document.createElement('div');
            itemsSidebar.id = `items-panel-${viewId}`;
            itemsSidebar.className = 'nested-sidebar items-sidebar';
            itemsSidebar.innerHTML = '<div class="nested-header">Channels</div>';

            itemsList = document.createElement('div');
            itemsList.className = 'nested-list';
            itemsSidebar.appendChild(itemsList);

            container.appendChild(itemsSidebar);
        }

        // Content Area
        const contentArea = document.createElement('div');
        contentArea.className = 'nested-content-area';
        container.appendChild(contentArea);

        return {
            container,
            categoriesSidebar,
            categoriesList,
            itemsSidebar,
            itemsList,
            contentArea
        };
    }

    /**
     * Helper: Hide sections and store their original display state
     * @param {Array<string>} sectionIds - Array of section IDs to hide
     * @returns {Array<Object>} Array of {el, display} for restoration
     */
    static hideSections(sectionIds) {
        const hiddenState = [];
        sectionIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                hiddenState.push({ el, display: el.style.display });
                el.style.display = 'none';
            }
        });
        return hiddenState;
    }

    /**
     * Helper: Restore hidden sections to their original state
     * @param {Array<Object>} hiddenState - Array from hideSections()
     */
    static restoreSections(hiddenState) {
        hiddenState.forEach(state => {
            if (state.el) {
                state.el.style.display = state.display;
            }
        });
    }

    /**
     * Helper: Standard home section IDs that are hidden when opening overlay panels
     */
    static get HOME_SECTION_IDS() {
        return [
            'welcome-section',
            'continue-watching-section',
            'home-fav-channels-section',
            'home-fav-buckets-section',
            'home-fav-movies-section',
            'home-fav-series-section'
        ];
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ViewLayoutFactory;
}
