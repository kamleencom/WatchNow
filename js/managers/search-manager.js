/**
 * Search Manager
 * Handles category filtering and search within views.
 */
class SearchManager {
    constructor() {
        this.debounceTimers = {};
    }

    setupCategorySearchHandlers() {
        this.setupCategorySearchHandler('live');
        this.setupCategorySearchHandler('movies');
        this.setupCategorySearchHandler('series');
        this.setupCategorySearchHandler('catchup');
    }

    setupCategorySearchHandler(viewId) {
        const input = document.getElementById(`${viewId}-search-input`);
        if (!input) return;

        if (input.dataset.searchSetup === 'true') return;
        input.dataset.searchSetup = 'true';

        input.addEventListener('input', (e) => {
            this.syncResetButton(input);
            clearTimeout(this.debounceTimers[viewId]);
            this.debounceTimers[viewId] = setTimeout(() => {
                this.filterCategories(viewId, e.target.value);
            }, 300);
        });

        const resetBtn = document.querySelector(`[data-target="${viewId}-search-input"]`);
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.handleResetClick(resetBtn);
            });
        }
    }

    syncResetButton(inputEl) {
        const resetBtn = document.querySelector(`[data-target="${inputEl.id}"]`);
        if (!resetBtn) return;

        if (inputEl.value.length > 0) {
            resetBtn.style.display = 'flex';
        } else {
            resetBtn.style.display = 'none';
        }
    }

    handleResetClick(btn) {
        const targetId = btn.dataset.target;
        const input = document.getElementById(targetId);
        if (!input) return;

        input.value = '';
        btn.style.display = 'none';

        const viewId = targetId.replace('-search-input', '');
        state.categorySearchQuery[viewId] = '';

        this.filterCategories(viewId, '');

        input.focus();
    }

    filterCategories(viewId, query) {
        state.categorySearchQuery[viewId] = query;
        const searchQuery = query.length >= 2 ? query : '';

        const dataGroups = state.aggregatedData[viewId === 'live' || viewId === 'catchup' ? 'channels' : viewId];
        if (!dataGroups) return;

        const categoriesPanel = document.getElementById(`categories-panel-${viewId}`);
        if (!categoriesPanel) return;

        const categoryItems = categoriesPanel.querySelectorAll('.nested-list-item');

        if (!searchQuery) {
            categoryItems.forEach(item => {
                item.style.display = '';
            });

            const activeCategory = categoriesPanel.querySelector('.nested-list-item.active');
            if (activeCategory) {
                const catName = activeCategory.dataset.category;
                const items = dataGroups[catName] || [];
                const itemsSidebar = document.getElementById(`items-panel-${viewId}`);
                const contentArea = categoriesPanel.closest('.nested-view-container').querySelector('.nested-content-area');
                if (typeof handleNestedCategoryClick === 'function') {
                    handleNestedCategoryClick(viewId, catName, items, itemsSidebar, contentArea);
                }
            }
            return;
        }

        let matchingCategories = [];
        let matchingItems = [];

        Object.keys(dataGroups).forEach(catName => {
            const items = dataGroups[catName];
            const catMatches = matchSearchQuery(catName, searchQuery);
            const itemMatches = items.filter(item => matchSearchQuery(item.title, searchQuery));

            if (catMatches || itemMatches.length > 0) {
                matchingCategories.push(catName);
                matchingItems.push(...itemMatches);
            }
        });

        categoryItems.forEach(item => {
            const catName = item.dataset.category;
            if (matchingCategories.includes(catName)) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });

        this.updateActiveChannelPanel(viewId, dataGroups, searchQuery);
    }

    updateActiveChannelPanel(viewId, dataGroups, searchQuery) {
        if (viewId !== 'live' && viewId !== 'catchup') return;

        const itemsPanel = document.getElementById(`items-panel-${viewId}`);
        if (!itemsPanel) return;

        const activeCategory = document.querySelector(`#categories-panel-${viewId} .nested-list-item.active`);
        if (!activeCategory) return;

        const catName = activeCategory.dataset.category;
        const items = dataGroups[catName] || [];
        const contentArea = document.querySelector(`#${viewId}-rows .nested-content-area`);

        if (typeof handleNestedCategoryClick === 'function') {
            handleNestedCategoryClick(viewId, catName, items, itemsPanel, contentArea);
        }
    }
}

window.searchManager = new SearchManager();
