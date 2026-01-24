/**
 * API Service
 * Manages generic API calls, Stream Checking, and Playlist Syncing.
 */

class ApiService {
    constructor() {
        this.parser = new PlaylistParser();
    }

    // NOTE: Weather API functionality moved to js/services/weather-service.js

    // --- Backend Sync ---

    async syncToBackend(resources, okpId, appVersion, platform) {
        if (!okpId) return;

        try {
            const payload = resources.map(r => ({
                id: r.id,
                name: r.name,
                url: r.url,
                active: r.active,
                stats: r.stats,
                lastSynced: r.lastSynced,
                type: r.type || 'm3u',
                credentials: r.credentials || null
            }));

            const res = await fetch('http://localhost:3000/api/device/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    okpId: okpId,
                    resources: payload,
                    appPlatform: platform,
                    appVersion: appVersion
                })
            });

            if (!res.ok) {
                console.error("Sync response not OK", res.status);
            } else {
                console.log("Sync to backend successful");
            }
        } catch (e) {
            console.error("Failed to sync to backend", e);
        }
    }

    // --- Remote Playlist Sync (Server Config) ---

    // Sync a single remote playlist URL (legacy/simple mode)
    // Returns a wrapper object to be added to resources
    createRemoteResource(url) {
        return {
            id: Date.now().toString(),
            name: "Cloud Playlist",
            url: url,
            active: true,
            status: 'pending',
            stats: { channels: 0, movies: 0, series: 0 },
            isLoading: false,
            lastSynced: null
        };
    }

    // Process server playlist JSON and update local resources
    // Returns { resources: [], changed: bool }
    processRemotePlaylists(playlistJson, localResources) {
        if (!playlistJson) return { resources: localResources, changed: false };

        let changed = false;
        let remoteResources = [];

        try {
            remoteResources = typeof playlistJson === 'string' ? JSON.parse(playlistJson) : playlistJson;

            // Handle legacy single string
            if (!Array.isArray(remoteResources)) {
                if (typeof remoteResources === 'string' && remoteResources.startsWith('http')) {
                    // Convert to resource object logic handled by caller usually, but here we can just return one
                    // This part of original code was messy. Let's assume standard array format usually.
                    // If string, we can't easily merge without duplicating logic. 
                    // Recommendation: Assume array for clean code.
                }
                return { resources: localResources, changed: false };
            }
        } catch (e) {
            console.error("Failed to parse remote playlists", e);
            return { resources: localResources, changed: false };
        }

        // Merge logic
        remoteResources.forEach(remote => {
            const exists = localResources.find(l => (l.id === remote.id) || (l.url === remote.url && l.name === remote.name));

            if (!exists) {
                localResources.push({
                    ...remote,
                    active: true,
                    status: 'pending',
                    stats: { channels: 0, movies: 0, series: 0 },
                    lastSynced: null,
                    isLoading: false
                });
                changed = true;
            } else {
                if (exists.url !== remote.url || JSON.stringify(exists.credentials) !== JSON.stringify(remote.credentials)) {
                    exists.url = remote.url;
                    exists.credentials = remote.credentials;
                    exists.type = remote.type;
                    exists.status = 'pending';
                    changed = true;
                }
            }
        });

        // Delete removed
        const toDelete = localResources.filter(l => {
            // Only if we assume ALL resources are managed remotely? 
            // Original code: "We only remove resources that look 'managed'..."
            // But implementation checked against remote list presence only if "Synced from server" which isn't flagged explicitly.
            // Original logic: "Find local items NOT in remote items". This implies LOCAL USER ADDED items would be deleted?
            // That seems dangerous if mixed. 
            // Replicating original logic exactly:
            const foundInRemote = remoteResources.some(r => r.id === l.id || (r.url === l.url && r.name === l.name));
            // Wait, if users add manual M3U, it won't be in remoteResources.
            // The original code has a risk there, or assumes `syncRemotePlaylistsFromServer` is only called with the FULL list of user's playlists.
            return !foundInRemote;
        });

        // If we are strict, we return toDelete IDs so caller can cleanup DB
        // But here we modify localResources in place (as passed by reference)
        toDelete.forEach(del => {
            const idx = localResources.indexOf(del);
            if (idx > -1) {
                localResources.splice(idx, 1);
                changed = true;
            }
        });

        return { resources: localResources, changed, deletedIds: toDelete.map(d => d.id) };
    }

    // --- Resource Sync (Heavy Lifting) ---

    async syncResource(res, callbacks = {}) {
        // callbacks: { onProgress, onStatusUpdate, onRender }
        const { onStatusUpdate, onRender } = callbacks;

        // Cancel previous
        if (res.abortController) res.abortController.abort();
        res.abortController = new AbortController();

        res.isLoading = true;
        res.status = 'syncing';
        if (onRender) onRender();

        const tempId = `temp_${res.id}`;

        try {
            console.log(`Fetching ${res.name}...`);
            await window.storageService.deletePlaylistDataFromDB(tempId);

            let stats;

            if (res.type === 'xtream' && res.credentials) {
                // Xtream
                const client = new XtreamClient(res.credentials.host, res.credentials.username, res.credentials.password, res.name);
                const result = await client.fetchAll(res.abortController.signal);
                stats = result.stats;

                if (onStatusUpdate) onStatusUpdate(res.id, stats);

                // Convert to items list for chunking
                const items = [];
                ['channels', 'movies', 'series', 'catchup'].forEach(cat => {
                    if (result.data[cat]) {
                        Object.keys(result.data[cat]).forEach(group => {
                            result.data[cat][group].forEach(item => {
                                item.category = cat;
                                items.push(item);
                            });
                        });
                    }
                });

                const chunkSize = 2000;
                for (let i = 0; i < items.length; i += chunkSize) {
                    const chunk = items.slice(i, i + chunkSize);
                    if (res.abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');
                    await window.storageService.savePlaylistChunk(tempId, Math.floor(i / chunkSize), chunk);
                }

            } else {
                // M3U
                let chunkCounter = 0;
                stats = await this.parser.parseFromUrl(res.url, {
                    signal: res.abortController.signal,
                    onProgress: (s) => {
                        res.currentProgress = s;
                        if (onStatusUpdate) onStatusUpdate(res.id, s);
                    },
                    onBatch: async (batch) => {
                        await window.storageService.savePlaylistChunk(tempId, chunkCounter++, batch);
                    }
                });
            }

            console.log(`Sync success. Committing ${res.name}...`);

            // Commit
            await window.storageService.deletePlaylistDataFromDB(res.id);
            await window.storageService.movePlaylistChunks(tempId, res.id);

            // Load new data
            res.data = await window.storageService.getPlaylistFromChunks(res.id);
            res.stats = stats;
            res.lastSynced = Date.now();
            res.status = 'synced';

        } catch (e) {
            console.warn(`Sync failed/cancelled for ${res.name}`, e);
            await window.storageService.deletePlaylistDataFromDB(tempId);

            if (e.name === 'AbortError' || e.message === 'Aborted') {
                res.status = 'cancelled';
            } else {
                res.status = 'error';
            }
        } finally {
            res.isLoading = false;
            res.currentProgress = null;
            res.abortController = null;
            if (onRender) onRender();
            // Caller should saveResources()
        }

        return res.status;
    }

    cancelSync(res, onRender) {
        if (res.abortController) {
            res.abortController.abort();
            if (onRender) onRender();
        }
    }


}

window.apiService = new ApiService();
