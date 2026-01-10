class XtreamClient {
    constructor(baseUrl, username, password) {
        this.baseUrl = baseUrl;
        this.username = username;
        this.password = password;
        this.authUrl = `${this.baseUrl}/player_api.php?username=${this.username}&password=${this.password}`;
    }

    async fetchWithTimeout(url, options = {}) {
        const { timeout = 30000, signal } = options;
        const controller = new AbortController();

        // Handle external signal
        if (signal) {
            if (signal.aborted) {
                return Promise.reject(new DOMException('Aborted', 'AbortError'));
            }
            signal.addEventListener('abort', () => controller.abort());
        }

        const id = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(id);
            return response;
        } catch (e) {
            clearTimeout(id);
            // If it was our timeout that caused abort, throw Timeout
            // If it was external signal, it will propagate as AbortError (or we can ensure it)
            if (signal && signal.aborted) {
                throw new DOMException('Aborted', 'AbortError');
            }
            throw e;
        }
    }

    async fetchJson(action, params = {}, signal = null) {
        let url = `${this.authUrl}&action=${action}`;
        for (const [key, value] of Object.entries(params)) {
            url += `&${key}=${encodeURIComponent(value)}`;
        }

        try {
            const res = await this.fetchWithTimeout(url, { signal });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (e) {
            if (e.name === 'AbortError') throw e; // Propagate abort immediately
            throw e;
        }
    }

    async authenticate() {
        // Just calling the base URL returns auth info
        const res = await this.fetchJson('');
        if (res.user_info && res.user_info.auth === 1) {
            return res;
        }
        throw new Error('Authentication Failed');
    }

    async fetchAll(signal = null) {
        const data = {
            channels: {},
            movies: {},
            series: {}
        };
        const stats = {
            channels: 0,
            movies: 0,
            series: 0
        };

        // Parallel Fetching of Categories
        // We catch errors per request so one failure doesn't break all, 
        // BUT if it's an AbortError, we should arguably stop everything.
        // However, Promise.all will reject immediately if one rejects.
        // Let's ensure we propagate AbortError.

        const fetchCat = (action) => this.fetchJson(action, {}, signal).catch(e => {
            if (e.name === 'AbortError') throw e;
            return [];
        });

        const [liveCats, vodCats, serCats] = await Promise.all([
            fetchCat('get_live_categories'),
            fetchCat('get_vod_categories'),
            fetchCat('get_series_categories')
        ]);

        const liveCatMap = this.mapCategories(liveCats);
        const vodCatMap = this.mapCategories(vodCats);
        const serCatMap = this.mapCategories(serCats);

        // Fetch Streams (This can be heavy, ideally we stream or batch, but API limits usually force one big get)
        // Some providers support categories in get_live_streams, but usually generic 'get_live_streams' returns all.

        // 1. Live
        try {
            const liveStreams = await this.fetchJson('get_live_streams', {}, signal);
            if (Array.isArray(liveStreams)) {
                liveStreams.forEach(stream => {
                    const catName = liveCatMap[stream.category_id] || 'Uncategorized';
                    if (!data.channels[catName]) data.channels[catName] = [];

                    data.channels[catName].push({
                        title: stream.name,
                        logo: stream.stream_icon,
                        group: catName,
                        url: `${this.baseUrl}/live/${this.username}/${this.password}/${stream.stream_id}.ts`,
                        id: stream.stream_id,
                        epg_id: stream.epg_channel_id
                    });
                    stats.channels++;
                });
            }
        } catch (e) {
            if (e.name === 'AbortError') throw e;
            console.error("Error fetching live streams", e);
        }

        // 2. VOD
        try {
            const vodStreams = await this.fetchJson('get_vod_streams', {}, signal);
            if (Array.isArray(vodStreams)) {
                vodStreams.forEach(stream => {
                    const catName = vodCatMap[stream.category_id] || 'Uncategorized';
                    if (!data.movies[catName]) data.movies[catName] = [];

                    const ext = stream.container_extension || 'mp4';
                    data.movies[catName].push({
                        title: stream.name,
                        logo: stream.stream_icon,
                        group: catName,
                        url: `${this.baseUrl}/movie/${this.username}/${this.password}/${stream.stream_id}.${ext}`,
                        id: stream.stream_id,
                        rating: stream.rating
                    });
                    stats.movies++;
                });
            }
        } catch (e) {
            if (e.name === 'AbortError') throw e;
            console.error("Error fetching vod streams", e);
        }

        // 3. Series
        try {
            const seriesList = await this.fetchJson('get_series', {}, signal);
            if (Array.isArray(seriesList)) {
                seriesList.forEach(series => {
                    const catName = serCatMap[series.category_id] || 'Uncategorized';
                    if (!data.series[catName]) data.series[catName] = [];

                    data.series[catName].push({
                        title: series.name,
                        logo: series.cover,
                        group: catName,
                        id: series.series_id,
                        isSeries: true, // Marker for UI to handle click differently
                        rating: series.rating
                        // No direct URL for series
                    });
                    stats.series++;
                });
            }
        } catch (e) {
            if (e.name === 'AbortError') throw e;
            console.error("Error fetching series", e);
        }

        return { data, stats };
    }

    async getVodInfo(vodId) {
        return this.fetchJson('get_vod_info', { vod_id: vodId });
    }

    async getSeriesInfo(seriesId) {
        return this.fetchJson('get_series_info', { series_id: seriesId });
    }

    mapCategories(cats) {
        const map = {};
        if (Array.isArray(cats)) {
            cats.forEach(c => {
                map[c.category_id] = c.category_name;
            });
        }
        return map;
    }
}
