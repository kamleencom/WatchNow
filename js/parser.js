/**
 * Advanced M3U8 Parser
 * Parses #EXTINF lines and categorizes content into Groups/Folders.
 * Now supports Streaming for large playlists (100MB+).
 */

class PlaylistParser {
    constructor() {
        this.reset();
    }

    reset() {
        this.data = {
            channels: {},
            movies: {},
            series: {}
        };
    }

    async parseFromUrl(url, callbacks = {}) {
        const { onProgress, onBatch, signal } = callbacks;

        const fetchWithTimeout = async (resource, options = {}) => {
            const { timeout = 300000 } = options;
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), timeout);

            if (signal) {
                signal.addEventListener('abort', () => controller.abort());
            }

            try {
                const response = await fetch(resource, {
                    ...options,
                    signal: controller.signal
                });
                clearTimeout(id);
                return response;
            } catch (e) {
                clearTimeout(id);
                throw e;
            }
        };

        try {
            // Try direct fetch
            let response = await fetchWithTimeout(url);
            if (!response.ok) throw new Error('Network response was not ok');

            if (response.body) {
                return this.parseStream(response.body.getReader(), onProgress, onBatch, signal);
            } else {
                return this.parseText(await response.text(), onProgress, onBatch);
            }

        } catch (error) {
            if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');

            console.warn('Direct fetch failed, trying proxy...', error);
            try {
                const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
                const proxyResponse = await fetchWithTimeout(proxyUrl);
                if (!proxyResponse.ok) throw new Error('Proxy response was not ok');

                if (proxyResponse.body) {
                    return this.parseStream(proxyResponse.body.getReader(), onProgress, onBatch, signal);
                }
                return this.parseText(await proxyResponse.text(), onProgress, onBatch);
            } catch (proxyError) {
                if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
                console.error('Final fetch error:', proxyError);
                throw proxyError;
            }
        }
    }

    async parseStream(reader, onProgress, onBatch, signal) {
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        const stats = {
            channels: 0,
            movies: 0,
            series: 0
        };

        // State machine
        let currentItem = {};

        // Batch accumulator
        let currentBatch = [];
        const BATCH_SIZE = 2000;

        let lastUpdate = 0;

        while (true) {
            if (signal && signal.aborted) {
                reader.cancel();
                throw new DOMException('Aborted', 'AbortError');
            }

            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep incomplete line

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                this.processLine(line, currentItem, currentBatch, stats);
                if (currentItem.url) {
                    currentItem = {}; // Reset

                    // Flush Batch if full
                    if (currentBatch.length >= BATCH_SIZE) {
                        if (onBatch) await onBatch([...currentBatch]);
                        currentBatch = [];
                    }
                }
            }

            // Update UI
            const now = Date.now();
            if (onProgress && now - lastUpdate > 100) {
                onProgress(stats);
                lastUpdate = now;
            }
        }

        // Process remaining buffer
        if (buffer.trim()) {
            this.processLine(buffer.trim(), currentItem, currentBatch, stats);
            if (currentItem.url && currentBatch.length > 0) {
                // Final item processed
            }
        }

        // Final Flush
        if (currentBatch.length > 0) {
            if (onBatch) await onBatch([...currentBatch]);
        }

        if (onProgress) onProgress(stats);

        // Return only stats, not data
        return stats;
    }

    parseText(text, onProgress, onBatch) {
        const stats = { channels: 0, movies: 0, series: 0 };
        let currentItem = {};
        let currentBatch = [];
        const BATCH_SIZE = 2000;

        const lines = text.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            this.processLine(trimmed, currentItem, currentBatch, stats);

            if (currentItem.url) {
                currentItem = {};
                if (currentBatch.length >= BATCH_SIZE) {
                    if (onBatch) onBatch([...currentBatch]);
                    currentBatch = [];
                }
            }
        }

        if (currentBatch.length > 0 && onBatch) {
            onBatch([...currentBatch]);
        }

        if (onProgress) onProgress(stats);
        return stats;
    }

    processLine(line, currentItem, batchList, stats) {
        if (line.startsWith('#EXTINF:')) {
            // Parse Metadata
            Object.assign(currentItem, this.extractMetadata(line));
        } else if (line.startsWith('#')) {
            // Ignore other directives
        } else {
            // It's a URL
            if (currentItem.title) {
                currentItem.url = line;
                const cat = this.categorizeItem(currentItem, batchList);
                if (stats[cat] !== undefined) stats[cat]++;
            }
        }
    }

    // ... extractMetadata remains same ...
    extractMetadata(line) {
        const info = {};

        // 1. Title is usually after the last comma
        const lastCommaIndex = line.lastIndexOf(',');
        info.title = line.substring(lastCommaIndex + 1).trim();

        // 2. Attributes (key="value")
        const attributePattern = /([a-zA-Z0-9\-]+)="([^"]*)"/g;
        let match;

        while ((match = attributePattern.exec(line)) !== null) {
            const key = match[1].toLowerCase();
            const value = match[2];

            if (key === 'tvg-logo') info.logo = value;
            else if (key === 'group-title') info.group = value;
            else if (key === 'tvg-id') info.id = value;
        }

        if (!info.group) info.group = "Uncategorized";

        return info;
    }

    categorizeItem(item, batchList) { // turbo
        const url = (item.url || '').toLowerCase();
        let mainCategory = 'channels';

        if (url.includes('/movie/') || url.includes('/movies/')) {
            mainCategory = 'movies';
        } else if (url.includes('/series/')) {
            mainCategory = 'series';
        }

        item.category = mainCategory;
        batchList.push(item);

        return mainCategory;
    }
}
