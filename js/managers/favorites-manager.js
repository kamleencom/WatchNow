/**
 * Favorites Manager
 * Handles favorites data: load, save, add, remove, toggle.
 * UI updates should be handled by the calling code.
 */

class FavoritesManager {
    constructor() {
        this.favorites = {
            channels: [],
            movies: [],
            series: [],
            buckets: []
        };
    }

    /**
     * Load favorites from storage
     */
    load() {
        this.favorites = storageService.loadFavorites();
    }

    /**
     * Save favorites to storage
     */
    save() {
        storageService.saveFavorites(this.favorites);
    }

    /**
     * Get favorites list for a type
     * @param {string} type - 'channels', 'movies', 'series', or 'buckets'
     * @returns {Array}
     */
    get(type) {
        return this.favorites[type] || [];
    }

    /**
     * Get all favorites
     * @returns {Object}
     */
    getAll() {
        return this.favorites;
    }

    /**
     * Check if an item is in favorites
     * @param {Object} item - Item with url property
     * @param {string} type - 'channels', 'movies', or 'series'
     * @returns {boolean}
     */
    isItemFavorite(item, type) {
        const list = this.favorites[type] || [];
        return list.some(fav => fav.url === item.url);
    }

    /**
     * Add item to favorites
     * @param {Object} item - Item to add
     * @param {string} type - 'channels', 'movies', or 'series'
     * @returns {boolean} True if added, false if already exists
     */
    addItem(item, type) {
        if (!this.favorites[type]) {
            this.favorites[type] = [];
        }

        if (this.isItemFavorite(item, type)) {
            return false;
        }

        this.favorites[type].push({
            title: item.title,
            url: item.url,
            logo: item.logo || null,
            source: item.source || 'Unknown',
            id: item.id || null,
            addedAt: Date.now()
        });

        this.save();
        return true;
    }

    /**
     * Remove item from favorites
     * @param {Object} item - Item to remove
     * @param {string} type - 'channels', 'movies', or 'series'
     * @returns {boolean} True if removed
     */
    removeItem(item, type) {
        if (!this.favorites[type]) return false;

        const index = this.favorites[type].findIndex(fav => fav.url === item.url);
        if (index > -1) {
            this.favorites[type].splice(index, 1);
            this.save();
            return true;
        }
        return false;
    }

    /**
     * Toggle item favorite status
     * @param {Object} item - Item to toggle
     * @param {string} type - 'channels', 'movies', or 'series'
     * @returns {boolean} New favorite status (true = now favorite)
     */
    toggleItem(item, type) {
        if (this.isItemFavorite(item, type)) {
            this.removeItem(item, type);
            return false;
        } else {
            this.addItem(item, type);
            return true;
        }
    }

    /**
     * Check if bucket is in favorites
     * @param {string} name - Bucket name
     * @param {string} type - Bucket type ('channels', 'movies', 'series')
     * @returns {boolean}
     */
    isBucketFavorite(name, type) {
        const buckets = this.favorites.buckets || [];
        return buckets.some(b => b.name === name && b.type === type);
    }

    /**
     * Add bucket to favorites
     * @param {string} name - Bucket name
     * @param {string} type - Bucket type
     * @returns {boolean} True if added
     */
    addBucket(name, type) {
        if (!this.favorites.buckets) {
            this.favorites.buckets = [];
        }

        if (this.isBucketFavorite(name, type)) {
            return false;
        }

        this.favorites.buckets.push({
            name: name,
            type: type,
            addedAt: Date.now()
        });

        this.save();
        return true;
    }

    /**
     * Remove bucket from favorites
     * @param {string} name - Bucket name
     * @param {string} type - Bucket type
     * @returns {boolean} True if removed
     */
    removeBucket(name, type) {
        if (!this.favorites.buckets) return false;

        const index = this.favorites.buckets.findIndex(b => b.name === name && b.type === type);
        if (index > -1) {
            this.favorites.buckets.splice(index, 1);
            this.save();
            return true;
        }
        return false;
    }

    /**
     * Toggle bucket favorite status
     * @param {string} name - Bucket name
     * @param {string} type - Bucket type
     * @returns {boolean} New favorite status
     */
    toggleBucket(name, type) {
        if (this.isBucketFavorite(name, type)) {
            this.removeBucket(name, type);
            return false;
        } else {
            this.addBucket(name, type);
            return true;
        }
    }

    /**
     * Migrate old favorites to add missing id fields
     * @param {Object} aggregatedData - The aggregated data containing movies/series
     */
    migrate(aggregatedData) {
        let needsSave = false;

        // Migrate movies
        this.favorites.movies.forEach(movie => {
            if (!movie.id && movie.url) {
                for (const category in aggregatedData.movies) {
                    const found = aggregatedData.movies[category].find(m => m.url === movie.url);
                    if (found && found.id) {
                        movie.id = found.id;
                        needsSave = true;
                        console.log('[FavoritesManager] Migrated movie:', movie.title);
                        break;
                    }
                }
            }
        });

        // Migrate series
        this.favorites.series.forEach(series => {
            if (!series.id && series.url) {
                for (const category in aggregatedData.series) {
                    const found = aggregatedData.series[category].find(s => s.url === series.url);
                    if (found && found.id) {
                        series.id = found.id;
                        needsSave = true;
                        console.log('[FavoritesManager] Migrated series:', series.title);
                        break;
                    }
                }
            }
        });

        if (needsSave) {
            console.log('[FavoritesManager] Migration complete');
            this.save();
        }
    }
}

// Export singleton
window.favoritesManager = new FavoritesManager();
