class XtreamClient {
    constructor(baseUrl, username, password) {
        this.baseUrl = baseUrl;
        this.username = username;
        this.password = password;
        this.authUrl = `${this.baseUrl}/player_api.php?username=${this.username}&password=${this.password}`;
    }

    async fetchWithTimeout(url, options = {}) {
        const { timeout = 30000 } = options;
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(id);
            return response;
        } catch (e) {
            clearTimeout(id);
            throw e;
        }
    }

    async fetchJson(action, params = {}) {
        let url = `${this.authUrl}&action=${action}`;
        for (const [key, value] of Object.entries(params)) {
            url += `&${key}=${encodeURIComponent(value)}`;
        }

        try {
            const res = await this.fetchWithTimeout(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (e) {
            // Try Proxy if direct fails
            console.warn(`Direct fetch to ${action} failed, trying proxy...`);
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
            const res = await this.fetchWithTimeout(proxyUrl);
            if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
            return await res.json();
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

    async fetchAll() {
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
        const [liveCats, vodCats, serCats] = await Promise.all([
            this.fetchJson('get_live_categories').catch(() => []),
            this.fetchJson('get_vod_categories').catch(() => []),
            this.fetchJson('get_series_categories').catch(() => [])
        ]);

        const liveCatMap = this.mapCategories(liveCats);
        const vodCatMap = this.mapCategories(vodCats);
        const serCatMap = this.mapCategories(serCats);

        // Fetch Streams (This can be heavy, ideally we stream or batch, but API limits usually force one big get)
        // Some providers support categories in get_live_streams, but usually generic 'get_live_streams' returns all.

        // 1. Live
        try {
            const liveStreams = await this.fetchJson('get_live_streams');
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
        } catch (e) { console.error("Error fetching live streams", e); }

        // 2. VOD
        try {
            const vodStreams = await this.fetchJson('get_vod_streams');
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
        } catch (e) { console.error("Error fetching vod streams", e); }

        // 3. Series
        try {
            const seriesList = await this.fetchJson('get_series');
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
        } catch (e) { console.error("Error fetching series", e); }

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
