/**
 * Playlist Manager
 * Manages playlist resources, syncing, data aggregation, and associated UI.
 */
class PlaylistManager {
    constructor() {

    }

    init() {
        this.loadResourcesFromStorage();

        this.setupUI();
    }

    // --- Resources Data Management ---

    loadResourcesFromStorage() {
        state.resources = storageService.loadResources();
    }

    saveResources() {
        storageService.saveResources(state.resources);
        this.syncToBackend();
    }

    async syncToBackend() {
        const okpId = localStorage.getItem('watchnow_okp_id');
        const version = APP_VERSION;
        const platform = getPlatform();
        await apiService.syncToBackend(state.resources, okpId, version, platform);
    }

    addResource(name, url, options = {}) {
        const newResource = {
            id: Date.now().toString(),
            name: name,
            url: url,
            active: true,
            isLoading: false,
            status: 'pending',
            stats: { channels: 0, movies: 0, series: 0, catchup: 0 },
            lastSynced: null,
            data: null,
            type: options.type || 'm3u',
            credentials: options.credentials || null
        };
        state.resources.push(newResource);
        this.saveResources();
        return newResource;
    }

    removeResource(id) {
        state.resources = state.resources.filter(r => r.id !== id);
        this.saveResources();
        storageService.deletePlaylistDataFromDB(id);
    }

    toggleResource(id, active) {
        const res = state.resources.find(r => r.id === id);
        if (res) {
            res.active = active;
            this.saveResources();
        }
    }

    async updateResource(id, name, url, options = {}) {
        const res = state.resources.find(r => r.id === id);
        if (!res) return;

        const urlChanged = res.url !== url;
        const typeChanged = options.type && res.type !== options.type;
        const credsChanged = options.credentials && JSON.stringify(res.credentials) !== JSON.stringify(options.credentials);

        res.name = name;

        if (options.type) res.type = options.type;
        if (options.credentials) res.credentials = options.credentials;

        if (urlChanged || typeChanged || credsChanged) {
            res.url = url;
            res.data = null;
            res.status = 'pending';
            res.stats = { channels: 0, movies: 0, series: 0 };
            res.lastSynced = null;
            await storageService.deletePlaylistDataFromDB(id);
        }

        this.saveResources();
        this.renderResourcesList();
    }

    // --- Remote Playlist Sync (Server) ---

    syncRemotePlaylist(url) {
        const newRes = apiService.createRemoteResource(url);
        const resources = storageService.loadResources();
        const exists = resources.find(r => r.url === url);

        if (!exists) {
            resources.push(newRes);
            storageService.saveResources(resources);
            if (typeof state !== 'undefined' && state.resources) {
                state.resources = resources;
            }
        }
    }

    syncRemotePlaylistsFromServer(playlistJson) {
        const result = apiService.processRemotePlaylists(playlistJson, state.resources);
        if (result.changed) {
            state.resources = result.resources;
            storageService.saveResources(state.resources);

            if (result.deletedIds) {
                result.deletedIds.forEach(id => storageService.deletePlaylistDataFromDB(id));
            }

            this.renderResourcesList();
        }
    }

    // --- Content Loading & Aggregation ---

    async loadCachedContent() {
        const activeResources = state.resources.filter(r => r.active);

        const promises = activeResources.map(async (res) => {
            if (res.data) return;

            const cachedData = await storageService.getPlaylistFromChunks(res.id);
            if (cachedData) {
                res.data = cachedData;
                res.status = 'synced';
                return;
            }

            if (!res.data) {
                res.status = 'pending';
            }
        });

        await Promise.all(promises);

        this.aggregateData();
        // Assuming migrateFavoritesWithIds is global or we need to move it? It wasn't in list but likely in app.js
        if (typeof migrateFavoritesWithIds === 'function') migrateFavoritesWithIds();
        this.renderContentViews();
        this.renderResourcesList();
    }

    aggregateData() {
        const result = {
            channels: {},
            movies: {},
            series: {},
            catchup: {}
        };

        state.resources.filter(r => r.active && r.data).forEach(res => {
            ['channels', 'movies', 'series', 'catchup'].forEach(cat => {
                const groups = res.data[cat];
                if (groups) {
                    Object.keys(groups).forEach(groupName => {
                        if (!result[cat][groupName]) {
                            result[cat][groupName] = [];
                        }
                        const items = groups[groupName].map(item => ({ ...item, source: res.name }));
                        result[cat][groupName].push(...items);
                    });
                }
            });
        });

        state.aggregatedData = result;
    }

    async syncResource(res) {
        const statsEl = document.getElementById('global-loader-stats');

        if (statsEl) statsEl.textContent = 'Downloading Playlist...';

        const callbacks = {
            onStatusUpdate: (id, stats) => {
                if (statsEl) {
                    statsEl.textContent = `Channels: ${stats.channels} | Movies: ${stats.movies} | Series: ${stats.series}`;
                }
                this.updateResourceStatusUI(id, stats);
            },
            onRender: () => {
                this.renderResourcesList();
            }
        };

        await apiService.syncResource(res, callbacks);

        this.saveResources();
    }

    cancelSync(res) {
        apiService.cancelSync(res, () => this.renderResourcesList());
    }

    cancelGlobalSync() {
        state.resources.forEach(res => {
            if (res.isLoading) {
                this.cancelSync(res);
            }
        });
        showLoading(false);
    }



    // --- UI Rendering ---

    renderContentViews() {
        const mainContent = document.getElementById('main-content');
        if (mainContent) mainContent.classList.add('nested-mode');

        if (typeof renderNestedLayout === 'function') {
            renderNestedLayout('live', state.aggregatedData.channels);
            renderNestedLayout('movies', state.aggregatedData.movies);
            renderNestedLayout('series', state.aggregatedData.series);
            renderNestedLayout('catchup', state.aggregatedData.catchup);
        }

        if (window.searchManager) {
            searchManager.setupCategorySearchHandlers();
        }
    }

    renderResourcesList() {
        const container = document.getElementById('resources-list-container');
        if (!container) return;

        container.innerHTML = '';

        state.resources.forEach(res => {
            const item = document.createElement('div');
            item.className = `resource-item focusable ${res.isLoading ? 'syncing' : ''}`;
            item.dataset.id = res.id;
            item.tabIndex = 0;

            let statusText = res.isLoading ? 'Syncing...' : (res.status === 'synced' ? 'Synced' : (res.status === 'error' ? 'Error' : 'Not Synced'));

            if (res.status === 'synced' && res.lastSynced) {
                const date = new Date(res.lastSynced);
                const dateStr = date.toLocaleDateString();
                const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                statusText = `Synced at ${dateStr} ${timeStr}`;
            }

            const statusClass = res.status === 'synced' ? 'status-synced' : (res.status === 'error' ? 'status-error' : 'status-pending');
            const typeIcon = res.type === 'xtream' ? 'server' : 'list';

            item.innerHTML = `
                <div class="resource-info">
                    <i data-lucide="${typeIcon}" style="width:18px; height:18px; opacity:0.5; margin-right:10px;"></i>
                    <span class="resource-name">${res.name}</span>
                    <span class="status-text ${statusClass}">${statusText}</span>
                </div>
                <div class="resource-stats">
                    <span class="stat" title="Channels"><i data-lucide="tv" style="width:14px; height:14px;"></i> ${(res.stats && res.stats.channels) || 0}</span>
                    <span class="stat" title="Movies"><i data-lucide="film" style="width:14px; height:14px;"></i> ${(res.stats && res.stats.movies) || 0}</span>
                    <span class="stat" title="Series"><i data-lucide="clapperboard" style="width:14px; height:14px;"></i> ${(res.stats && res.stats.series) || 0}</span>
                    <span class="stat" title="Catchup"><i data-lucide="clock" style="width:14px; height:14px;"></i> ${(res.stats && res.stats.catchup) || 0}</span>
                </div>
                <div class="resource-actions">
                    <button class="btn btn-icon sync-btn focusable" title="Sync Now"><i data-lucide="refresh-cw"></i></button>
                    <button class="btn btn-icon edit-btn focusable" title="Edit"><i data-lucide="pencil"></i></button>
                    <button class="btn btn-icon delete-btn focusable" title="Delete"><i data-lucide="trash-2"></i></button>
                </div>
            `;

            // Sync Button
            item.querySelector('.sync-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                showLoading(true);
                await this.syncResource(res);
                this.aggregateData();
                this.renderContentViews();
                this.renderResourcesList();
                showLoading(false);
            });

            // Edit Button
            item.querySelector('.edit-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.openEditPlaylistModal(res);
            });

            // Delete Button
            item.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                ConfirmationModal.show({
                    title: 'Delete Playlist?',
                    message: `Are you sure you want to delete "${res.name}"?`,
                    confirmText: 'Delete',
                    cancelText: 'Cancel',
                    onConfirm: () => {
                        this.removeResource(res.id);
                        this.aggregateData();
                        this.renderContentViews();
                        this.renderResourcesList();
                    }
                });
            });

            container.appendChild(item);
        });

        if (window.lucide) lucide.createIcons({ root: container });
    }

    updateResourceStatusUI(id, stats) {
        const statusTextEl = document.querySelector(`.resource-item[data-id="${id}"] .status-text`);
        if (statusTextEl) {
            statusTextEl.textContent = `Syncing... Ch:${stats.channels} M:${stats.movies} S:${stats.series}`;
        }
    }

    // --- Modal & Form Logic ---

    setupUI() {
        const modal = document.getElementById('playlist-modal');
        const openBtn = document.getElementById('add-playlist-btn');
        const cancelBtn = document.getElementById('cancel-playlist-btn');
        const saveBtn = document.getElementById('save-playlist-btn');
        const fileInput = document.getElementById('local-file-importer');

        if (!modal) return;

        const tabs = modal.querySelectorAll('.modal-tab');
        const contents = modal.querySelectorAll('.tab-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                contents.forEach(c => c.classList.remove('active'));

                tab.classList.add('active');
                const targetId = `tab-content-${tab.dataset.tab}`;
                document.getElementById(targetId).classList.add('active');
            });
        });

        const globalCancelBtn = document.getElementById('global-cancel-btn');
        if (globalCancelBtn) {
            globalCancelBtn.addEventListener('click', () => {
                this.cancelGlobalSync();
            });
        }

        if (openBtn) {
            openBtn.addEventListener('click', () => {
                this.resetModalToAddMode();
                modal.classList.add('visible');
                document.getElementById('new-playlist-name').focus();
            });
        }

        const closeModal = () => {
            modal.classList.remove('visible');
            document.getElementById('new-playlist-name').value = '';
            document.getElementById('new-playlist-url').value = '';
            document.getElementById('edit-playlist-id').value = '';
            document.getElementById('xtream-host').value = '';
            document.getElementById('xtream-user').value = '';
            document.getElementById('xtream-pass').value = '';
            if (fileInput) fileInput.value = '';
            this.resetModalToAddMode();
        };

        if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const objectUrl = URL.createObjectURL(file);
                    document.getElementById('new-playlist-url').value = objectUrl;
                    if (!document.getElementById('new-playlist-name').value) {
                        document.getElementById('new-playlist-name').value = file.name.replace('.m3u', '').replace('.m3u8', '');
                    }
                }
            });
        }

        if (saveBtn) {
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

                    let safeHost = host;
                    if (!safeHost.startsWith('http')) {
                        safeHost = 'http://' + safeHost;
                    }
                    if (safeHost.endsWith('/')) {
                        safeHost = safeHost.slice(0, -1);
                    }

                    url = safeHost;
                    type = 'xtream';
                    credentials = { host: safeHost, username: user, password: pass };

                    const originalText = saveBtn.textContent;
                    const originalDisabled = saveBtn.disabled;
                    saveBtn.textContent = 'Verifying...';
                    saveBtn.disabled = true;

                    try {
                        const client = new XtreamClient(safeHost, user, pass);
                        await client.authenticate();
                    } catch (e) {
                        alert('Authentication Failed: ' + (e.message || 'Unknown Error'));
                        saveBtn.textContent = originalText;
                        saveBtn.disabled = originalDisabled;
                        return;
                    }

                    saveBtn.textContent = originalText;
                    saveBtn.disabled = originalDisabled;

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
                    await this.updateResource(editId, name, url, { type, credentials });
                    showToast('check', 'Playlist updated successfully', 'success');
                } else {
                    this.addResource(name, url, { type, credentials });
                    showToast('check', 'Playlist added successfully', 'success');
                }

                closeModal();
                this.renderResourcesList();
            });
        }
    }

    resetModalToAddMode() {
        const modalTitle = document.getElementById('playlist-modal-title');
        const saveBtn = document.getElementById('save-playlist-btn');
        const fileImportGroup = document.getElementById('file-import-group');

        const tabs = document.querySelectorAll('.modal-tab');
        const contents = document.querySelectorAll('.tab-content');

        tabs.forEach(t => t.classList.remove('active'));
        contents.forEach(c => c.classList.remove('active'));

        if (tabs[0]) tabs[0].classList.add('active');
        if (contents[0]) contents[0].classList.add('active');

        document.getElementById('xtream-host').value = '';
        document.getElementById('xtream-user').value = '';
        document.getElementById('xtream-pass').value = '';

        if (modalTitle) modalTitle.textContent = 'Add New Playlist';
        if (saveBtn) saveBtn.textContent = 'Save';
        if (fileImportGroup) fileImportGroup.style.display = '';
    }

    openEditPlaylistModal(resource) {
        const modal = document.getElementById('playlist-modal');
        const modalTitle = document.getElementById('playlist-modal-title');
        const saveBtn = document.getElementById('save-playlist-btn');
        const fileImportGroup = document.getElementById('file-import-group');

        document.getElementById('edit-playlist-id').value = resource.id;
        document.getElementById('new-playlist-name').value = resource.name;

        const tabs = modal.querySelectorAll('.modal-tab');
        const contents = modal.querySelectorAll('.tab-content');

        tabs.forEach(t => t.classList.remove('active'));
        contents.forEach(c => c.classList.remove('active'));

        if (resource.type === 'xtream') {
            tabs[1].classList.add('active');
            document.getElementById('tab-content-xtream').classList.add('active');
            document.getElementById('xtream-host').value = (resource.credentials && resource.credentials.host) || '';
            document.getElementById('xtream-user').value = (resource.credentials && resource.credentials.username) || '';
            document.getElementById('xtream-pass').value = (resource.credentials && resource.credentials.password) || '';
        } else {
            tabs[0].classList.add('active');
            document.getElementById('tab-content-m3u').classList.add('active');
            document.getElementById('new-playlist-url').value = resource.url;
        }

        if (modalTitle) modalTitle.textContent = 'Edit Playlist';
        if (saveBtn) saveBtn.textContent = 'Update';
        if (fileImportGroup) fileImportGroup.style.display = 'none';

        modal.classList.add('visible');
        document.getElementById('new-playlist-name').focus();
    }
}

window.playlistManager = new PlaylistManager();
