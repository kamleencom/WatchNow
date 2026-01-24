/**
 * Storage Service
 * Encapsulates localStorage and IndexedDB logic.
 */

class StorageService {
    constructor() {
        this.DB_NAME = 'WatchNowDB';
        this.DB_VERSION = 2;
        this.STORE_NAME = 'playlists';
        this.CHUNK_STORE_NAME = 'playlist_chunks';
    }

    // --- App Settings ---

    loadAppSettings(defaultSettings) {
        try {
            const stored = localStorage.getItem('watchnow_settings');
            if (stored) {
                return { ...defaultSettings, ...JSON.parse(stored) };
            }
        } catch (e) {
            console.error("Failed to load app settings", e);
        }
        return defaultSettings;
    }

    saveAppSettings(settings) {
        try {
            localStorage.setItem('watchnow_settings', JSON.stringify(settings));
        } catch (e) {
            console.error("Failed to save app settings", e);
        }
    }

    // --- Resources (Storage Only) ---

    loadResources() {
        const stored = localStorage.getItem('watchnow_resources');
        if (stored) {
            const resources = JSON.parse(stored);
            // Reset non-persistent state
            resources.forEach(r => {
                r.isLoading = false;
                r.stats = r.stats || { channels: 0, movies: 0, series: 0 };
                r.lastSynced = r.lastSynced || null;
                r.status = r.active ? 'queued' : 'disabled';
                r.abortController = null; // Ensure this is clear
            });
            return resources;
        } else {
            // Migration
            const oldUrl = localStorage.getItem('m3u8_url');
            if (oldUrl) {
                localStorage.removeItem('m3u8_url');
                return [{
                    id: Date.now().toString(),
                    name: 'Default Playlist',
                    url: oldUrl,
                    active: true,
                    isLoading: false,
                    status: 'pending',
                    stats: { channels: 0, movies: 0, series: 0, catchup: 0 },
                    lastSynced: null,
                    data: null,
                    type: 'm3u',
                    credentials: null
                }];
            }
        }
        return [];
    }

    saveResources(resources) {
        localStorage.setItem('watchnow_resources', JSON.stringify(resources.map(r => ({
            id: r.id,
            name: r.name,
            url: r.url,
            active: r.active,
            stats: r.stats,
            lastSynced: r.lastSynced,
            type: r.type || 'm3u',
            credentials: r.credentials || null
        }))));
    }

    // --- Favorites ---

    loadFavorites() {
        try {
            const stored = localStorage.getItem('watchnow_favorites');
            if (stored) {
                const parsed = JSON.parse(stored);
                // Ensure structure
                return {
                    channels: parsed.channels || [],
                    movies: parsed.movies || [],
                    series: parsed.series || [],
                    buckets: parsed.buckets || []
                };
            }
        } catch (e) {
            console.error("Failed to load favorites", e);
        }
        return { channels: [], movies: [], series: [], buckets: [] };
    }

    saveFavorites(favorites) {
        try {
            localStorage.setItem('watchnow_favorites', JSON.stringify(favorites));
        } catch (e) {
            console.error("Failed to save favorites", e);
        }
    }



    // --- Weather Cache ---

    loadWeatherCache() {
        try {
            const stored = localStorage.getItem('watchnow_weather_cache');
            return stored ? JSON.parse(stored) : null;
        } catch (e) { return null; }
    }

    saveWeatherCache(data) {
        try {
            localStorage.setItem('watchnow_weather_cache', JSON.stringify(data));
        } catch (e) { }
    }

    // --- IndexedDB ---

    openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            request.onerror = event => reject('Database error: ' + event.target.errorCode);
            request.onsuccess = event => resolve(event.target.result);
            request.onupgradeneeded = event => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(this.CHUNK_STORE_NAME)) {
                    const store = db.createObjectStore(this.CHUNK_STORE_NAME, { keyPath: ['resourceId', 'chunkId'] });
                    store.createIndex('resourceId', 'resourceId', { unique: false });
                }
            };
        });
    }

    savePlaylistChunk(resourceId, chunkId, items) {
        return this.openDB().then(db => {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.CHUNK_STORE_NAME], 'readwrite');
                const store = transaction.objectStore(this.CHUNK_STORE_NAME);
                const request = store.put({ resourceId, chunkId, items });
                request.onsuccess = () => resolve();
                request.onerror = (e) => reject(e);
            });
        }).catch(e => console.error("IndexedDB Chunk Save Failed", e));
    }

    getPlaylistFromChunks(resourceId) {
        return this.openDB().then(db => {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.CHUNK_STORE_NAME], 'readonly');
                const store = transaction.objectStore(this.CHUNK_STORE_NAME);
                const index = store.index('resourceId');
                const request = index.getAll(IDBKeyRange.only(resourceId));

                request.onsuccess = () => {
                    const chunks = request.result;
                    if (!chunks || chunks.length === 0) {
                        resolve(null);
                        return;
                    }

                    // Reconstruct Data
                    chunks.sort((a, b) => a.chunkId - b.chunkId);
                    const result = { channels: {}, movies: {}, series: {}, catchup: {} };

                    chunks.forEach(chunk => {
                        chunk.items.forEach(item => {
                            const cat = item.category || 'channels';
                            const group = item.group || 'Uncategorized';
                            if (!result[cat]) result[cat] = {}; // Safety
                            if (!result[cat][group]) result[cat][group] = [];
                            result[cat][group].push(item);
                        });
                    });

                    resolve(result);
                };
                request.onerror = (e) => reject(e);
            });
        }).catch(e => {
            console.error("IndexedDB Chunk Load Failed", e);
            return null;
        });
    }

    // New: Helper to save full playlist structure by Chunking it automatically
    // Replaces the old savePlaylist logic implicitly
    async savePlaylistAsChunks(resourceId, data) {
        // Not explicitly requested but useful. For now keeping to 1:1 migration.
    }

    async movePlaylistChunks(sourceId, targetId) {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([this.CHUNK_STORE_NAME], 'readwrite');
            const store = tx.objectStore(this.CHUNK_STORE_NAME);
            const index = store.index('resourceId');
            const req = index.openCursor(IDBKeyRange.only(sourceId));

            req.onsuccess = () => {
                const cursor = req.result;
                if (cursor) {
                    const record = cursor.value;
                    const newRecord = {
                        resourceId: targetId,
                        chunkId: record.chunkId,
                        items: record.items
                    };
                    store.put(newRecord);
                    store.delete(cursor.primaryKey);
                    cursor.continue();
                } else {
                    resolve();
                }
            };
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e);
            req.onerror = (e) => reject(e);
        });
    }

    async deletePlaylistDataFromDB(id) {
        try {
            const db = await this.openDB();
            // Delete legacy store items
            const p1 = new Promise((resolve, reject) => {
                const transaction = db.transaction([this.STORE_NAME], 'readwrite');
                const store = transaction.objectStore(this.STORE_NAME);
                store.delete(id).onsuccess = resolve;
                store.delete(id).onerror = reject;
            });

            // Delete chunks
            const p2 = new Promise((resolve, reject) => {
                const tx = db.transaction([this.CHUNK_STORE_NAME], 'readwrite');
                const store = tx.objectStore(this.CHUNK_STORE_NAME);
                const index = store.index('resourceId');
                const req = index.openKeyCursor(IDBKeyRange.only(id));

                req.onsuccess = () => {
                    const cursor = req.result;
                    if (cursor) {
                        store.delete(cursor.primaryKey);
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };
                req.onerror = reject;
            });

            await Promise.all([p1, p2]);
        } catch (e) {
            console.error("IndexedDB Delete Failed", e);
        }
    }

    async clearPlaylistDB() {
        try {
            const db = await this.openDB();
            const t1 = db.transaction([this.STORE_NAME], 'readwrite').objectStore(this.STORE_NAME).clear();
            const t2 = db.transaction([this.CHUNK_STORE_NAME], 'readwrite').objectStore(this.CHUNK_STORE_NAME).clear();
        } catch (e) {
            console.error("IndexedDB Clear Failed", e);
        }
    }
}

// Export singleton
window.storageService = new StorageService();
