/**
 * Main Application Logic
 * Manages Resources, Aggregation, UI Rendering, and Navigation.
 */

// Global Instances
const parser = new PlaylistParser();
const nav = new SpatialNavigation();

// State
const state = {
    resources: [], // Array of { id, name, url, active, color }
    aggregatedData: {
        channels: {},
        movies: {},
        series: {}
    },
    favorites: {
        channels: [], // Array of favorite channel items
        movies: [],   // Array of favorite movie items
        series: [],   // Array of favorite series items
        buckets: []   // Array of favorite buckets (folders)
    },
    currentView: 'live',
    searchQuery: '',
    focusedItem: null // Currently focused item for yellow button
};

const LINK_CHECK_INTERVAL = 2 * 60 * 60 * 1000; // 2 hours
let linkStatusCache = {};

// App Settings
const appSettings = {
    linkStatusEnabled: true,  // Default: enabled
    layoutMode: 'cards',      // 'cards' or 'nested'
    playerType: 'html5'       // 'html5' or 'clappr'
};

function loadAppSettings() {
    try {
        const stored = localStorage.getItem('watchnow_settings');
        if (stored) {
            const parsed = JSON.parse(stored);
            Object.assign(appSettings, parsed);
        }
    } catch (e) {
        console.error("Failed to load app settings", e);
    }
}

function saveAppSettings() {
    try {
        localStorage.setItem('watchnow_settings', JSON.stringify(appSettings));
    } catch (e) {
        console.error("Failed to save app settings", e);
    }
}

function isLinkStatusEnabled() {
    return appSettings.linkStatusEnabled;
}

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    loadResourcesFromStorage();
    loadFavorites();
    loadLinkStatusCache();
    loadAppSettings();  // Load settings early
    setupNavigation();
    setupResourcesUI();
    setupSearch();
    setupPlayer();
    setupSettings();
    setupFavoritesKeyHandler();
    createToastElement();

    // Initial Load
    await refreshContent();

    nav.init();
    switchToView('favorites');

    // Initial Lucide icons
    lucide.createIcons();
}

// --- Resource Management ---

function loadResourcesFromStorage() {
    const stored = localStorage.getItem('watchnow_resources');
    if (stored) {
        state.resources = JSON.parse(stored);
        // Reset non-persistent state
        state.resources.forEach(r => {
            r.isLoading = false;
            r.stats = r.stats || { channels: 0, movies: 0, series: 0 };
            r.lastSynced = r.lastSynced || null;
            r.status = r.active ? 'queued' : 'disabled';
        });
    } else {
        // Migration from old app version
        const oldUrl = localStorage.getItem('m3u8_url');
        if (oldUrl) {
            addResource('Default Playlist', oldUrl);
            localStorage.removeItem('m3u8_url');
        }
    }
}

function saveResources() {
    localStorage.setItem('watchnow_resources', JSON.stringify(state.resources.map(r => ({
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

function addResource(name, url, options = {}) {
    const newResource = {
        id: Date.now().toString(),
        name: name,
        url: url,
        active: true,
        isLoading: false,
        status: 'pending',
        stats: { channels: 0, movies: 0, series: 0 },
        lastSynced: null,
        data: null,
        type: options.type || 'm3u',
        credentials: options.credentials || null
    };
    state.resources.push(newResource);
    saveResources();
    return newResource;
}

function removeResource(id) {
    state.resources = state.resources.filter(r => r.id !== id);
    saveResources();
    deletePlaylistDataFromDB(id);
}

function toggleResource(id, active) {
    const res = state.resources.find(r => r.id === id);
    if (res) {
        res.active = active;
        res.status = active ? 'pending' : 'disabled';
        saveResources();
    }
}

// --- Link Status Cache ---

function loadLinkStatusCache() {
    try {
        const stored = localStorage.getItem('watchnow_link_status');
        if (stored) {
            linkStatusCache = JSON.parse(stored);
        }
    } catch (e) {
        console.error("Failed to load link status cache", e);
        linkStatusCache = {};
    }
}

function saveLinkStatusCache() {
    try {
        localStorage.setItem('watchnow_link_status', JSON.stringify(linkStatusCache));
    } catch (e) {
        console.error("Failed to save link status cache", e);
    }
}

function getCachedStatus(url) {
    const entry = linkStatusCache[url];
    if (!entry) return null;
    if (Date.now() - entry.timestamp > LINK_CHECK_INTERVAL) return null; // Expired
    return entry.status;
}

function updateCachedStatus(url, status) {
    linkStatusCache[url] = {
        status: status,
        timestamp: Date.now()
    };
    saveLinkStatusCache();
}

// --- IndexedDB Storage for Large Playlists ---

const DB_NAME = 'WatchNowDB';
const DB_VERSION = 2;
const STORE_NAME = 'playlists';
const CHUNK_STORE_NAME = 'playlist_chunks';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = event => reject('Database error: ' + event.target.errorCode);
        request.onsuccess = event => resolve(event.target.result);
        request.onupgradeneeded = event => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(CHUNK_STORE_NAME)) {
                const store = db.createObjectStore(CHUNK_STORE_NAME, { keyPath: ['resourceId', 'chunkId'] });
                store.createIndex('resourceId', 'resourceId', { unique: false });
            }
        };
    });
}

// Deprecated: Single Blob Save
async function savePlaylistDataToDB(id, data) {
    // Forward to chunks? No, this function signature expects full data. 
    // We should avoid using this for oversized playlists.
    // But for backward compat or small updates, we keep it or redirect.
    // Ideally we rewrite the caller.
}

async function savePlaylistChunk(resourceId, chunkId, items) {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([CHUNK_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(CHUNK_STORE_NAME);
            const request = store.put({ resourceId, chunkId, items });
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e);
        });
    } catch (e) {
        console.error("IndexedDB Chunk Save Failed", e);
    }
}

async function getPlaylistFromChunks(resourceId) {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([CHUNK_STORE_NAME], 'readonly');
            const store = transaction.objectStore(CHUNK_STORE_NAME);
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

                const result = {
                    channels: {},
                    movies: {},
                    series: {}
                };

                chunks.forEach(chunk => {
                    chunk.items.forEach(item => {
                        const cat = item.category || 'channels';
                        const group = item.group || 'Uncategorized';
                        if (!result[cat][group]) result[cat][group] = [];
                        result[cat][group].push(item);
                    });
                });

                resolve(result);
            };
            request.onerror = (e) => reject(e);
        });
    } catch (e) {
        console.error("IndexedDB Chunk Load Failed", e);
        return null;
    }
}

async function movePlaylistChunks(sourceId, targetId) {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([CHUNK_STORE_NAME], 'readwrite');
            const store = tx.objectStore(CHUNK_STORE_NAME);
            const index = store.index('resourceId');
            const req = index.openCursor(IDBKeyRange.only(sourceId));

            const operations = [];

            req.onsuccess = () => {
                const cursor = req.result;
                if (cursor) {
                    const record = cursor.value;
                    // Create new record
                    const newRecord = {
                        resourceId: targetId,
                        chunkId: record.chunkId,
                        items: record.items
                    };

                    // Put new, Delete old
                    store.put(newRecord); // This is async but part of same tx
                    store.delete(cursor.primaryKey);

                    cursor.continue();
                } else {
                    // Done iterating
                    resolve();
                }
            };

            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e);
            req.onerror = (e) => reject(e);
        });
    } catch (e) {
        console.error("IndexedDB Move Failed", e);
        throw e;
    }
}

async function deletePlaylistDataFromDB(id) {
    try {
        const db = await openDB();
        const p1 = new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            store.delete(id).onsuccess = resolve;
            store.delete(id).onerror = reject;
        });

        // Delete chunks
        const p2 = new Promise((resolve, reject) => {
            const tx = db.transaction([CHUNK_STORE_NAME], 'readwrite');
            const store = tx.objectStore(CHUNK_STORE_NAME);
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

async function clearPlaylistDB() {
    try {
        const db = await openDB();
        const t1 = db.transaction([STORE_NAME], 'readwrite').objectStore(STORE_NAME).clear();
        const t2 = db.transaction([CHUNK_STORE_NAME], 'readwrite').objectStore(CHUNK_STORE_NAME).clear();
    } catch (e) {
        console.error("IndexedDB Clear Failed", e);
    }
}

// --- Data Fetching & Aggregation ---

async function refreshContent() {
    showLoading(true);
    const activeResources = state.resources.filter(r => r.active);

    // Process all active resources
    const promises = activeResources.map(async (res) => {
        // 1. Check Memory
        if (res.data) return;

        // 2. Check IndexedDB
        const cachedData = await getPlaylistFromChunks(res.id);
        if (cachedData) {
            console.log(`Loaded ${res.name} from cache (Chunks).`);
            res.data = cachedData;
            res.status = 'synced';
            return;
        }

        // 3. Sync (Fetch & Save)
        await syncResource(res);
    });

    await Promise.all(promises);

    aggregateData();
    renderContentViews();
    renderResourcesList();
    showLoading(false);
}

// Sync a single resource
// Sync a single resource
async function syncResource(res) {
    if (!res.active) return;

    // Cancel previous if any
    if (res.abortController) res.abortController.abort();
    res.abortController = new AbortController();

    res.isLoading = true;
    res.status = 'syncing';
    renderResourcesList(); // Update UI

    // Temporarily store under a different ID to prevent dataloss on cancel
    const tempId = `temp_${res.id}`;

    try {
        console.log(`Fetching ${res.name}...`);

        // Reset stats UI
        const statsEl = document.getElementById('global-loader-stats');
        if (statsEl) statsEl.textContent = 'Downloading Playlist...';

        // Clear any leftover temp chunks
        await deletePlaylistDataFromDB(tempId);

        let stats;

        if (res.type === 'xtream' && res.credentials) {
            // XTREAM API SYNC
            const client = new XtreamClient(res.credentials.host, res.credentials.username, res.credentials.password, res.name);
            const result = await client.fetchAll();
            stats = result.stats;

            // For Xtream we just save one big chunk for now because fetchAll returns full object
            // To be consistent with chunking, we can split it, or just save as chunk 0
            // Since we have the processed data structure directly:
            const items = [];
            ['channels', 'movies', 'series'].forEach(cat => {
                Object.keys(result.data[cat]).forEach(group => {
                    result.data[cat][group].forEach(item => {
                        item.category = cat;
                        // XtreamClient already sets group, but useful to ensure
                    });
                    items.push(...result.data[cat][group]);
                });
            });

            // Helper to chunk array
            const chunkSize = 2000;
            for (let i = 0; i < items.length; i += chunkSize) {
                const chunk = items.slice(i, i + chunkSize);
                if (res.abortController && res.abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');
                await savePlaylistChunk(tempId, Math.floor(i / chunkSize), chunk);
            }

        } else {
            // M3U PARSER SYNC
            let chunkCounter = 0;
            stats = await parser.parseFromUrl(res.url, {
                signal: res.abortController.signal,
                onProgress: (s) => {
                    res.currentProgress = s;
                    if (statsEl) {
                        statsEl.textContent = `Channels: ${s.channels} | Movies: ${s.movies} | Series: ${s.series}`;
                    }
                    updateResourceStatusUI(res.id, s);
                },
                onBatch: async (batch) => {
                    await savePlaylistChunk(tempId, chunkCounter++, batch);
                }
            });
        }

        // SUCCESS: Now we commit the transaction (swap temp to real)
        console.log(`Sync success. Committing ${res.name}...`);

        // 1. Delete Old Real Data
        await deletePlaylistDataFromDB(res.id);

        // 2. Move Temp Data to Real ID
        await movePlaylistChunks(tempId, res.id);

        // 3. Load New Data
        res.data = await getPlaylistFromChunks(res.id);

        res.stats = stats;
        res.lastSynced = Date.now();
        res.status = 'synced';
    } catch (e) {
        // FAILURE / CANCEL: Clean up temp data
        console.warn(`Sync failed/cancelled. Cleaning up temp data for ${res.name}`);
        await deletePlaylistDataFromDB(tempId);

        if (e.name === 'AbortError' || e.message === 'Aborted') {
            console.warn(`Sync cancelled for ${res.name}`);
            res.status = 'cancelled';
        } else {
            console.error(`Failed to load ${res.name}`, e);
            res.status = 'error';
        }
        // Keep existing res.data if it was there (so we don't clear UI on cancel)
        // If res.data was null (fresh load), it stays null.
    } finally {
        res.isLoading = false;
        res.currentProgress = null; // Clear temp progress
        res.abortController = null;
        saveResources();
        renderResourcesList();
    }
}

function updateResourceStatusUI(id, stats) {
    const statusTextEl = document.querySelector(`.resource-item[data-id="${id}"] .status-text`);
    if (statusTextEl) {
        statusTextEl.textContent = `Syncing... ${stats.channels + stats.movies + stats.series}`;
        // Or more detailed:
        // statusTextEl.textContent = `Syncing... Ch:${stats.channels} V:${stats.movies+stats.series}`;
    }
}

function cancelSync(res) {
    if (res.abortController) {
        res.abortController.abort();
        renderResourcesList();
    }
}

// --- Stream Checker ---

function cancelGlobalSync() {
    console.log("Cancelling global sync...");
    state.resources.forEach(res => {
        if (res.isLoading) {
            cancelSync(res);
        }
    });
    showLoading(false);
}

const statusObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            // Skip if link status checking is disabled
            if (!isLinkStatusEnabled()) return;

            const card = entry.target;
            const url = card.dataset.url;
            const badge = card.querySelector('.status-badge');

            if (url && badge) {
                // Check if we assume it's already checking to avoid double calls?
                // The checkStream function handles cache logic.
                checkStream(url, badge);
            }
            // We do NOT unobserve to ensure we re-check if user scrolls back after 2 hours
        }
    });
}, {
    root: null,
    rootMargin: '100px',
    threshold: 0.1
});

async function checkStream(url, badge, force = false) {
    // Skip if link status checking is disabled
    if (!isLinkStatusEnabled()) return;

    // 1. Check Cache (if not forced)
    if (!force) {
        const cached = getCachedStatus(url);
        if (cached) {
            updateBadgeUI(badge, cached);
            return;
        }
    }

    badge.classList.remove('status-online', 'status-offline');
    badge.classList.add('status-checking');
    badge.dataset.checked = "true"; // Mark as having been processed at least once this session

    // Helper to perform the fetch with timeout
    const doCheck = async (targetUrl) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout for potentially slower proxy
        try {
            const response = await fetch(targetUrl, {
                method: 'HEAD',
                signal: controller.signal,
                cache: 'no-store'
            });
            clearTimeout(timeoutId);
            return response;
        } catch (e) {
            clearTimeout(timeoutId);
            throw e;
        }
    };

    try {
        // 2. Try Direct Check
        const response = await doCheck(url);

        if (response.ok) {
            updateBadgeUI(badge, 'online');
            updateCachedStatus(url, 'online');
            return;
        } else {
            throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
    } catch (e) {
        // 3. If Direct failed (likely CORS), Try Proxy
        if (e.name === 'TypeError' || e.message.includes('fetch')) {
            try {
                // Using corsproxy.io as it handles HEAD requests transparently
                const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
                const proxyResponse = await doCheck(proxyUrl);

                if (proxyResponse.ok) {
                    updateBadgeUI(badge, 'online');
                    updateCachedStatus(url, 'online');
                    return; // Success via Proxy!
                }
            } catch (proxyError) {
                // Proxy failed too, proceed to log original error
            }
        }

        // 4. Final Error Handling
        updateBadgeUI(badge, 'offline');
        updateCachedStatus(url, 'offline');

        let reason = e.message;
        let category = 'UNKNOWN';

        if (e.name === 'AbortError') {
            reason = 'Timeout (limit reached)';
            category = 'TIMEOUT';
        } else if (e.name === 'TypeError') {
            reason = 'Blocked by Client (CORS) & Proxy also failed';
            category = 'BLOCKED';
        } else {
            category = 'HTTP/OTHER';
        }

        console.groupCollapsed(`%c[Stream Check Failed] %c${category}`, 'color: #ff4444; font-weight: bold;', 'color: #aaa;');
        console.log('URL:', url);
        console.log('Reason:', reason);
        console.groupEnd();
    }
}

function updateBadgeUI(badge, status) {
    badge.classList.remove('status-checking', 'status-online', 'status-offline');
    if (status === 'online') {
        badge.classList.add('status-online');
        // badge.title = "Stream Online";
    } else {
        badge.classList.add('status-offline');
        // badge.title = "Stream Offline"; // Keep user hover simple or add details if needed
    }
}

function aggregateData() {
    const result = {
        channels: {},
        movies: {},
        series: {}
    };

    state.resources.filter(r => r.active && r.data).forEach(res => {
        ['channels', 'movies', 'series'].forEach(cat => {
            const groups = res.data[cat];
            Object.keys(groups).forEach(groupName => {
                if (!result[cat][groupName]) {
                    result[cat][groupName] = [];
                }
                const items = groups[groupName].map(item => ({ ...item, source: res.name }));
                result[cat][groupName].push(...items);
            });
        });
    });

    state.aggregatedData = result;
}

// --- UI Rendering ---

// --- Optimization State ---
const lazyLoadState = {
    live: { groups: [], index: 0, observer: null },
    movies: { groups: [], index: 0, observer: null },
    series: { groups: [], index: 0, observer: null }
};

function renderContentViews() {
    // Reset States
    Object.keys(lazyLoadState).forEach(key => {
        lazyLoadState[key].index = 0;
        lazyLoadState[key].groups = [];
        if (lazyLoadState[key].observer) lazyLoadState[key].observer.disconnect();
    });

    const mainContent = document.getElementById('main-content');

    if (appSettings.layoutMode === 'nested') {
        mainContent.classList.add('nested-mode');
        renderNestedLayout('live', state.aggregatedData.channels);
        renderNestedLayout('movies', state.aggregatedData.movies);
        renderNestedLayout('series', state.aggregatedData.series);
    } else {
        mainContent.classList.remove('nested-mode');
        renderCategoryView('live', state.aggregatedData.channels);
        renderCategoryView('movies', state.aggregatedData.movies);
        renderCategoryView('series', state.aggregatedData.series);
    }
}

function renderNestedLayout(viewId, dataGroups) {
    const container = document.getElementById(`${viewId}-rows`);
    container.innerHTML = '';

    const groups = Object.keys(dataGroups).sort();

    // Check empty
    if (groups.length === 0) {
        container.innerHTML = `<div style="padding:40px; text-align:center; color:#666;">No content available. Go to Resources to add playlists.</div>`;
        return;
    }

    // Create Container
    const nestedContainer = document.createElement('div');
    nestedContainer.className = 'nested-view-container';

    // 1. Categories Sidebar
    const catSidebar = document.createElement('div');
    catSidebar.id = `categories-panel-${viewId}`;
    catSidebar.className = 'nested-sidebar categories-sidebar focusable-group';
    catSidebar.innerHTML = `<div class="nested-header">Categories</div>`;
    const catList = document.createElement('div');
    catList.className = 'nested-list';

    // 2. Items Sidebar (Only for Live TV channels list)
    let itemsSidebar = null;
    if (viewId === 'live') {
        itemsSidebar = document.createElement('div');
        itemsSidebar.id = `items-panel-${viewId}`;
        itemsSidebar.className = 'nested-sidebar items-sidebar';
        itemsSidebar.innerHTML = `<div class="nested-header">Channels</div><div class="nested-list"></div>`;
    }

    // 3. Main Content Area
    const contentArea = document.createElement('div');
    contentArea.className = 'nested-content-area';

    // Populate Categories
    groups.forEach(group => {
        const count = dataGroups[group].length;
        const bucketType = viewId === 'live' ? 'channels' : viewId;
        const isFav = isBucketFavorite(group, bucketType);

        const btn = document.createElement('div');
        btn.className = `nested-list-item focusable auto-trigger ${isFav ? 'favorite-group' : ''}`;
        btn.tabIndex = 0;
        btn.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px;">
                ${isFav ? '<i data-lucide="star" style="width:14px; height:14px; color:#ffb020; fill:currentColor;"></i>' : ''}
                <span>${group}</span>
            </div>
            <span class="count-badge">${count}</span>
        `;

        btn.addEventListener('click', (e) => {
            // Handle Favorite Toggle on Long Press or specific key? 
            // For now just selection.
            catList.querySelectorAll('.nested-list-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            handleNestedCategoryClick(viewId, group, dataGroups[group], itemsSidebar, contentArea);
        });

        // Keyboard support
        btn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') btn.click();
        });

        catList.appendChild(btn);
    });

    catSidebar.appendChild(catList);
    nestedContainer.appendChild(catSidebar);
    if (itemsSidebar) nestedContainer.appendChild(itemsSidebar);
    nestedContainer.appendChild(contentArea);

    container.appendChild(nestedContainer);

    // Initialize icons
    lucide.createIcons({ root: container });

    // Select first category by default if desired? No, let user choose.
}

function handleNestedCategoryClick(viewId, groupName, items, itemsSidebar, contentArea) {
    if (viewId === 'live') {
        // Show Channels Sidebar
        itemsSidebar.classList.add('visible');
        const listContainer = itemsSidebar.querySelector('.nested-list');
        listContainer.innerHTML = '';

        // Prepare Embedded Player Area
        const existingPlayer = contentArea.querySelector('#nested-player-container');
        if (!existingPlayer) {
            contentArea.innerHTML = `
                <div class="nested-content-wrapper">
                    <div id="nested-player-container">
                        <div class="tv-static"></div>
                        <img src="assets/ok_logo.svg" alt="" class="player-logo-watermark">
                        <div class="placeholder-icon" style="display:flex; flex-direction:column; align-items:center;">
                            <span style="color: rgba(255,255,255,0.4); font-size: 13px; margin-top: 120px;">Select a channel to play</span>
                        </div>
                        <div class="nested-player-hint">Click active channel to enter Full Screen</div>
                    </div>
                    
                    <div id="nested-player-info">
                        <div class="info-header">
                            <div class="channel-logo-large">
                                <span class="placeholder-logo"><i data-lucide="tv"></i></span>
                            </div>
                            <div class="channel-details">
                                <h2 id="nested-channel-name" class="channel-name">Select a Channel</h2>
                                <div class="channel-meta">
                                    <span class="meta-tag">LIVE</span>
                                    <span class="meta-quality">HD</span>
                                </div>
                            </div>
                        </div>
                        <div class="program-info">
                            <h3 id="nested-program-title">No Program Information</h3>
                            <p id="nested-program-desc" class="program-description">Select a channel from the list to start watching.</p>
                            <!-- <div class="progress-bar-container">
                                <div class="progress-bar" style="width: 0%"></div>
                            </div> -->
                        </div>
                    </div>
                </div>
            `;
            lucide.createIcons({ root: contentArea });
        }

        items.forEach(item => {
            const btn = document.createElement('div');
            btn.className = 'nested-list-item focusable auto-trigger';
            btn.tabIndex = 0;
            btn.dataset.url = item.url; // ID for state checking

            btn.addEventListener('click', () => {
                listContainer.querySelectorAll('.nested-list-item').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Check if already playing this channel
                if (PlayerState.channelNav.currentChannel && PlayerState.channelNav.currentChannel.url === item.url && PlayerState.mode.embedded) {
                    // Toggle Full Screen
                    console.log("Switching to Full Screen...");
                    switchPlayerToFullScreen();
                } else {
                    // Play in Embedded Mode
                    console.log("playing embedded...");
                    playMedia(item, 'live');
                }
            });

            // Layout with Logo
            const logoHtml = item.logo
                ? `<img src="${item.logo}" alt="" class="channel-list-logo" onerror="this.parentElement.innerHTML='<span class=\\'channel-list-icon\\'><i data-lucide=\\'tv\\'></i></span>'; lucide.createIcons();">`
                : `<span class="channel-list-icon"><i data-lucide="tv"></i></span>`;

            btn.innerHTML = `
                <div class="channel-list-content">
                    ${logoHtml}
                    <span class="channel-list-title">${item.title}</span>
                </div>
            `;

            btn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') btn.click();
            });

            listContainer.appendChild(btn);
        });

    } else {
        // Movies/Series: Show Grid in Content Area
        contentArea.innerHTML = '';

        const grid = document.createElement('div');
        grid.className = 'favorites-grid nested-media-grid'; // Reuse grid class
        grid.style.padding = '30px'; // Reset padding locally

        // If many items, maybe we need virtualization or batching? 
        // For now, render all (limit if needed)
        const DISPLAY_LIMIT = 50;

        const renderItems = (itemList) => {
            itemList.forEach(item => {
                const card = createCard(item, viewId);
                grid.appendChild(card); // createCard handles click -> play
            });
        };

        renderItems(items.slice(0, 50));

        if (items.length > 50) {
            const moreBtn = document.createElement('div');
            moreBtn.className = 'card focusable';
            moreBtn.style.minHeight = '150px';
            moreBtn.style.display = 'flex';
            moreBtn.style.alignItems = 'center';
            moreBtn.style.justifyContent = 'center';
            moreBtn.innerHTML = `<span>+${items.length - 50} More</span>`;
            moreBtn.tabIndex = 0;
            moreBtn.addEventListener('click', () => {
                moreBtn.remove();
                renderItems(items.slice(50));
            });
            grid.appendChild(moreBtn);
        }

        contentArea.appendChild(grid);
    }
}



async function handleNestedMediaClick(item, type, cardElement) {
    const contentArea = cardElement.closest('.nested-content-area');
    if (!contentArea) {
        console.error("Content area not found");
        return;
    }
    const existingGrid = contentArea.querySelector('.nested-media-grid');

    // Create or Reuse the Detail Panel
    let panel = contentArea.querySelector('.movie-detail-panel');

    // Resource Lookup
    const resource = state.resources.find(r => r.name === item.source);
    let extraInfo = {};
    let episodes = {}; // { season_num: [episodes...] }

    if (resource && resource.type === 'xtream' && resource.credentials) {
        const client = new XtreamClient(resource.credentials.host, resource.credentials.username, resource.credentials.password);
        try {
            if (type === 'movies') {
                const info = await client.getVodInfo(item.id);
                extraInfo = info.movie_data || {};
                extraInfo.info = info.info || {};
            } else if (type === 'series') {
                const info = await client.getSeriesInfo(item.id);
                extraInfo = info.info || {};
                episodes = info.episodes || {};
            }
        } catch (e) { console.error("Failed to fetch details", e); }
    }

    if (existingGrid) existingGrid.style.display = 'none';

    if (!panel) {
        panel = document.createElement('div');
        panel.className = 'movie-detail-panel';
        contentArea.appendChild(panel);
    }

    // Fallbacks
    const posterUrl = extraInfo.cover || extraInfo.stream_icon || item.logo || '';
    const rating = extraInfo.rating || 'N/A';
    const release = extraInfo.releaseDate || extraInfo.releasedate || '';
    const ext = extraInfo.container_extension || 'MP4';
    const plot = extraInfo.plot || extraInfo.description || 'No description available for this content.';

    // HTML Structure
    const isSeries = type === 'series';
    const colClass = isSeries ? 'detail-column series-mode' : 'detail-column';

    let episodesHtml = '';
    if (isSeries) {
        episodesHtml = `
            <div class="episodes-column">
                <div class="season-selector-container">
                    <select id="season-select" class="season-selector focusable">
                        <option value="" disabled selected>Select Season</option>
                    </select>
                </div>
                <div id="episodes-list" class="episodes-list">
                    <!-- Episodes injected here -->
                </div>
            </div>
        `;
    }

    panel.innerHTML = `
        <div class="split-detail-view">
             <button class="back-to-grid-btn focusable"><i data-lucide="arrow-left"></i> Back to List</button>
             
             <div class="detail-content-row">
                 <div class="${colClass}">
                     <div class="poster-large">
                         <img src="${posterUrl}" onerror="this.style.display='none'">
                     </div>
                     <h1 class="detail-title">${item.title}</h1>
                     <div class="detail-meta-row">
                        <span class="meta-tag">${rating}</span>
                        <span class="meta-tag">${release}</span>
                        ${!isSeries ? `<span class="meta-quality">${ext}</span>` : ''}
                     </div>
                     <p class="detail-description">${plot}</p>
                     
                     <div class="detail-actions">
                         ${!isSeries ? `<button class="btn btn-primary play-now-btn focusable"><i data-lucide="play"></i> Play Now</button>` : ''}
                         <button class="btn btn-glass focusable"><i data-lucide="star"></i> Favorite</button>
                     </div>
                 </div>
                 
                 ${episodesHtml}
                 
                 <div class="player-column">
                    <div id="nested-vod-player-container">
                         <div style="display:flex; align-items:center; justify-content:center; width:100%; height:100%; color:gray; background:#000;">
                             <div style="text-align:center;">
                                 <i data-lucide="play-circle" style="width:50px; height:50px; opacity:0.5; margin-bottom:10px;"></i>
                                 <div>${isSeries ? 'Select an episode to play' : "Click 'Play Now' to start"}</div>
                             </div>
                         </div>
                    </div>
                    <div class="track-selection">
                       <h3>Audio & Subtitles</h3>
                       <div id="track-controls">
                           <span style="opacity:0.5;">Start playback to select tracks</span>
                       </div>
                    </div>
                 </div>
             </div>
        </div>
    `;
    lucide.createIcons({ root: panel });

    // Handlers
    panel.querySelector('.back-to-grid-btn').addEventListener('click', () => {
        // Stop Clappr player if active
        if (typeof ClapprPlayer !== 'undefined' && ClapprPlayer.isActive()) {
            ClapprPlayer.stop();
        }
        panel.remove();
        if (existingGrid) existingGrid.style.display = '';
    });

    // Player Init Function
    const playContent = (streamUrl, containerId = '#nested-vod-player-container') => {
        const container = panel.querySelector(containerId);
        const useClappr = appSettings.playerType === 'clappr' && typeof ClapprPlayer !== 'undefined';
        const useVideoJS = appSettings.playerType === 'videojs' && typeof VideoJSPlayer !== 'undefined';

        // Reset controls
        const controlsPanel = panel.querySelector('#track-controls');
        controlsPanel.innerHTML = '<span style="opacity:0.5;">Loading tracks...</span>';

        if (useClappr) {
            // Use Clappr player
            container.innerHTML = ''; // Clear the container

            // Stop any existing Clappr playback
            if (ClapprPlayer.isActive()) {
                ClapprPlayer.stop();
            }

            // Create a Clappr-specific container
            const clapprContainer = document.createElement('div');
            clapprContainer.id = 'vod-clappr-container';
            clapprContainer.style.cssText = 'width:100%; height:100%;display:none;';
            container.appendChild(clapprContainer);

            // Initialize Clappr
            const playItem = { url: streamUrl, title: item.title };
            ClapprPlayer.play(playItem, type, container);

            // Update track controls for Clappr
            controlsPanel.innerHTML = '<span style="opacity:0.5;">Track selection available in player controls</span>';

        } else if (useVideoJS) {
            // Use VideoJS player
            container.innerHTML = ''; // Clear native stuff

            // Stop/Destroy active engine to be safe
            if (VideoJSPlayer.isActive()) {
                VideoJSPlayer.destroy();
            }

            const playItem = { url: streamUrl, title: item.title };
            // Play using VideoJS, telling it to mount in our container
            VideoJSPlayer.play(playItem, type, container);

            // Update track controls for VideoJS
            controlsPanel.innerHTML = '<span style="opacity:0.5;">Loading tracks...</span>';

            // Setup listeners for track updates
            VideoJSPlayer.onTracksChanged(() => {
                updateVideoJSTrackControls(controlsPanel);
            });

            // Also update immediately in case metadata is somehow already there (unlikely but safe)
            setTimeout(() => updateVideoJSTrackControls(controlsPanel), 1000);

        } else {
            // Use native HTML5 player
            container.innerHTML = `<video id="vod-video" controls autoplay style="width:100%; height:100%; background:black;"></video>`;
            const video = container.querySelector('video');

            if (Hls.isSupported() && streamUrl.endsWith('.m3u8')) {
                const hls = new Hls();
                hls.loadSource(streamUrl);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, function () {
                    video.play();
                    updateTrackControls(hls, controlsPanel); // HLS mode
                });
                hls.on(Hls.Events.ERROR, function (event, data) {
                    if (data.fatal) {
                        console.error("HLS Error", data);
                    }
                });
            } else {
                video.src = streamUrl;
                video.play().catch(e => console.error("Playback failed", e));

                // Handle native tracks
                const checkNativeTracks = () => {
                    console.log("Checking for native tracks...");
                    console.log("Audio Tracks:", video.audioTracks ? video.audioTracks.length : 'undefined');
                    console.log("Text Tracks:", video.textTracks ? video.textTracks.length : 'undefined');
                    updateTrackControls(video, controlsPanel, true); // Native mode
                };

                video.addEventListener('loadedmetadata', checkNativeTracks);
                // Also try immediately in case metadata is already loaded
                if (video.readyState >= 1) {
                    checkNativeTracks();
                }
            }
        }
    };

    if (isSeries) {
        // Populate Seasons
        const seasonSelect = panel.querySelector('#season-select');
        const episodesList = panel.querySelector('#episodes-list');
        const seasons = Object.keys(episodes).sort((a, b) => parseInt(a) - parseInt(b));

        seasons.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = `Season ${s}`;
            seasonSelect.appendChild(opt);
        });

        const renderEpisodes = (seasonNum) => {
            episodesList.innerHTML = '';
            const seasonEps = episodes[seasonNum] || [];
            if (seasonEps.length === 0) {
                episodesList.innerHTML = '<div style="padding:10px; color:#999;">No episodes found.</div>';
                return;
            }

            seasonEps.forEach(ep => {
                const el = document.createElement('div');
                el.className = 'episode-item focusable';
                el.tabIndex = 0;
                el.innerHTML = `
                    <div class="episode-title">${ep.episode_num}. ${ep.title}</div>
                    <div class="episode-meta">ID: ${ep.id} | ${ep.container_extension}</div>
                `;
                el.addEventListener('click', () => {
                    // Highlight
                    episodesList.querySelectorAll('.episode-item').forEach(x => x.classList.remove('active'));
                    el.classList.add('active');

                    // Build URL
                    // /series/username/password/id.ext
                    let url = '';
                    if (resource && resource.credentials) {
                        const { host, username, password } = resource.credentials;
                        url = `${host}/series/${username}/${password}/${ep.id}.${ep.container_extension}`;
                    } else {
                        console.error("No credentials for series stream");
                        return;
                    }

                    playContent(url);
                });
                // Add keydown Enter
                el.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') el.click();
                });
                episodesList.appendChild(el);
            });
        };

        if (seasons.length > 0) {
            seasonSelect.value = seasons[0];
            renderEpisodes(seasons[0]);
        }

        seasonSelect.addEventListener('change', (e) => {
            renderEpisodes(e.target.value);
        });

    } else {
        // MOVIE Logic
        panel.querySelector('.play-now-btn')?.addEventListener('click', () => {
            playContent(item.url);
        });
    }
}

function updateTrackControls(source, container, isNative = false) {
    if (!source) return;

    let audio = [];
    let subs = [];

    if (!isNative) {
        // HLS.js instance
        if (source.audioTracks) {
            source.audioTracks.forEach((t, i) => {
                audio.push({
                    index: i,
                    name: t.name || t.lang || `Track ${i + 1}`
                });
            });
        }
        if (source.subtitleTracks) {
            source.subtitleTracks.forEach((t, i) => {
                subs.push({
                    index: i,
                    name: t.name || t.lang || `Track ${i + 1}`
                });
            });
        }
    } else {
        // Native Video Element
        // AudioTracks implementation varies by browser
        if (source.audioTracks) {
            for (let i = 0; i < source.audioTracks.length; i++) {
                const t = source.audioTracks[i];
                audio.push({
                    index: i,
                    name: t.label || t.language || `Audio ${i + 1}`,
                    lang: t.language
                });
            }
        }

        // TextTracks (Subtitles)
        if (source.textTracks) {
            for (let i = 0; i < source.textTracks.length; i++) {
                const t = source.textTracks[i];
                // Filter for subtitles/captions
                if (t.kind === 'subtitles' || t.kind === 'captions') {
                    subs.push({
                        index: i,
                        name: t.label || t.language || `Subtitle ${i + 1}`,
                        lang: t.language
                    });
                }
            }
        }
    }

    let html = '';

    if (audio.length > 0) {
        html += `<div class="track-group"><label>Audio</label><select class="track-select audio-track">`;
        audio.forEach(t => {
            html += `<option value="${t.index}">${t.name}</option>`;
        });
        html += `</select></div>`;
    }

    if (subs.length > 0) {
        html += `<div class="track-group"><label>Subtitles</label><select class="track-select sub-track">`;
        html += `<option value="-1">Off</option>`;
        subs.forEach(t => {
            html += `<option value="${t.index}">${t.name}</option>`;
        });
        html += `</select></div>`;
    }

    if (html) {
        container.innerHTML = html;

        container.querySelector('.audio-track')?.addEventListener('change', (e) => {
            const idx = parseInt(e.target.value);
            if (!isNative) {
                source.audioTrack = idx;
            } else {
                // Native Audio Toggle
                if (source.audioTracks) {
                    for (let i = 0; i < source.audioTracks.length; i++) {
                        source.audioTracks[i].enabled = (i === idx);
                    }
                }
            }
        });

        container.querySelector('.sub-track')?.addEventListener('change', (e) => {
            const idx = parseInt(e.target.value);
            if (!isNative) {
                source.subtitleTrack = idx;
            } else {
                // Native Subtitle Toggle
                if (source.textTracks) {
                    for (let i = 0; i < source.textTracks.length; i++) {
                        // For text tracks, mode='showing' makes it visible, 'hidden' hides it
                        // 'disabled' might unload it. 'hidden' is usually best for toggling.
                        if (i === idx) {
                            source.textTracks[i].mode = 'showing';
                        } else {
                            // Only hide subtitles/captions, leave others (chapters/metadata) alone
                            if (source.textTracks[i].kind === 'subtitles' || source.textTracks[i].kind === 'captions') {
                                source.textTracks[i].mode = 'hidden';
                            }
                        }
                    }
                }
            }
        });
    } else {
        container.innerHTML = '<span style="opacity:0.5;">No selectable tracks found.</span>';
    }
}

function updateVideoJSTrackControls(container) {
    if (typeof VideoJSPlayer === 'undefined') return;

    const audioTracks = VideoJSPlayer.getAudioTracks();
    const subTracks = VideoJSPlayer.getSubtitleTracks();

    let html = '';

    // Audio Tracks
    if (audioTracks.length > 0) {
        // Find enabled track
        let activeAudioIndex = audioTracks.findIndex(t => t.enabled);
        if (activeAudioIndex === -1 && audioTracks.length > 0) activeAudioIndex = 0;

        html += `<div class="track-group"><label>Audio</label><select class="track-select audio-track">`;
        audioTracks.forEach((t, i) => {
            // We use 'i' which corresponds to the track index in the list returned? 
            // specific setAudioTrack implementation uses Real index if I passed it?
            // Let's check videojs-player.js setAudioTrack implementation again.
            // It iterates all tracks and checks `i === index`. So it expects REAL index.
            // getAudioTracks returned objects with `index` property which is real index.
            // BUT `getAudioTracks` returns a filter/map of the list. `player.audioTracks()` is a list.
            // In `getAudioTracks`: `for (let i = 0; i < tracks.length; i++)`. It iterates ALL.
            // So the array returned matches the real list order.
            // So `i` (loop index) IS the real index.
            html += `<option value="${i}" ${t.enabled ? 'selected' : ''}>${t.label}</option>`;
        });
        html += `</select></div>`;
    }

    // Subtitle Tracks
    if (subTracks.length > 0) {
        // Find showing track
        // getSubtitleTracks returns filtered list.
        // setSubtitleTrack expects FILTERED index (0, 1... of the subtitles only).
        let activeSubIndex = subTracks.findIndex(t => t.mode === 'showing');

        html += `<div class="track-group"><label>Subtitles</label><select class="track-select sub-track">`;
        html += `<option value="-1" ${activeSubIndex === -1 ? 'selected' : ''}>Off</option>`;
        subTracks.forEach((t, i) => {
            html += `<option value="${i}" ${t.mode === 'showing' ? 'selected' : ''}>${t.label}</option>`;
        });
        html += `</select></div>`;
    }

    if (html) {
        container.innerHTML = html;

        container.querySelector('.audio-track')?.addEventListener('change', (e) => {
            const idx = parseInt(e.target.value);
            VideoJSPlayer.setAudioTrack(idx);
        });

        container.querySelector('.sub-track')?.addEventListener('change', (e) => {
            const idx = parseInt(e.target.value);
            VideoJSPlayer.setSubtitleTrack(idx);
        });
    } else {
        container.innerHTML = '<span style="opacity:0.5;">No selectable tracks found (VideoJS).</span>';
    }
}

function renderCategoryView(viewId, dataGroups) {
    const container = document.getElementById(`${viewId}-rows`);
    container.innerHTML = '';

    const groups = Object.keys(dataGroups).sort(); // Alphabetical sort

    // Check empty
    if (groups.length === 0) {
        container.innerHTML = `<div style="padding:40px; text-align:center; color:#666;">No content available. Go to Resources to add playlists.</div>`;
        return;
    }

    // Initialize State
    lazyLoadState[viewId].groups = groups;
    lazyLoadState[viewId].data = dataGroups;
    lazyLoadState[viewId].container = container;

    // Create Sentinel for Infinite Scroll
    const sentinel = document.createElement('div');
    sentinel.className = 'scroll-sentinel';
    sentinel.style.height = '50px';
    sentinel.style.width = '100%';

    // Setup Observer
    lazyLoadState[viewId].observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
            renderNextBatch(viewId);
        }
    }, { root: null, margin: '200px' });

    // Initial Batch
    renderNextBatch(viewId);

    // Append sentinel after initial content
    container.appendChild(sentinel);
    lazyLoadState[viewId].observer.observe(sentinel);
}

function renderNextBatch(viewId) {
    const stateObj = lazyLoadState[viewId];
    const BATCH_SIZE = 5; // Render 5 groups at a time
    const MAX_ITEMS_INITIAL = 30; // Only show top 30 items horizontally

    const nextGroups = stateObj.groups.slice(stateObj.index, stateObj.index + BATCH_SIZE);

    if (nextGroups.length === 0) return;

    // We insert before the sentinel (which is the last child)
    const sentinel = stateObj.container.lastElementChild;

    nextGroups.forEach(group => {
        const items = stateObj.data[group];
        if (items.length === 0) return;

        // Row Structure
        const row = document.createElement('div');
        row.className = 'category-row';

        // Title
        const title = document.createElement('div');
        title.className = 'row-title';
        title.style.display = 'flex';
        title.style.alignItems = 'center';

        const bucketType = viewId === 'live' ? 'channels' : viewId;
        const isFavBucket = isBucketFavorite(group, bucketType);

        title.innerHTML = `
            <span>${group}</span> 
            <span style="opacity:0.5; font-size:0.8em; margin-left:10px; margin-right: 15px;">(${items.length})</span>
            <button class="favorite-bucket-btn ${isFavBucket ? 'active' : ''}" style="background:none; border:none; color:${isFavBucket ? '#ffb020' : '#666'}; font-size: 1.2em; cursor: pointer; transition: transform 0.2s;">
                <i data-lucide="star" style="width: 20px; height: 20px; ${isFavBucket ? 'fill: currentColor;' : ''}"></i>
            </button>
        `;
        lucide.createIcons({
            root: title
        });

        // Event for bucket favorite
        const favBtn = title.querySelector('.favorite-bucket-btn');
        favBtn.onclick = (e) => {
            e.stopPropagation();
            toggleFavoriteBucket(group, bucketType, favBtn);
        };

        row.appendChild(title);

        // Horizontal Scroll Container
        const scrollContainer = document.createElement('div');
        scrollContainer.className = 'horizontal-scroll-container';

        // Lazy Render Horizontal Items
        const initialItems = items.slice(0, MAX_ITEMS_INITIAL);
        initialItems.forEach(item => {
            const card = createCard(item, viewId);
            scrollContainer.appendChild(card);
        });

        // "Load More" Card if needed
        if (items.length > MAX_ITEMS_INITIAL) {
            const moreCard = createMoreCard(items, MAX_ITEMS_INITIAL, viewId);
            scrollContainer.appendChild(moreCard);
        }

        row.appendChild(scrollContainer);
        stateObj.container.insertBefore(row, sentinel);
    });

    stateObj.index += BATCH_SIZE;
}

function createMoreCard(allItems, currentIndex, type) {
    const card = document.createElement('div');
    card.className = 'card card-more focusable';
    card.tabIndex = 0;
    card.style.minWidth = '150px';
    card.style.display = 'flex';
    card.style.alignItems = 'center';
    card.style.justifyContent = 'center';
    card.style.backgroundColor = 'rgba(255,255,255,0.1)';
    card.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; gap:8px;">
            <i data-lucide="plus-circle" style="width:32px; height:32px; opacity:0.8;"></i>
            <span style="font-weight:bold; font-size:12px;">+${allItems.length - currentIndex} More</span>
        </div>
    `;
    lucide.createIcons({ root: card });

    card.addEventListener('click', (e) => {
        const container = card.parentElement;
        // Remove "More" button
        card.remove();

        // Append next batch (e.g., 50 more)
        const nextBatchSize = 50;
        const nextItems = allItems.slice(currentIndex, currentIndex + nextBatchSize);

        nextItems.forEach(item => {
            const newCard = createCard(item, type);
            container.appendChild(newCard);
        });

        // Add new "More" button if still remaining
        const newIndex = currentIndex + nextBatchSize;
        if (newIndex < allItems.length) {
            const newMoreCard = createMoreCard(allItems, newIndex, type);
            container.appendChild(newMoreCard);
        }
    });

    return card;
}

function createCard(item, type) {
    const card = document.createElement('div');
    card.className = `card card-${type === 'live' ? 'channel' : type} focusable`;
    card.tabIndex = -1;
    card.dataset.url = item.url; // Store URL for checker

    // Store item data for favorites
    const favoriteType = type === 'live' ? 'channels' : type;
    card.dataset.favoriteType = favoriteType;
    card.dataset.itemData = JSON.stringify(item);

    const img = document.createElement('img');
    img.className = 'card-image';
    img.loading = 'lazy';

    // Generate appropriate placeholder
    const placeholder = getPlaceholder(item.title, type);

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
    const isFavorite = isItemFavorite(item, favoriteType);
    const favBtn = document.createElement('button');
    favBtn.className = `favorite-btn ${isFavorite ? 'active' : ''}`;
    favBtn.innerHTML = `<i data-lucide="star" style="${isFavorite ? 'fill: currentColor;' : ''}"></i>`;
    favBtn.title = isFavorite ? 'Remove from Favorites' : 'Add to Favorites';
    lucide.createIcons({
        root: favBtn
    });

    favBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(item, favoriteType, favBtn);
    });

    card.appendChild(favBtn);

    // Overlay with Title + Status
    const overlay = document.createElement('div');
    overlay.className = 'card-overlay';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'card-title';
    titleDiv.textContent = item.title;

    // Only create status badge if link status checking is enabled
    let badge = null;
    if (isLinkStatusEnabled()) {
        badge = document.createElement('div');
        badge.className = 'status-badge';
        badge.title = "Checking stream...";
        overlay.appendChild(badge);
    }

    overlay.appendChild(titleDiv);
    if (badge) {
        overlay.appendChild(badge);
    }

    card.appendChild(overlay);

    // Track focus for yellow button
    card.addEventListener('focus', () => {
        state.focusedItem = { item, type: favoriteType, card };
    });

    card.addEventListener('mouseenter', () => {
        state.focusedItem = { item, type: favoriteType, card };
    });

    card.addEventListener('click', () => {
        // Check again when clicked (Force update) - only if enabled
        if (isLinkStatusEnabled() && badge) {
            checkStream(item.url, badge, true);
        }

        if (type === 'live') {
            playMedia(item, type);
        } else {
            // Movies & Series -> Click opens detail panel in nested view
            // But only if we are in nested view.
            if (appSettings.layoutMode === 'nested') {
                handleNestedMediaClick(item, type, card);
            } else {
                playMedia(item, type);
            }
        }
    });

    // Observe for checks - only if link status is enabled
    if (isLinkStatusEnabled()) {
        statusObserver.observe(card);
    }

    return card;
}

function getPlaceholder(title, type) {
    // Colors & Icons based on type
    let icon = '📺';
    let colorStart = '#1a1a20';
    let colorEnd = '#0f0f13';

    // Aspect Ratio hint (Width/Height)
    let w = 300, h = 200; // Default 3:2

    if (type === 'movies') {
        icon = '🍿';
        colorStart = '#2a1a2a'; // Subtle Pinkish/Dark
        colorEnd = '#150a15';
        w = 200; h = 300; // 2:3
    } else if (type === 'series') {
        icon = '🎬';
        colorStart = '#1a1a2e'; // Subtle Blueish
        colorEnd = '#0a0a15';
        w = 200; h = 300; // 2:3
    }

    // Clean title for XML
    const cleanTitle = title.replace(/[<>&'"]/g, '');

    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
        <defs>
            <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:${colorStart};stop-opacity:1" />
                <stop offset="100%" style="stop-color:${colorEnd};stop-opacity:1" />
            </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#grad)"/>
        <g transform="translate(${w / 2 - 20}, ${h / 2 - 40}) scale(1.5)" fill="none" stroke="#ffffff33" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            ${type === 'movies' ? '<path d="M2.2 2.2L2 22h20l-.2-19.8zM2 7h20M2 12h20M2 17h20M7 2v5M17 2v5M7 17v5M17 17v5"/>' :
            (type === 'series' ? '<rect width="20" height="15" x="2" y="3" rx="2" ry="2"/><path d="m11 13 4-2.5-4-2.5v5Z"/><path d="m12 18 3.5 3.5"/><path d="m20 18-3.5 3.5"/><path d="m12 8-3.5-3.5"/><path d="m20 8-3.5-3.5"/>' :
                '<rect width="20" height="15" x="2" y="7" rx="2" ry="2"/><path d="m17 2-5 5-5-5"/><path d="m2 12h20"/><path d="m2 17h20"/><path d="m7 12v10"/><path d="m17 12v10"/>')}
        </g>
        <text x="50%" y="65%" dominant-baseline="middle" text-anchor="middle" fill="#666" font-family="sans-serif" font-size="14" font-weight="bold">
            ${cleanTitle.substring(0, 15)}${cleanTitle.length > 15 ? '...' : ''}
        </text>
    </svg>`;

    // Base64 encode safely
    return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
}

function renderResourcesList() {
    const container = document.getElementById('resources-list-container');
    container.innerHTML = '';

    state.resources.forEach(res => {
        const item = document.createElement('div');
        item.className = 'resource-item focusable';
        item.dataset.id = res.id; // Add ID for selective updates
        if (res.active) item.classList.add('active-resource');
        item.tabIndex = 0;

        // Status Meta
        let statusIcon = '';
        let statusText = '';
        if (res.isLoading) {
            statusIcon = '<div class="mini-spinner"></div>';
            if (res.currentProgress) {
                const s = res.currentProgress;
                statusText = `Syncing... ${s.channels + s.movies + s.series}`;
            } else {
                statusText = 'Syncing...';
            }
        } else if (res.status === 'error') {
            statusIcon = '<span style="color:var(--error-color)">⚠️</span>';
            statusText = 'Failed';
        } else if (res.status === 'cancelled') {
            statusIcon = '<span style="color:orange">⏹</span>';
            statusText = 'Cancelled';
        } else if (!res.active) {
            statusText = 'Disabled';
        } else {
            statusIcon = '<i data-lucide="check-circle-2" style="color:#10b981; width: 16px; height: 16px;"></i>';
            const date = res.lastSynced ? new Date(res.lastSynced).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never';
            statusText = `Synced: ${date}`;
        }

        let actionButtons = '';
        if (res.isLoading) {
            actionButtons = `
                <button class="btn-icon cancel-btn focusable" title="Cancel Sync" style="color: #ff4444; border-color: #ff4444;">
                    <i data-lucide="square"></i>
                </button>
            `;
        } else {
            actionButtons = `
                <button class="btn-icon edit-btn focusable" title="Edit" data-id="${res.id}">
                    <i data-lucide="pencil"></i>
                </button>
                <button class="btn-icon refresh-btn focusable" title="Sync Now" data-id="${res.id}">
                    <i data-lucide="refresh-cw"></i>
                </button>
                <div class="toggle-switch ${res.active ? 'active' : ''}" data-id="${res.id}">
                    <div class="toggle-knob"></div>
                </div>
                <button class="btn-icon delete-btn focusable" title="Delete" data-id="${res.id}">
                    <i data-lucide="trash-2"></i>
                </button>
            `;
        }

        item.innerHTML = `
            <div class="resource-main">
                <div class="resource-header">
                    <h3>${res.name}</h3>
                    <div class="resource-meta">
                        ${statusIcon} <span class="status-text">${statusText}</span>
                    </div>
                </div>
                
                <div class="resource-url">${res.url}</div>
                
                <div class="resource-stats">
                    <div class="stat-badge"><span class="icon"><i data-lucide="tv"></i></span> ${res.stats?.channels || 0}</div>
                    <div class="stat-badge"><span class="icon"><i data-lucide="film"></i></span> ${res.stats?.movies || 0}</div>
                    <div class="stat-badge"><span class="icon"><i data-lucide="clapperboard"></i></span> ${res.stats?.series || 0}</div>
                </div>
            </div>

            <div class="resource-actions">
                ${actionButtons}
            </div>
        `;

        // Events
        if (res.isLoading) {
            const cancelBtn = item.querySelector('.cancel-btn');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    cancelSync(res);
                });
            }
        } else {
            // Toggle
            item.querySelector('.toggle-switch').addEventListener('click', (e) => {
                e.stopPropagation();
                const isActive = !res.active;
                toggleResource(res.id, isActive);
                // Just toggle state - use refresh button to sync
                aggregateData();
                renderContentViews();
                renderResourcesList();
            });

            // Refresh
            const refreshBtn = item.querySelector('.refresh-btn');
            refreshBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                refreshBtn.classList.add('spin-anim'); // UI feedback
                await syncResource(res);
                aggregateData();
                renderContentViews();
                renderResourcesList();
                refreshBtn.classList.remove('spin-anim');
            });

            // Edit
            item.querySelector('.edit-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                openEditPlaylistModal(res);
            });

            // Delete
            item.querySelector('.delete-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm(`Delete playlist "${res.name}"?`)) {
                    removeResource(res.id);
                    renderResourcesList();
                    // Re-calculate everything since a source is gone
                    aggregateData();
                    renderContentViews();
                }
            });
        }

        container.appendChild(item);
    });
    lucide.createIcons({
        root: container
    });
}

function openEditPlaylistModal(resource) {
    const modal = document.getElementById('playlist-modal');
    const modalTitle = document.getElementById('playlist-modal-title');
    const editIdField = document.getElementById('edit-playlist-id');
    const nameInput = document.getElementById('new-playlist-name');
    const urlInput = document.getElementById('new-playlist-url');
    const fileImportGroup = document.getElementById('file-import-group');
    const saveBtn = document.getElementById('save-playlist-btn');

    // Fields for Xtream
    const hostInput = document.getElementById('xtream-host');
    const userInput = document.getElementById('xtream-user');
    const passInput = document.getElementById('xtream-pass');

    // Set edit mode
    modalTitle.textContent = 'Edit Playlist';
    editIdField.value = resource.id;
    nameInput.value = resource.name;
    saveBtn.textContent = 'Update & Sync';

    const tabs = modal.querySelectorAll('.modal-tab');
    const contents = modal.querySelectorAll('.tab-content');

    // Reset Tabs Logic
    tabs.forEach(t => t.classList.remove('active'));
    contents.forEach(c => c.classList.remove('active'));

    if (resource.type === 'xtream' && resource.credentials) {
        // Is Xtream
        hostInput.value = resource.credentials.host;
        userInput.value = resource.credentials.username;
        passInput.value = resource.credentials.password;

        // Activate Xtream Tab (index 1)
        if (tabs[1]) tabs[1].classList.add('active');
        if (contents[1]) contents[1].classList.add('active');
    } else {
        // Is M3U
        urlInput.value = resource.url; // Or empty if it was xtream

        // Active M3U Tab (index 0)
        if (tabs[0]) tabs[0].classList.add('active');
        if (contents[0]) contents[0].classList.add('active');
    }

    // Hide file import option during edit (not applicable)
    if (fileImportGroup) {
        fileImportGroup.style.display = 'none';
    }

    modal.classList.add('visible');
    nameInput.focus();
}

// --- Navigation & Sidebar ---

function setupNavigation() {
    // Sidebar Clicks
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(el => {
        el.addEventListener('click', () => {
            switchToView(el.dataset.target);
        });
    });
}

function switchToView(targetId) {
    state.currentView = targetId;

    // Sidebar Active State
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.target === targetId);
    });

    // View Visibility
    document.querySelectorAll('.view-section').forEach(el => {
        el.classList.remove('active');
    });

    const targetSection = document.getElementById(targetId);
    if (targetSection) {
        targetSection.classList.add('active');
    }

    lucide.createIcons();

    // Render favorites view when switching to it
    if (targetId === 'favorites') {
        renderFavoritesView();
    }

    // Refocus

}

// --- Add/Edit Playlist Modal ---

function setupResourcesUI() {
    const modal = document.getElementById('playlist-modal');
    const openBtn = document.getElementById('add-playlist-btn');
    const cancelBtn = document.getElementById('cancel-playlist-btn');
    const saveBtn = document.getElementById('save-playlist-btn');
    const fileInput = document.getElementById('local-file-importer');

    // Tab Logic
    const tabs = modal.querySelectorAll('.modal-tab');
    const contents = modal.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Deactivate all
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            // Activate clicked
            tab.classList.add('active');
            const targetId = `tab-content-${tab.dataset.tab}`;
            document.getElementById(targetId).classList.add('active');
        });
    });

    // Global Cancel
    const globalCancelBtn = document.getElementById('global-cancel-btn');
    if (globalCancelBtn) {
        globalCancelBtn.addEventListener('click', () => {
            cancelGlobalSync();
        });
    }

    openBtn.addEventListener('click', () => {
        // Reset to add mode
        resetModalToAddMode();
        modal.classList.add('visible');
        document.getElementById('new-playlist-name').focus();
    });

    const closeModal = () => {
        modal.classList.remove('visible');
        document.getElementById('new-playlist-name').value = '';
        document.getElementById('new-playlist-url').value = '';
        document.getElementById('edit-playlist-id').value = '';
        document.getElementById('xtream-host').value = '';
        document.getElementById('xtream-user').value = '';
        document.getElementById('xtream-pass').value = '';
        fileInput.value = ''; // Reset file input
        // Reset to add mode on close
        resetModalToAddMode();
    };

    cancelBtn.addEventListener('click', closeModal);

    // Handle Local File Selection
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const objectUrl = URL.createObjectURL(file);
            document.getElementById('new-playlist-url').value = objectUrl;
            // Auto-suggest name
            if (!document.getElementById('new-playlist-name').value) {
                document.getElementById('new-playlist-name').value = file.name.replace('.m3u', '').replace('.m3u8', '');
            }
        }
    });

    saveBtn.addEventListener('click', async () => {
        const name = document.getElementById('new-playlist-name').value.trim();
        const editId = document.getElementById('edit-playlist-id').value;
        const activeTab = modal.querySelector('.modal-tab.active').dataset.tab;

        let url = '';
        let type = 'm3u';
        let credentials = null;

        if (activeTab === 'xtream') {
            const host = document.getElementById('xtream-host').value.trim();
            const user = document.getElementById('xtream-user').value.trim();
            const pass = document.getElementById('xtream-pass').value.trim();

            if (!host || !user || !pass) {
                alert('Please enter Server URL, Username, and Password');
                return;
            }

            // Ensure host has protocol
            let safeHost = host;
            if (!safeHost.startsWith('http')) {
                safeHost = 'http://' + safeHost;
            }
            // Remove trailing slash
            if (safeHost.endsWith('/')) {
                safeHost = safeHost.slice(0, -1);
            }

            // For Xtream Type, we store the base host
            url = safeHost;
            type = 'xtream';
            credentials = { host: safeHost, username: user, password: pass };
        } else {
            url = document.getElementById('new-playlist-url').value.trim();
            if (!url) {
                alert('Please enter a name and URL');
                return;
            }
        }

        if (!name) {
            alert('Please enter a name');
            return;
        }

        if (editId) {
            // Edit mode - update existing resource
            await updateResource(editId, name, url, { type, credentials });
        } else {
            // Add mode - create new resource
            addResource(name, url, { type, credentials });
        }

        closeModal();
        await refreshContent();
    });
}

function resetModalToAddMode() {
    const modalTitle = document.getElementById('playlist-modal-title');
    const saveBtn = document.getElementById('save-playlist-btn');
    const fileImportGroup = document.getElementById('file-import-group');

    // Reset Tabs
    const tabs = document.querySelectorAll('.modal-tab');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(t => t.classList.remove('active'));
    contents.forEach(c => c.classList.remove('active'));

    // Set first tab (M3U) active
    if (tabs[0]) tabs[0].classList.add('active');
    if (contents[0]) contents[0].classList.add('active');

    // Clear Inputs
    document.getElementById('xtream-host').value = '';
    document.getElementById('xtream-user').value = '';
    document.getElementById('xtream-pass').value = '';

    if (modalTitle) modalTitle.textContent = 'Add New Playlist';
    if (saveBtn) saveBtn.textContent = 'Save & Sync';
    if (fileImportGroup) fileImportGroup.style.display = '';
}

async function updateResource(id, name, url, options = {}) {
    const res = state.resources.find(r => r.id === id);
    if (!res) return;

    const urlChanged = res.url !== url;
    const typeChanged = options.type && res.type !== options.type;
    const credsChanged = options.credentials && JSON.stringify(res.credentials) !== JSON.stringify(options.credentials);

    // Update name
    res.name = name;

    // Update Options
    if (options.type) res.type = options.type;
    if (options.credentials) res.credentials = options.credentials;

    // Update URL if changed or type changed
    if (urlChanged || typeChanged || credsChanged) {
        res.url = url;
        // Clear cached data
        res.data = null;
        res.status = 'pending';
        res.stats = { channels: 0, movies: 0, series: 0 };
        res.lastSynced = null;
        // Delete old cached data from IndexedDB
        await deletePlaylistDataFromDB(id);
    }

    saveResources();
    renderResourcesList();
}

// --- Search ---

function setupSearch() {
    const input = document.getElementById('global-search-input');
    const resultsContainer = document.getElementById('search-results');

    let debounceTimer;
    input.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            performSearch(e.target.value);
        }, 500);
    });

    function performSearch(query) {
        state.searchQuery = query.toLowerCase();
        resultsContainer.innerHTML = '';

        if (state.searchQuery.length < 2) return;

        // Search across all aggregated data
        const matches = [];
        ['channels', 'movies', 'series'].forEach(cat => {
            const catData = state.aggregatedData[cat];
            Object.values(catData).forEach(list => {
                list.forEach(item => {
                    if (item.title.toLowerCase().includes(state.searchQuery)) {
                        matches.push({ ...item, type: cat });
                    }
                });
            });
        });

        // Limit results
        const displayMatches = matches.slice(0, 50);

        if (displayMatches.length === 0) {
            resultsContainer.innerHTML = '<div style="padding:20px;">No results found.</div>';
            return;
        }

        // Render simple Grid for results
        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(160px, 1fr))';
        grid.style.gap = '20px';

        displayMatches.forEach(item => {
            const card = createCard(item, item.type === 'channels' ? 'live' : item.type);
            grid.appendChild(card);
        });

        resultsContainer.appendChild(grid);
    }
}

// --- Settings ---

function setupSettings() {
    // Link Status Toggle
    const linkStatusToggle = document.getElementById('toggle-link-status');
    if (linkStatusToggle) {
        // Initialize toggle state based on settings
        if (appSettings.linkStatusEnabled) {
            linkStatusToggle.classList.add('active');
        }

        linkStatusToggle.addEventListener('click', () => {
            appSettings.linkStatusEnabled = !appSettings.linkStatusEnabled;
            linkStatusToggle.classList.toggle('active', appSettings.linkStatusEnabled);
            saveAppSettings();

            // Re-render content to show/hide status badges
            renderContentViews();
        });
    }

    // Layout Mode Toggle
    const layoutToggleBtn = document.getElementById('layout-toggle-btn');
    const layoutDesc = document.getElementById('layout-mode-desc');

    if (layoutToggleBtn && layoutDesc) {
        // Set Initial Valid
        layoutDesc.textContent = `Current: ${appSettings.layoutMode === 'nested' ? 'Nested Folders' : 'Full Cards'}`;

        layoutToggleBtn.addEventListener('click', () => {
            appSettings.layoutMode = appSettings.layoutMode === 'cards' ? 'nested' : 'cards';
            layoutDesc.textContent = `Current: ${appSettings.layoutMode === 'nested' ? 'Nested Folders' : 'Full Cards'}`;
            saveAppSettings();
            renderContentViews();
        });
    }

    // Player Type Toggle
    const playerTypeToggle = document.getElementById('toggle-player-type');
    const playerTypeLabel = document.getElementById('player-type-label');

    if (playerTypeToggle && playerTypeLabel) {
        // Initialize toggle state
        const updatePlayerTypeUI = () => {
            if (appSettings.playerType === 'clappr') {
                playerTypeToggle.classList.add('active');
                playerTypeToggle.classList.remove('videojs-active');
                playerTypeLabel.textContent = 'Clappr';
            } else if (appSettings.playerType === 'videojs') {
                playerTypeToggle.classList.add('active');
                playerTypeToggle.classList.add('videojs-active');
                playerTypeLabel.textContent = 'VideoJS';
            } else {
                playerTypeToggle.classList.remove('active');
                playerTypeToggle.classList.remove('videojs-active');
                appSettings.playerType = 'html5'; // Ensure valid default
                playerTypeLabel.textContent = 'HTML5';
            }
        };

        updatePlayerTypeUI();

        playerTypeToggle.addEventListener('click', () => {
            // Cycle: html5 -> clappr -> videojs -> html5
            if (appSettings.playerType === 'html5') {
                appSettings.playerType = 'clappr';
            } else if (appSettings.playerType === 'clappr') {
                appSettings.playerType = 'videojs';
            } else {
                appSettings.playerType = 'html5';
            }

            updatePlayerTypeUI();
            saveAppSettings();

            // Stop any active player when switching
            if (typeof cleanupPlayback === 'function') {
                cleanupPlayback();
            }
            // Additional Force Stop for Modules
            if (typeof ClapprPlayer !== 'undefined' && ClapprPlayer.stop) {
                ClapprPlayer.stop();
            }
            if (typeof VideoJSPlayer !== 'undefined' && VideoJSPlayer.destroy) {
                VideoJSPlayer.destroy();
            }

            console.log(`Player type changed to: ${appSettings.playerType}`);
        });
    }

    // Reset App Button
    const resetBtn = document.getElementById('reset-app-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            if (confirm('Are you sure you want to clear all playlists and reset the app?')) {
                localStorage.clear();
                await clearPlaylistDB();
                location.reload();
            }
        });
    }
}

function showLoading(show) {
    document.getElementById('global-loader').style.display = show ? 'flex' : 'none';
}

// --- Favorites Management ---

function loadFavorites() {
    try {
        const stored = localStorage.getItem('watchnow_favorites');
        if (stored) {
            const parsed = JSON.parse(stored);
            state.favorites = {
                channels: parsed.channels || [],
                movies: parsed.movies || [],
                series: parsed.series || [],
                buckets: parsed.buckets || []
            };
        }
    } catch (e) {
        console.error("Failed to load favorites", e);
        state.favorites = { channels: [], movies: [], series: [], buckets: [] };
    }
}

function saveFavorites() {
    try {
        localStorage.setItem('watchnow_favorites', JSON.stringify(state.favorites));
    } catch (e) {
        console.error("Failed to save favorites", e);
    }
}

function isItemFavorite(item, type) {
    const favorites = state.favorites[type] || [];
    return favorites.some(fav => fav.url === item.url);
}

function addToFavorites(item, type) {
    if (!state.favorites[type]) {
        state.favorites[type] = [];
    }

    // Check if already in favorites
    if (isItemFavorite(item, type)) {
        return false;
    }

    // Add to favorites
    state.favorites[type].push({
        title: item.title,
        url: item.url,
        logo: item.logo || null,
        source: item.source || 'Unknown',
        addedAt: Date.now()
    });

    saveFavorites();
    return true;
}

function removeFromFavorites(item, type) {
    if (!state.favorites[type]) return false;

    const index = state.favorites[type].findIndex(fav => fav.url === item.url);
    if (index > -1) {
        state.favorites[type].splice(index, 1);
        saveFavorites();
        return true;
    }
    return false;
}

function toggleFavorite(item, type, buttonElement) {
    const isFav = isItemFavorite(item, type);

    if (isFav) {
        removeFromFavorites(item, type);
        if (buttonElement) {
            buttonElement.classList.remove('active');
            buttonElement.innerHTML = '<i data-lucide="star"></i>';
            buttonElement.title = 'Add to Favorites';
            lucide.createIcons({ root: buttonElement });
        }
        showToast('star', `Removed from Favorites`, 'info');
    } else {
        addToFavorites(item, type);
        if (buttonElement) {
            buttonElement.classList.add('active', 'pop');
            buttonElement.innerHTML = '<i data-lucide="star" style="fill: currentColor;"></i>';
            buttonElement.title = 'Remove from Favorites';
            lucide.createIcons({ root: buttonElement });
            // Remove pop animation class after it completes
            setTimeout(() => buttonElement.classList.remove('pop'), 300);
        }
        showToast('star', `Added to Favorites`, 'success');
    }

    // Update favorites view if we're currently on it
    if (state.currentView === 'favorites') {
        renderFavoritesView();
    }

    // Update favorite buttons on all matching cards
    updateFavoriteButtonsForItem(item, type);
}

function updateFavoriteButtonsForItem(item, type) {
    const isFav = isItemFavorite(item, type);

    // Find all cards with matching URL and update their favorite buttons
    document.querySelectorAll(`.card[data-url="${CSS.escape(item.url)}"] .favorite-btn`).forEach(btn => {
        if (isFav) {
            btn.classList.add('active');
            btn.innerHTML = '<i data-lucide="star" style="fill: currentColor;"></i>';
            btn.title = 'Remove from Favorites';
        } else {
            btn.classList.remove('active');
            btn.innerHTML = '<i data-lucide="star"></i>';
            btn.title = 'Add to Favorites';
        }
        lucide.createIcons({ root: btn });
    });
}

function isBucketFavorite(name, type) {
    const buckets = state.favorites.buckets || [];
    return buckets.some(b => b.name === name && b.type === type);
}

function toggleFavoriteBucket(name, type, btnElement) {
    if (!state.favorites.buckets) state.favorites.buckets = [];

    const index = state.favorites.buckets.findIndex(b => b.name === name && b.type === type);

    if (index > -1) {
        // Remove
        state.favorites.buckets.splice(index, 1);
        if (btnElement) {
            btnElement.innerHTML = '<i data-lucide="star"></i>';
            btnElement.style.color = '#666';
            btnElement.classList.remove('active');
            lucide.createIcons({ root: btnElement });
        }
        showToast('folder', `Removed Folder from Favorites`, 'info');
    } else {
        // Add
        state.favorites.buckets.push({
            name: name,
            type: type,
            addedAt: Date.now()
        });
        if (btnElement) {
            btnElement.innerHTML = '<i data-lucide="star" style="fill: currentColor;"></i>';
            btnElement.style.color = '#ffb020';
            btnElement.classList.add('active');
            lucide.createIcons({ root: btnElement });

            // Pop animation
            btnElement.style.transform = 'scale(1.4)';
            setTimeout(() => btnElement.style.transform = 'scale(1)', 200);
        }
        showToast('folder', `Added Folder to Favorites`, 'success');
    }
    saveFavorites();
}

function createBucketCard(bucket) {
    const card = document.createElement('div');
    card.className = 'card card-bucket focusable';
    card.tabIndex = 0;
    card.style.height = '140px';
    card.style.aspectRatio = '3/2';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.alignItems = 'center';
    card.style.justifyContent = 'center';
    card.style.backgroundColor = 'var(--surface-color)'; // fallback
    card.style.position = 'relative';

    // Different styles based on type
    let icon = '📁';
    let label = 'Channels';
    let gradient = 'linear-gradient(45deg, #333, #111)';

    if (bucket.type === 'channels') {
        icon = '📺';
        label = 'Channels';
        gradient = 'linear-gradient(135deg, rgba(30, 30, 40, 1), rgba(15, 15, 20, 1))';
    } else if (bucket.type === 'movies') {
        icon = '🍿';
        label = 'Movies';
        gradient = 'linear-gradient(135deg, rgba(40, 20, 30, 1), rgba(20, 10, 15, 1))';
    } else if (bucket.type === 'series') {
        icon = '🎬';
        label = 'Series';
        gradient = 'linear-gradient(135deg, rgba(20, 20, 40, 1), rgba(10, 10, 20, 1))';
    }

    card.style.background = gradient;
    card.innerHTML = `
        <div style="font-size: 40px; margin-bottom: 10px;"><i data-lucide="${bucket.type === 'channels' ? 'tv' : (bucket.type === 'movies' ? 'film' : 'clapperboard')}" style="width: 48px; height: 48px;"></i></div>
        <div style="font-size: 14px; font-weight: bold; padding: 0 10px; text-align: center; overflow:hidden; text-overflow:ellipsis; max-width:100%; white-space:nowrap;">
            ${bucket.name}
        </div>
        <div style="font-size: 10px; opacity: 0.6; margin-top: 5px;">${label} Folder</div>
        <button class="favorite-btn active" style="position: absolute; top: 10px; right: 10px; background: none; border: none; font-size: 16px;"><i data-lucide="star" style="fill: currentColor;"></i></button>
    `;
    lucide.createIcons({ root: card });

    // Remove logic
    const favBtn = card.querySelector('.favorite-btn');
    favBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavoriteBucket(bucket.name, bucket.type, null);
        card.remove(); // Immediate feedback in favorites view

        // Hide section if empty
        const grid = document.getElementById('fav-buckets-grid');
        if (grid && grid.children.length === 0) {
            document.getElementById('fav-buckets-section').style.display = 'none';
        }
    });

    // Click logic -> Open that folder
    card.addEventListener('click', () => {
        openBucket(bucket);
    });

    return card;
}

function openBucket(bucket) {
    // Determine target view
    const targetView = bucket.type === 'channels' ? 'live' : bucket.type;

    // Switch to view
    switchToView(targetView);

    // Get Data
    const allData = state.aggregatedData[bucket.type];
    if (!allData || !allData[bucket.name]) {
        showToast('⚠️', 'Content not found (source might be missing)', 'error');
        return;
    }

    // Force render ONLY this group
    const container = document.getElementById(`${targetView}-rows`);
    container.innerHTML = `
        <div style="margin-bottom: 20px;">
            <button id="back-to-all-${targetView}" class="btn btn-glass focusable" style="margin-bottom:20px;">← Back to All ${targetView === 'live' ? 'Channels' : bucket.type}</button>
            <h1>${bucket.name}</h1>
        </div>
    `;

    // Hack: Manually render this group ignoring lazy load state used for full list
    // We reuse the row creation logic mostly
    const items = allData[bucket.name];

    // Create a Grid Layout for the bucket view instead of horizontal scroll
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(160px, 1fr))';
    grid.style.gap = '20px';

    // Render first 100 items for performance, add "Load More" if needed
    items.slice(0, 100).forEach(item => {
        const card = createCard(item, targetView);
        grid.appendChild(card);
    });

    container.appendChild(grid);

    // Back button logic
    document.getElementById(`back-to-all-${targetView}`).addEventListener('click', () => {
        // Reset view
        renderContentViews();
    });

    // Focus back button
    setTimeout(() => nav.focusFirst(), 100);
}

// --- Yellow Button Handler for LG Remote ---

function setupFavoritesKeyHandler() {
    document.addEventListener('keydown', (e) => {
        // Yellow button on LG webOS remote is keyCode 405
        // Also support 'y' key for testing in browser
        if (e.keyCode === 405 || e.key === 'y' || e.key === 'Y') {
            handleYellowButtonPress();
        }
    });
}

function handleYellowButtonPress() {
    // Check if we have a focused item
    if (state.focusedItem) {
        const { item, type, card } = state.focusedItem;
        const favBtn = card.querySelector('.favorite-btn');
        toggleFavorite(item, type, favBtn);
    }
}

// --- Favorites View Rendering ---

function renderFavoritesView() {
    const channelsGrid = document.getElementById('fav-channels-grid');
    const moviesGrid = document.getElementById('fav-movies-grid');
    const seriesGrid = document.getElementById('fav-series-grid');
    const bucketsGrid = document.getElementById('fav-buckets-grid');

    const channelsSection = document.getElementById('fav-channels-section');
    const moviesSection = document.getElementById('fav-movies-section');
    const seriesSection = document.getElementById('fav-series-section');
    const bucketsSection = document.getElementById('fav-buckets-section');
    const emptyState = document.getElementById('fav-empty-state');

    // Clear grids
    channelsGrid.innerHTML = '';
    moviesGrid.innerHTML = '';
    seriesGrid.innerHTML = '';
    bucketsGrid.innerHTML = '';

    // Render channels
    const hasChannels = state.favorites.channels.length > 0;
    if (hasChannels) {
        state.favorites.channels.forEach(item => {
            const card = createCard(item, 'live');
            channelsGrid.appendChild(card);
        });
    }
    channelsSection.style.display = hasChannels ? 'block' : 'none';

    // Render movies
    const hasMovies = state.favorites.movies.length > 0;
    if (hasMovies) {
        state.favorites.movies.forEach(item => {
            const card = createCard(item, 'movies');
            moviesGrid.appendChild(card);
        });
    }
    moviesSection.style.display = hasMovies ? 'block' : 'none';

    // Render series
    const hasSeries = state.favorites.series.length > 0;
    if (hasSeries) {
        state.favorites.series.forEach(item => {
            const card = createCard(item, 'series');
            seriesGrid.appendChild(card);
        });
    }
    seriesSection.style.display = hasSeries ? 'block' : 'none';

    // Render buckets
    const hasBuckets = state.favorites.buckets && state.favorites.buckets.length > 0;
    if (hasBuckets) {
        state.favorites.buckets.forEach(bucket => {
            const card = createBucketCard(bucket);
            bucketsGrid.appendChild(card);
        });
    }
    if (bucketsSection) bucketsSection.style.display = hasBuckets ? 'block' : 'none';

    // Show empty state if no favorites
    const hasFavorites = hasChannels || hasMovies || hasSeries || hasBuckets;
    emptyState.style.display = hasFavorites ? 'none' : 'flex';

    lucide.createIcons();
}

// --- Toast Notification ---

function createToastElement() {
    // Check if toast already exists
    if (document.getElementById('toast-notification')) return;

    const toast = document.createElement('div');
    toast.id = 'toast-notification';
    toast.className = 'toast';
    toast.innerHTML = `
        <span class="toast-icon"></span>
        <span class="toast-message"></span>
    `;
    document.body.appendChild(toast);
}

let toastTimeout = null;

function showToast(icon, message, type = 'info') {
    const toast = document.getElementById('toast-notification');
    if (!toast) return;

    // Clear any existing timeout
    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }

    // Update content
    const iconEl = toast.querySelector('.toast-icon');
    if (icon.length < 5) { // Simple check for emoji vs lucide name
        iconEl.textContent = icon;
    } else {
        iconEl.innerHTML = `<i data-lucide="${icon}"></i>`;
        lucide.createIcons({ root: iconEl });
    }
    toast.querySelector('.toast-message').textContent = message;

    // Update type class
    toast.classList.remove('success', 'error', 'info');
    toast.classList.add(type);

    // Show toast
    toast.classList.add('visible');

    // Hide after delay
    toastTimeout = setTimeout(() => {
        toast.classList.remove('visible');
    }, 2500);
}
