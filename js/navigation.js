/**
 * Spatial Navigation Handler
 * Manages focus between interactive elements for TV Remote control.
 */

class SpatialNavigation {
    constructor() {
        this.focusableSelector = '.focusable, .vjs-button';
        this.activeClass = 'focused';
        this.currentFocus = null;
        this.root = document.body;
        this.debounceTimer = null;
    }

    init() {
        // Initial focus
        this.focusFirst();

        // Keyboard listener
        document.addEventListener('keydown', (e) => this.handleKeyDown(e), { capture: true });

        // Update focus on click to sync state (without scrolling)
        document.addEventListener('click', (e) => {
            const target = e.target.closest(this.focusableSelector);
            if (target && target !== this.currentFocus && this.isVisible(target)) {
                this.setFocus(target, false);
            }
        });
    }

    handleKeyDown(e) {
        // Skip navigation when player is in fullscreen mode
        // Player handles its own key events in fullscreen
        const playerOverlay = document.getElementById('player-overlay');
        if (playerOverlay && playerOverlay.classList.contains('visible')) {
            return;
        }

        if (!this.currentFocus || !document.contains(this.currentFocus)) {
            this.focusFirst();
            return;
        }

        // If focus is on an input field, allow default typing behavior for non-navigation keys
        if (this.currentFocus && this.currentFocus.tagName === 'INPUT') {
            const isNav = [37, 38, 39, 40, 13, 27].includes(e.keyCode);
            if (!isNav) return;
        }

        const navKeyCodes = [37, 38, 39, 40, 13, 415, 19, 461]; // Arrow keys, Enter, Play, Pause, Back
        if (navKeyCodes.includes(e.keyCode)) {
            // Prevent default scrolling for arrows to stop browser interference
            if ([37, 38, 39, 40].includes(e.keyCode)) {
                e.preventDefault();
            }
        }

        switch (e.keyCode) {
            case 37: // Left
                this.moveFocus('left');
                break;
            case 38: // Up
                this.moveFocus('up');
                break;
            case 39: // Right
                this.moveFocus('right');
                break;
            case 40: // Down
                this.moveFocus('down');
                break;
            case 13: // Enter/OK
                if (this.currentFocus) {
                    // Force click event for robustness
                    this.currentFocus.click();
                    // Some TV browsers need explicit dispatch if .click() is shallow
                    const event = new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    });
                    this.currentFocus.dispatchEvent(event);
                }
                break;
            case 403: // Red button (WebOS)
            case 461: // Back (WebOS)
            case 8:   // Backspace (Browser debug)
                // Handle back action if needed in app logic
                break;
        }
    }

    focusFirst() {
        // Prioritize active item
        let first = document.querySelector(this.focusableSelector + '.active');
        if (!first) {
            first = document.querySelector(this.focusableSelector);
        }
        if (first) this.setFocus(first);
    }

    setFocus(element, scroll = true) {
        // Clear pending auto-activation
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }

        if (this.currentFocus) {
            this.currentFocus.classList.remove(this.activeClass);
            // If moving away from an input, blur it
            if (this.currentFocus.tagName === 'INPUT') {
                this.currentFocus.blur();
            }
        }

        this.currentFocus = element;
        this.currentFocus.classList.add(this.activeClass);

        // Always trigger native focus so that 'focus' events fire (important for app logic like favorites)
        // Use preventScroll: true because we handle scrolling manually below
        if (typeof this.currentFocus.focus === 'function') {
            this.currentFocus.focus({ preventScroll: true });
        }

        if (scroll) {
            this.currentFocus.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Auto Trigger for sidebars
            if (this.currentFocus.classList.contains('auto-trigger')) {
                this.debounceTimer = setTimeout(() => {
                    this.triggerAction();
                }, 300);
            }
        }
    }

    triggerAction() {
        if (this.currentFocus) {
            this.currentFocus.click();
        }
    }

    focusSearchBar() {
        // Get current active view
        const activeSection = this.getActiveSection();
        if (!activeSection) return;

        const viewId = activeSection.id; // 'live', 'movies', 'series', 'catchup'

        // Map view IDs that have search bars
        const searchableViews = ['live', 'movies', 'series', 'catchup'];
        if (!searchableViews.includes(viewId)) return;

        // Find the search input for this view
        const searchInput = document.getElementById(`${viewId}-search-input`);
        if (searchInput) {
            this.setFocus(searchInput, false);
        }
    }

    moveFocus(direction) {
        if (!this.currentFocus) return;

        const region = this.getCurrentRegion(this.currentFocus);

        // If we are in the main content area (grid/player), use the geometric navigation
        // effectively allowing freedom, unless we are trapped?
        // User request focused on restricting sidebars.
        if (region === 'content') {
            // Special handling for Horizontal Scrollable Lists (Home View Carousels)
            // Fixes unreliable geometric navigation in horizontal flex containers
            const carouselContainer = this.currentFocus.closest('.favorites-grid');
            if (carouselContainer) {
                const style = window.getComputedStyle(carouselContainer);
                const isFlex = style.display === 'flex' || style.display === 'inline-flex';

                if (isFlex) {
                    const focusables = Array.from(carouselContainer.querySelectorAll(this.focusableSelector))
                        .filter(el => this.isVisible(el));

                    const currentIndex = focusables.indexOf(this.currentFocus);

                    if (currentIndex !== -1) {
                        if (direction === 'right' && currentIndex < focusables.length - 1) {
                            this.setFocus(focusables[currentIndex + 1]);
                            return;
                        }
                        if (direction === 'left' && currentIndex > 0) {
                            this.setFocus(focusables[currentIndex - 1]);
                            return;
                        }
                    }
                }
            }

            // Special handling for Nested Layouts
            const inNestedGrid = this.currentFocus.closest('.nested-content-area');

            // Special Handling (Player Controls)
            const inPlayer = this.currentFocus.classList.contains('vjs-button') || this.currentFocus.closest('.vjs-control-bar');
            if (inPlayer) {
                const playerContainer = this.currentFocus.closest('.video-js') || inNestedGrid;

                if (direction === 'left') {
                    // 1. Try generic left geometric WITHIN player
                    if (this.moveFocusGeometric('left', playerContainer)) return;

                    // 2. If blocked (start of bar), Escape to Sidebar
                    const activeSection = this.getActiveSection();
                    if (activeSection) {
                        let targetSidebar = activeSection.querySelector('.items-sidebar.visible');
                        if (!targetSidebar || !this.isVisible(targetSidebar)) {
                            targetSidebar = activeSection.querySelector('.categories-sidebar');
                        }
                        if (targetSidebar && this.isVisible(targetSidebar)) {
                            this.focusInContainer(targetSidebar);
                            return;
                        }
                    }
                    return;
                }

                if (direction === 'right') {
                    this.moveFocusGeometric('right', playerContainer);
                    return;
                }
            }

            if (inNestedGrid) {
                // Special case for Movie/Series Detail Panel: handle Left to Column logic
                const inDetail = this.currentFocus.closest('.vod-detail-panel');
                if (inDetail && direction === 'left' && !this.currentFocus.closest('.detail-column')) {
                    // 1. Episode -> Favorite Button
                    if (this.currentFocus.classList.contains('episode-card-vertical')) {
                        const favBtn = inDetail.querySelector('#detail-fav-btn');
                        if (favBtn && this.isVisible(favBtn)) {
                            this.setFocus(favBtn);
                            return;
                        }
                    }

                    // 2. Season Tab (First) -> Back to List Button
                    if (this.currentFocus.classList.contains('season-tab') && !this.currentFocus.previousElementSibling) {
                        const backBtn = inDetail.querySelector('.back-to-grid-btn');
                        if (backBtn && this.isVisible(backBtn)) {
                            this.setFocus(backBtn);
                            return;
                        }
                    }
                }

                if (inDetail && direction === 'right' && this.currentFocus.closest('.detail-column')) {
                    // 1. Favorite Button -> First Episode
                    if (this.currentFocus.id === 'detail-fav-btn' || this.currentFocus.closest('#detail-fav-btn')) {
                        const firstEp = inDetail.querySelector('.episode-card-vertical');
                        if (firstEp && this.isVisible(firstEp)) {
                            this.setFocus(firstEp);
                            return;
                        }
                    }

                    // 2. Back to List Button -> Active Season Tab
                    if (this.currentFocus.classList.contains('back-to-grid-btn')) {
                        const activeTab = inDetail.querySelector('.season-tab.active') || inDetail.querySelector('.season-tab');
                        if (activeTab && this.isVisible(activeTab)) {
                            this.setFocus(activeTab);
                            return;
                        }
                    }
                }

                // Vertical Navigation within Detail Column (Shortcut Favorite <-> Back to List)
                if (inDetail && this.currentFocus.closest('.detail-column')) {

                    // UP NAVIGATION
                    if (direction === 'up') {
                        // 1. From Favorite Button -> Try Play Button first
                        if (this.currentFocus.id === 'detail-fav-btn' || this.currentFocus.closest('#detail-fav-btn')) {
                            const playBtn = inDetail.querySelector('.play-now-btn');
                            if (playBtn && this.isVisible(playBtn)) {
                                this.setFocus(playBtn);
                                return;
                            }
                        }

                        // 2. From Play Button OR Favorite (if Play not found) -> Go to Back Button
                        const isActionBtn = (this.currentFocus.id === 'detail-fav-btn' || this.currentFocus.closest('#detail-fav-btn')) ||
                            (this.currentFocus.classList.contains('play-now-btn') || this.currentFocus.closest('.play-now-btn'));

                        if (isActionBtn) {
                            const backBtn = inDetail.querySelector('.back-to-grid-btn');
                            if (backBtn && this.isVisible(backBtn)) {
                                this.setFocus(backBtn);
                                return;
                            }
                        }
                    }

                    // DOWN NAVIGATION
                    if (direction === 'down' && this.currentFocus.classList.contains('back-to-grid-btn')) {
                        const playBtn = inDetail.querySelector('.play-now-btn');
                        if (playBtn && this.isVisible(playBtn)) {
                            this.setFocus(playBtn);
                            return;
                        }
                        const favBtn = inDetail.querySelector('#detail-fav-btn');
                        if (favBtn && this.isVisible(favBtn)) {
                            this.setFocus(favBtn);
                            return;
                        }
                    }
                }

                // Special case for Episode List -> Season Tabs (Up)
                if (inDetail && direction === 'up' && this.currentFocus.classList.contains('episode-card-vertical')) {
                    const episodesList = inDetail.querySelector('#episodes-list');
                    if (episodesList) {
                        const firstEpisode = episodesList.querySelector('.episode-card-vertical');
                        if (this.currentFocus === firstEpisode) {
                            const activeTab = inDetail.querySelector('.season-tab.active') || inDetail.querySelector('.season-tab');
                            if (activeTab && this.isVisible(activeTab)) {
                                this.setFocus(activeTab);
                                return;
                            }
                        }
                    }
                }

                // 1. Try to find candidate STRICTLY WITHIN the grid/panel first
                const foundInGrid = this.moveFocusGeometric(direction, inNestedGrid);
                if (foundInGrid) return;

                // 2. If no candidate in grid (we are at edge), handle escape logic
                // Only allow escaping to the LEFT and NOT from inside a detail panel (unless already in the left column)
                if (direction === 'left') {
                    const activeSection = this.getActiveSection();
                    if (activeSection) {
                        // Check for Items Sidebar first
                        let targetSidebar = activeSection.querySelector('.items-sidebar.visible');

                        if (!targetSidebar || !this.isVisible(targetSidebar)) {
                            targetSidebar = activeSection.querySelector('.categories-sidebar');
                        }

                        if (targetSidebar && this.isVisible(targetSidebar)) {
                            this.focusInContainer(targetSidebar);
                            return;
                        }
                    }
                }

                return;
            }

            // Fallback for standard layouts (global search)
            this.moveFocusGeometric(direction);
            return;
        }

        // Strict Sidebar Navigation
        if (direction === 'up' || direction === 'down') {
            if (region === 'header-search' && direction === 'down') {
                const activeSection = this.getActiveSection();
                const categoriesSidebar = activeSection ? activeSection.querySelector('.categories-sidebar') : null;
                if (categoriesSidebar) {
                    this.focusInContainer(categoriesSidebar);
                    return;
                }
            }
            this.navigateWithinRegion(direction, region);
        } else if (direction === 'right') {
            this.navigateRight(region);
        } else if (direction === 'left') {
            this.navigateLeft(region);
        }
    }

    getCurrentRegion(el) {
        if (!el) return null;
        if (el.closest('#main-sidebar')) return 'main-sidebar';
        if (el.closest('.header-search-container') || el.closest('.search-bar-container') || el.closest('.header-search-wrapper')) return 'header-search';
        if (el.closest('.categories-sidebar')) return 'categories-panel';
        if (el.closest('.items-sidebar')) return 'items-panel';
        return 'content';
    }

    getActiveSection() {
        return document.querySelector('.view-section.active');
    }

    navigateWithinRegion(direction, region) {
        // Find the specific container for the current focus
        let container = null;
        if (region === 'categories-panel') container = this.currentFocus.closest('.categories-sidebar');
        else if (region === 'items-panel') container = this.currentFocus.closest('.items-sidebar');
        else if (region === 'main-sidebar') container = document.getElementById('main-sidebar');

        if (!container) return;

        const focusables = Array.from(container.querySelectorAll(this.focusableSelector))
            .filter(el => el.offsetParent !== null);

        const index = focusables.indexOf(this.currentFocus);
        if (index === -1) return;

        let nextIndex = index;
        if (direction === 'up') {
            if (index === 0 && (region === 'categories-panel' || region === 'items-panel')) {
                this.focusSearchBar();
                return;
            }
            nextIndex = index - 1;
        }
        if (direction === 'down') nextIndex = index + 1;

        if (nextIndex >= 0 && nextIndex < focusables.length) {
            this.setFocus(focusables[nextIndex]);
        }
    }

    navigateRight(region) {
        let targetContainer = null;
        const activeSection = this.getActiveSection();

        if (region === 'header-search') {
            const container = this.currentFocus.closest('.header-search-wrapper') || this.currentFocus.closest('.search-bar-container');
            const focusables = Array.from(container.querySelectorAll(this.focusableSelector)).filter(el => this.isVisible(el));
            const index = focusables.indexOf(this.currentFocus);
            if (index < focusables.length - 1) {
                this.setFocus(focusables[index + 1]);
                return;
            }
        }

        if (region === 'main-sidebar') {
            // Priority: Categories Panel (in active section) -> Content (in active section)
            if (activeSection) {
                targetContainer = activeSection.querySelector('.categories-sidebar');
                if (!this.isVisible(targetContainer)) {
                    targetContainer = activeSection.querySelector('.nested-content-area') || activeSection.querySelector('#main-content') || activeSection; // Fallback to section itself if content area not explicit
                }
            } else {
                targetContainer = document.getElementById('main-content');
            }
        } else if (region === 'categories-panel') {
            // Priority: Items Panel -> Content
            if (activeSection) {
                targetContainer = activeSection.querySelector('.items-sidebar');
                if (!this.isVisible(targetContainer)) {
                    targetContainer = activeSection.querySelector('.nested-content-area');
                }
            }
        } else if (region === 'items-panel') {
            if (activeSection) {
                targetContainer = activeSection.querySelector('.nested-content-area');
            }
        }

        this.focusInContainer(targetContainer);
    }

    navigateLeft(region) {
        let targetContainer = null;
        const activeSection = this.getActiveSection();

        if (region === 'header-search') {
            const container = this.currentFocus.closest('.header-search-wrapper') || this.currentFocus.closest('.search-bar-container');
            const focusables = Array.from(container.querySelectorAll(this.focusableSelector)).filter(el => this.isVisible(el));
            const index = focusables.indexOf(this.currentFocus);
            if (index > 0) {
                this.setFocus(focusables[index - 1]);
                return;
            }
            // Left from search goes to sidebar
            targetContainer = document.getElementById('main-sidebar');
        } else if (region === 'items-panel') {
            if (activeSection) {
                targetContainer = activeSection.querySelector('.categories-sidebar');
                if (!targetContainer || !this.isVisible(targetContainer)) {
                    targetContainer = document.getElementById('main-sidebar');
                }
            }
        } else if (region === 'categories-panel') {
            targetContainer = document.getElementById('main-sidebar');
        }

        this.focusInContainer(targetContainer);
    }

    focusInContainer(container) {
        if (!container) return;

        // 1. Try Active Item
        // Note: focusableSelector contains commas, so blind concatenation fails.
        // We want to find an element that matches (any selector in focusableSelector) AND (.active).
        // Since all interesting items are focusables, we can disable the optimization or filter properly.
        // Simple way: Find all active elements within container, then check if they match focusable.
        let target = null;
        const actives = container.querySelectorAll('.active');
        for (let el of actives) {
            if (el.matches(this.focusableSelector) && this.isVisible(el)) {
                target = el;
                break;
            }
        }

        // 2. Try First Visible Item
        if (!target || target.offsetParent === null) {
            const all = container.querySelectorAll(this.focusableSelector);
            for (let el of all) {
                if (el.offsetParent !== null) {
                    target = el;
                    break;
                }
            }
        }

        if (target) {
            this.setFocus(target);
        }
    }

    isVisible(el) {
        if (!el || el.offsetParent === null) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    }

    moveFocusGeometric(direction, scopeElement = null) {
        // Find all focusables. If scopeElement is provided, limit to that.
        // Otherwise use document. However, we might want to EXCLUDE things outside the current region if we are strictly in content?
        // Actually, the request is: If in content grid, try to find candidate IN GRID. If none, go to sidebar.

        const root = scopeElement || document;
        const focusables = Array.from(root.querySelectorAll(this.focusableSelector));
        const currentRect = this.currentFocus.getBoundingClientRect();
        const curX = currentRect.left + currentRect.width / 2;
        const curY = currentRect.top + currentRect.height / 2;

        let bestCandidate = null;
        let minDistance = Infinity;
        let foundActive = false;

        focusables.forEach(el => {
            if (el === this.currentFocus) return;
            if (el.offsetParent === null) return;
            // If scopeElement is provided, we only care about descendants (already handled by querySelectorAll)

            const rect = el.getBoundingClientRect();
            const elX = rect.left + rect.width / 2;
            const elY = rect.top + rect.height / 2;
            const isActive = el.classList.contains('active');

            let isValid = false;

            // Thresholds to favor alignment
            const Y_ALIGN_THRESHOLD = rect.height;
            const X_ALIGN_THRESHOLD = rect.width;

            switch (direction) {
                case 'right':
                    if (elX > curX) {
                        // Must be roughly locally aligned for grid
                        if (Math.abs(elY - curY) < Y_ALIGN_THRESHOLD) isValid = true;
                    }
                    break;
                case 'left':
                    if (elX < curX) {
                        if (Math.abs(elY - curY) < Y_ALIGN_THRESHOLD) isValid = true;
                    }
                    break;
                case 'down':
                    if (elY > curY) {
                        // Allow some flexibility but prefer columns
                        if (Math.abs(elX - curX) < X_ALIGN_THRESHOLD) isValid = true;
                        // Fallback: If no column match, closest below
                        if (!isValid && Math.abs(elX - curX) < rect.width * 2) isValid = true;
                    }
                    break;
                case 'up':
                    if (elY < curY) {
                        if (Math.abs(elX - curX) < X_ALIGN_THRESHOLD) isValid = true;
                        if (!isValid && Math.abs(elX - curX) < rect.width * 2) isValid = true;
                    }
                    break;
            }

            if (isValid) {
                const dist = Math.hypot(elX - curX, elY - curY);

                if (dist < minDistance) {
                    minDistance = dist;
                    bestCandidate = el;
                }
            }
        });

        if (bestCandidate) {
            this.setFocus(bestCandidate);
            return true;
        }
        return false;
    }
}
