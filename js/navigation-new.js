/**
 * New Navigation Class
 * Strictly defined areas and rules.
 */

class Navigation {
    constructor() {
        this.areas = {};
        this.currentFocus = null;
        this.activeArea = null;
        this.lastFocusedElement = new Map(); // Store last focus per area
        this.defaultLandings = {}; // Map view/area ID to default sub-area
    }

    init() {
        console.log('Navigation: Initializing New Navigation System...');

        // Define configured Areas
        this.configureAreas();

        // Keyboard Listener
        document.addEventListener('keydown', (e) => this.handleKeyDown(e), { capture: true });

        // Initial Focus
        this.focusFirst();
    }

    configureAreas() {
        // --- Sidebar ---
        this.registerArea('sidebar', {
            selector: '.sidebar-nav',
            type: 'vertical',
            selectionType: 'auto',
            edges: {
                right: 'active_view' // Special dynamic keyword
            }
        });

        // --- Home View ---

        this.registerDefaultLanding('home', 'home_continue_watching_carousel');

        this.registerArea('home_continue_watching_carousel', {
            selector: '#home #continue-watching-carousel',
            type: 'horizontal',
            edges: { left: 'sidebar', down: 'home_fav_channels_carousel' }
        });

        this.registerArea('home_fav_channels_carousel', {
            selector: '#home #home-fav-channels-carousel',
            type: 'horizontal',
            edges: { left: 'sidebar', down: 'home_fav_buckets_carousel', up: 'home_continue_watching_carousel' }
        });

        this.registerArea('home_fav_buckets_carousel', {
            selector: '#home #home-fav-buckets-carousel',
            type: 'horizontal',
            edges: { left: 'sidebar', down: 'home_fav_movies_carousel', up: 'home_fav_channels_carousel' }
        });

        this.registerArea('home_fav_movies_carousel', {
            selector: '#home #home-fav-movies-carousel',
            type: 'horizontal',
            edges: { left: 'sidebar', down: 'home_fav_series_carousel', up: 'home_fav_buckets_carousel' }
        });

        this.registerArea('home_fav_series_carousel', {
            selector: '#home #home-fav-series-carousel',
            type: 'horizontal',
            edges: { left: 'sidebar', up: 'home_fav_movies_carousel' }
        });


        this.registerArea('home_movie_detail_column', {
            selector: '#home #direct-home .movies-mode-row .detail-column',
            type: 'vertical',
            edges: { right: 'home_movie_player_controls' }
        });

        this.registerArea('home_movie_player_controls', {
            selector: '#home #direct-home .movies-mode-row .vjs-control-bar',
            type: 'horizontal',
            focusableSelector: '.vjs-button',
            edges: { left: 'home_movie_detail_column' }
        });


        this.registerArea('home_series_detail_column', {
            selector: '#home #direct-home .series-mode-row .detail-column',
            type: 'vertical',
            edges: { right: 'home_series_seasons' }
        });

        this.registerArea('home_series_player_controls', {
            selector: '#home #direct-home .series-mode-row .vjs-control-bar',
            type: 'horizontal',
            focusableSelector: '.vjs-button',
            edges: { left: 'home_series_detail_column', down: 'home_series_seasons' }
        });


        this.registerArea('home_series_seasons', {
            selector: '#home #direct-home .series-mode-row .season-tabs',
            type: 'horizontal',
            edges: { down: 'home_series_episodes_list', left: 'home_series_detail_column', up: 'home_series_player_controls' }
        });

        this.registerArea('home_series_episodes_list', {
            selector: '#home #direct-home .series-mode-row .episodes-list-vertical',
            type: 'vertical',
            edges: { up: 'home_series_seasons', left: 'home_series_detail_column' }
        });


        this.registerArea('home_fav_channels_panel', {
            selector: '#home #home-fav-items-panel',
            type: 'vertical',
            edges: { right: 'home_fav_live_player_controls' }
        });

        this.registerArea('home_fav_live_player_controls', {
            selector: '#home #home-fav-content-area .vjs-control-bar',
            type: 'horizontal',
            focusableSelector: '.vjs-button',
            edges: { left: 'home_fav_channels_panel' }
        });


        this.registerArea('home_bucket_channels_panel', {
            selector: '#home #live-bucket #bucket-items-panel',
            type: 'vertical',
            edges: { right: 'home_bucket_live_player_controls' }
        });

        this.registerArea('home_bucket_live_player_controls', {
            selector: '#home #live-bucket #bucket-content-area .vjs-control-bar',
            type: 'horizontal',
            focusableSelector: '.vjs-button',
            edges: { left: 'home_bucket_channels_panel' }
        });



        this.registerArea('home_bucket_movies_panel', {
            selector: '#home #movies-bucket #bucket-content-area .nested-media-grid',
            type: 'spatial',
            edges: {}
        });



        this.registerArea('home_bucket_movies_detail_column', {
            selector: '#home #movies-bucket #bucket-content-area #bucket-view .detail-column',
            type: 'vertical',
            edges: { right: 'home_bucket_movies_player_controls' }
        });

        this.registerArea('home_bucket_movies_player_controls', {
            selector: '#home #movies-bucket #bucket-content-area #bucket-view .vjs-control-bar',
            type: 'horizontal',
            focusableSelector: '.vjs-button',
            edges: { left: 'home_bucket_movies_detail_column' }
        });


        this.registerArea('home_bucket_series_panel', {
            selector: '#home #series-bucket #bucket-content-area .nested-media-grid',
            type: 'spatial',
            edges: {}
        });

        this.registerArea('home_bucket_series_detail_column', {
            selector: '#home #series-bucket #bucket-content-area #bucket-view .detail-column',
            type: 'vertical',
            edges: { right: 'home_bucket_series_seasons' }
        });

        this.registerArea('home_bucket_series_player_controls', {
            selector: '#home #series-bucket #bucket-content-area #bucket-view .vjs-control-bar',
            type: 'horizontal',
            focusableSelector: '.vjs-button',
            edges: { left: 'home_bucket_series_detail_column', down: 'home_bucket_series_seasons' }
        });

        this.registerArea('home_bucket_series_seasons', {
            selector: '#home #series-bucket #bucket-content-area #bucket-view .season-tabs',
            type: 'horizontal',
            edges: { down: 'home_bucket_series_episodes_list', left: 'home_bucket_series_detail_column', up: 'home_bucket_series_player_controls' }
        });

        this.registerArea('home_bucket_series_episodes_list', {
            selector: '#home #series-bucket #bucket-content-area #bucket-view .episodes-list-vertical',
            type: 'vertical',
            edges: { up: 'home_bucket_series_seasons', left: 'home_bucket_series_detail_column' }
        });



        // --- Live TV View ---
        this.registerDefaultLanding('live', 'live_categories');

        // 1. Header/Search
        this.registerArea('live_search', {
            selector: '#live .header-search-wrapper',
            type: 'horizontal',
            edges: { down: 'live_categories' }
        });

        // 2. Categories (Groups)
        this.registerArea('live_categories', {
            selector: '#live .categories-sidebar',
            type: 'vertical',
            edges: { right: 'live_items', up: 'live_search', left: 'sidebar' }
        });

        // 3. Items (Channels)
        this.registerArea('live_items', {
            selector: '#live .items-sidebar',
            type: 'vertical',
            edges: { left: 'live_categories', right: 'live_player_controls', up: 'live_search' }
        });

        // 4. Player Controls (VideoJS Control Bar)
        this.registerArea('live_player_controls', {
            selector: '#live .vjs-control-bar',
            type: 'horizontal',
            focusableSelector: '.vjs-button',
            edges: { up: 'live_search', left: 'live_items' }
        });


        // --- Movies View ---
        this.registerDefaultLanding('movies', 'movies_categories');

        this.registerArea('movies_search', {
            selector: '#movies .header-search-wrapper',
            type: 'horizontal',
            edges: { down: 'movies_categories', left: 'movies_categories' }
        });

        this.registerArea('movies_categories', {
            selector: '#movies .categories-sidebar',
            type: 'vertical',
            edges: { right: 'movies_grid', up: 'movies_search', left: 'sidebar' }
        });

        this.registerArea('movies_grid', {
            selector: '#movies .nested-media-grid',
            type: 'spatial',
            edges: { left: 'movies_categories', up: 'movies_search' }
        });
        this.registerArea('movies_detail_column', {
            selector: '#movies .detail-column',
            type: 'vertical',
            edges: { right: 'movies_player_controls' }
        });

        this.registerArea('movies_player_controls', {
            selector: '#movies .vjs-control-bar',
            type: 'horizontal',
            focusableSelector: '.vjs-button',
            edges: { left: 'movies_detail_column', up: 'movies_detail_column' }
        });


        // --- Series View ---
        this.registerDefaultLanding('series', 'series_categories');

        this.registerArea('series_search', {
            selector: '#series .header-search-wrapper',
            type: 'horizontal',
            edges: { down: 'series_categories', left: 'sidebar' }
        });

        this.registerArea('series_categories', {
            selector: '#series .categories-sidebar',
            type: 'vertical',
            edges: { right: 'series_grid', up: 'series_search', left: 'sidebar' }
        });

        this.registerArea('series_grid', {
            selector: '#series .nested-media-grid',
            type: 'spatial',
            edges: { left: 'series_categories', up: 'series_search' }
        });
        this.registerArea('series_detail_column', {
            selector: '#series .detail-column',
            type: 'vertical',
            edges: { right: 'series_seasons' }
        });

        this.registerArea('series_player_controls', {
            selector: '#series .vjs-control-bar',
            type: 'horizontal',
            focusableSelector: '.vjs-button',
            edges: { left: 'series_detail_column', down: 'series_seasons' }
        });

        this.registerArea('series_seasons', {
            selector: '#series .season-tabs',
            type: 'horizontal',
            edges: { down: 'series_episodes_list', left: 'series_detail_column', up: 'series_player_controls' }
        });

        this.registerArea('series_episodes_list', {
            selector: '#series .episodes-list-vertical',
            type: 'vertical',
            edges: { up: 'series_seasons', left: 'series_detail_column' }
        });

        // --- Catchup View ---
        this.registerDefaultLanding('catchup', 'catchup_categories');

        this.registerArea('catchup_categories', {
            selector: '#catchup .categories-sidebar',
            type: 'vertical',
            edges: { right: 'catchup_items', left: 'sidebar' }
        });
        this.registerArea('catchup_items', {
            selector: '#catchup .items-sidebar',
            type: 'vertical',
            edges: { left: 'catchup_categories', right: 'catchup_player_controls' }
        });

        this.registerArea('catchup_player_controls', {
            selector: '#catchup .vjs-control-bar',
            type: 'horizontal',
            focusableSelector: '.vjs-button',
            edges: { down: 'catchup_program_list', left: 'catchup_items' }
        });

        this.registerArea('catchup_program_list', {
            selector: '#catchup .catchup-list',
            type: 'vertical',
            edges: { up: 'catchup_player_controls', left: 'catchup_items' }
        })

        // --- Settings View ---
        this.registerArea('settings', {
            selector: '#settings',
            type: 'vertical',
            edges: { left: 'sidebar' }
        });

        // --- Resources View ---
        this.registerArea('resources', {
            selector: '#resources',
            type: 'vertical',
            edges: { left: 'sidebar' }
        });
    }

    registerArea(id, config) {
        this.areas[id] = {
            id,
            type: config.type || 'spatial',
            selector: config.selector,
            focusableSelector: config.focusableSelector || '.focusable',
            selectionType: config.selectionType || 'manual',
            edges: config.edges || {},
            enterKeyAction: config.enterKeyAction || 'click',
            defaultIndex: config.defaultIndex
        };
    }

    registerDefaultLanding(viewId, areaId) {
        this.defaultLandings[viewId] = areaId;
    }

    handleKeyDown(e) {
        // Prevent default scrolling for arrows and action keys to avoid double-firing
        if ([37, 38, 39, 40, 13, 32].includes(e.keyCode)) e.preventDefault();

        // Add visual feedback class to body for debug if needed
        // document.body.dataset.navLastKey = e.keyCode;

        if (!this.currentFocus && !this.restoreFocus()) {
            this.focusFirst();
            return;
        }

        const navKeys = {
            37: 'left',
            38: 'up',
            39: 'right',
            40: 'down',
            13: 'enter',
            32: 'enter',
            461: 'back'
        };

        const action = navKeys[e.keyCode];
        if (!action) return;

        if (action === 'enter') {
            this.handleEnter();
            return;
        }

        this.move(action);
    }

    move(direction) {
        if (!this.activeArea) this.identifyArea(this.currentFocus);

        // Fallback: if activeArea is null but we have focus, re-scan all areas
        if (!this.activeArea && this.currentFocus) {
            this.identifyArea(this.currentFocus);
        }

        if (!this.activeArea) return;

        const area = this.activeArea;

        // 1. Try to move interaction within the current area
        const nextEl = this.findNextElement(area, direction);

        if (nextEl) {
            this.setFocus(nextEl);
        } else {
            // 2. Check edges (Jump rules)
            this.checkEdges(area, direction);
        }
    }

    findNextElement(area, direction) {
        const focusables = this.getFocusables(area);
        const currentRect = this.currentFocus.getBoundingClientRect();

        if (area.type === 'vertical') {
            if (direction === 'left' || direction === 'right') return null;

            const index = focusables.indexOf(this.currentFocus);
            if (direction === 'up' && index > 0) return focusables[index - 1];
            if (direction === 'down' && index < focusables.length - 1) return focusables[index + 1];
            return null;
        }

        if (area.type === 'horizontal') {
            if (direction === 'up' || direction === 'down') return null;

            const index = focusables.indexOf(this.currentFocus);
            if (direction === 'left' && index > 0) return focusables[index - 1];
            if (direction === 'right' && index < focusables.length - 1) return focusables[index + 1];
            return null;
        }

        if (area.type === 'spatial') {
            return this.findGeometricCandidate(focusables, currentRect, direction);
        }

        return null;
    }

    findGeometricCandidate(focusables, rect, direction) {
        let bestCandidate = null;
        let minDist = Infinity;
        const curX = rect.left + rect.width / 2;
        const curY = rect.top + rect.height / 2;

        focusables.forEach(el => {
            if (el === this.currentFocus) return;
            const targetRect = el.getBoundingClientRect();
            const targetX = targetRect.left + targetRect.width / 2;
            const targetY = targetRect.top + targetRect.height / 2;

            let isValid = false;
            // Alignment checks to act more like rows/cols
            const Y_ALIGN = Math.abs(targetY - curY) < rect.height;
            const X_ALIGN = Math.abs(targetX - curX) < rect.width;

            switch (direction) {
                case 'up':
                    if (targetY < curY) {
                        if (X_ALIGN) isValid = true; // Preferred: Strictly above
                        if (!isValid && Math.abs(targetX - curX) < rect.width * 2) isValid = true;
                    }
                    break;
                case 'down':
                    if (targetY > curY) {
                        if (X_ALIGN) isValid = true;
                        if (!isValid && Math.abs(targetX - curX) < rect.width * 2) isValid = true;
                    }
                    break;
                case 'left':
                    if (targetX < curX) {
                        // Relaxed vertical alignment for player controls
                        // if (Y_ALIGN) isValid = true; 
                        isValid = true; // Allow moving left to anything, geometric sorting will pick closest
                    }
                    break;
                case 'right':
                    if (targetX > curX) {
                        if (Y_ALIGN) isValid = true;
                    }
                    break;
            }

            if (isValid) {
                const dist = Math.hypot(targetX - curX, targetY - curY);
                if (dist < minDist) {
                    minDist = dist;
                    bestCandidate = el;
                }
            }
        });

        return bestCandidate;
    }

    checkEdges(area, direction) {
        let targetAreaId = area.edges[direction];

        if (!targetAreaId) return;

        // Resolve 'active_view' to actual area ID
        if (targetAreaId === 'active_view') {
            const activeView = document.querySelector('.view-section.active');
            if (activeView) {
                const viewId = activeView.id;
                // Check if this view has a default landing area registered
                if (this.defaultLandings[viewId]) {
                    targetAreaId = this.defaultLandings[viewId];
                } else {
                    targetAreaId = viewId; // Fallback to view ID itself
                }
            } else {
                return;
            }
        }

        const targetArea = this.areas[targetAreaId];
        if (targetArea) {
            this.focusArea(targetArea, direction);
        }
    }

    focusArea(area, fromDirection) {
        let target = null;
        const container = document.querySelector(area.selector);

        if (!container) return;

        // Priority 1: Restore last focused element in this area (Memory)
        if (this.lastFocusedElement.has(area.id)) {
            const lastEl = this.lastFocusedElement.get(area.id);
            if (lastEl && document.contains(lastEl) && this.isVisible(lastEl)) {
                target = lastEl;
            }
        }

        // Priority 2: Standard Active Class (HTML State)
        if (!target) {
            const activeEl = container.querySelector(area.focusableSelector + '.active');
            if (activeEl && this.isVisible(activeEl)) {
                target = activeEl;
            }
        }

        // Priority 3: Default Index / Specific Selector (Configuration)
        if (!target && area.defaultIndex !== undefined) {
            const focusables = this.getFocusables(area);
            if (focusables[area.defaultIndex]) {
                target = focusables[area.defaultIndex];
            }
        }

        // Priority 4: Geometric Entry (e.g., coming from the left, find the text visually closest to entry point) (Optional Future Enhancement)

        // Priority 5: First available item (Fallback)
        if (!target) {
            const focusables = this.getFocusables(area);
            if (focusables.length > 0) {
                target = focusables[0];
            }
        }

        if (target) {
            this.setFocus(target);
        }
    }

    getFocusables(area) {
        const container = document.querySelector(area.selector);
        if (!container) return [];
        // Only return visible items
        let els = Array.from(container.querySelectorAll(area.focusableSelector));
        return els.filter(el => this.isVisible(el));
    }

    isVisible(el) {
        if (!el) return false;
        // Check standard visibility
        if (el.style.display === 'none' || el.style.visibility === 'hidden') return false;
        // Check bounding box
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    setFocus(el) {
        if (!el) return;

        // Remove old focus
        if (this.currentFocus) {
            this.currentFocus.classList.remove('focused');
            this.currentFocus.blur();
        }

        this.currentFocus = el;
        this.currentFocus.classList.add('focused');
        this.currentFocus.focus({ preventScroll: true });

        // Scroll into view
        this.currentFocus.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Identify and set active area
        const previousArea = this.activeArea;
        this.identifyArea(el);

        if (this.activeArea) {
            this.lastFocusedElement.set(this.activeArea.id, el);

            // Debugging
            // console.log(`Nav: Focused ${this.activeArea.id}`, el);
        }

        // Handle Auto Selection (Sidebar)
        if (this.activeArea && this.activeArea.selectionType === 'auto') {
            if (this.autoClickTimer) clearTimeout(this.autoClickTimer);
            this.autoClickTimer = setTimeout(() => {
                this.triggerAction();
            }, 300);
        }
    }

    identifyArea(el) {
        // Check current active area first for performance
        if (this.activeArea) {
            const container = document.querySelector(this.activeArea.selector);
            if (container && container.contains(el)) return;
        }

        // Search all areas (could be optimized)
        for (const [id, area] of Object.entries(this.areas)) {
            const container = document.querySelector(area.selector);
            if (container && container.contains(el)) {
                this.activeArea = area;
                return;
            }
        }

        console.warn('Nav: Focused element is outside of any registered area', el);
        this.activeArea = null;
    }

    handleEnter() {
        if (this.currentFocus) {
            this.triggerAction();
        }
    }

    triggerAction() {
        if (this.currentFocus) {
            this.currentFocus.click();
        }
    }

    focusFirst() {
        // Start at Sidebar Home
        const sidebar = this.areas['sidebar'];
        if (sidebar) {
            // Find Home specifically
            const homeBtn = document.querySelector('.nav-item[data-target="home"]');
            if (homeBtn && this.isVisible(homeBtn)) {
                this.setFocus(homeBtn);
            } else {
                this.focusArea(sidebar);
            }
        }
    }

    restoreFocus() {
        return false;
    }
}
