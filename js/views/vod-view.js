/**
 * VOD View
 * Handles Movies and Series detail views and playback.
 */

async function handleNestedMediaClick(item, type, cardElement, options = {}) {
    const { startTime = 0, season = null, episode = null, parentContainer = null, onBack = null } = options;

    let contentArea;
    if (parentContainer) {
        contentArea = parentContainer;
    } else {
        contentArea = cardElement ? cardElement.closest('.nested-content-area') : null;
    }

    if (!contentArea) {
        console.error("Content area not found");
        return;
    }
    const existingGrid = contentArea.querySelector('.nested-media-grid');

    let panel = contentArea.querySelector('.movie-detail-panel');

    // Resource Lookup
    const resource = state.resources.find(r => r.name === item.source);
    let extraInfo = {};
    let episodes = {};

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

    if (parentContainer) {
        Array.from(parentContainer.children).forEach(c => {
            if (c !== panel) c.style.display = 'none';
        });
    }

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

    const favoriteType = type;
    const isSeries = type === 'series';
    const colClass = isSeries ? 'detail-column series-mode' : 'detail-column';
    const rowClass = isSeries ? 'detail-content-row series-mode-row' : 'detail-content-row';

    panel.innerHTML = `
        <div class="split-detail-view">
             <div class="${rowClass}">
                 <div class="${colClass}">
                     <button class="back-to-grid-btn focusable"><i data-lucide="arrow-left"></i> Back to List</button>
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
                         <button id="detail-fav-btn" class="btn btn-glass focusable"><i data-lucide="star"></i> Favorite</button>
                     </div>
                 </div>
                 
                 ${isSeries ? `
                 <div class="main-player-section">
                     <div class="player-column">
                        <div id="nested-player-container">
                             <div class="tv-static"></div>
                             <img src="assets/ok_logo.svg" alt="" class="player-logo-watermark">
                             <div class="placeholder-icon">
                                 <i data-lucide="play-circle" style="width:50px; height:50px; opacity:0.5; margin-bottom:10px;"></i>
                                 <div style="color: rgba(255,255,255,0.4);">Select an episode to play</div>
                             </div>
                        </div>
                        <div id="track-info-container" class="track-info-panel" style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 8px; font-size: 13px; color: #ccc; display: none;"></div>
                     </div>
                     <div class="episodes-section">
                         <div id="season-tabs" class="season-tabs"></div>
                         <div id="episodes-list" class="episodes-list-vertical"></div>
                     </div>
                 </div>
                 ` : `
                 <div class="player-column">
                    <div id="nested-player-container">
                         <div class="tv-static"></div>
                         <img src="assets/ok_logo.svg" alt="" class="player-logo-watermark">
                         <div class="placeholder-icon">
                             <i data-lucide="play-circle" style="width:50px; height:50px; opacity:0.5; margin-bottom:10px;"></i>
                             <div style="color: rgba(255,255,255,0.4);">Click 'Play Now' to start</div>
                         </div>
                    </div>
                    <div id="track-info-container" class="track-info-panel" style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 8px; font-size: 13px; color: #ccc; display: none;"></div>
                 </div>
                 `}
             </div>
        </div>
    `;
    lucide.createIcons({ root: panel });

    panel.querySelector('.back-to-grid-btn').addEventListener('click', () => {
        panel.remove();

        if (onBack) {
            onBack();
        } else if (existingGrid) {
            existingGrid.style.display = '';
        }

        if (cardElement && typeof nav !== 'undefined') {
            setTimeout(() => {
                nav.setFocus(cardElement);
            }, 50);
        }
    });

    // Favorite Button Handler
    const favBtn = panel.querySelector('.detail-actions .btn-glass');
    if (favBtn) {
        const isFav = favoritesManager.isItemFavorite(item, favoriteType);
        if (isFav) {
            favBtn.classList.add('active');
            favBtn.innerHTML = '<i data-lucide="star" style="fill: currentColor;"></i> Favorited';
        }

        favBtn.addEventListener('click', () => {
            toggleFavorite(item, favoriteType, favBtn);
            const nowFav = favoritesManager.isItemFavorite(item, favoriteType);
            favBtn.innerHTML = nowFav
                ? '<i data-lucide="star" style="fill: currentColor;"></i> Favorited'
                : '<i data-lucide="star"></i> Favorite';
            lucide.createIcons({ root: favBtn });
        });
    }

    // Player Init Function
    const playContent = (streamUrl, epTitle, metadata = {}, epContainerId = '#nested-player-container', startPos = 0) => {
        const container = panel.querySelector(epContainerId);

        container.innerHTML = '';
        const playItem = {
            url: streamUrl,
            title: `${item.title}${epTitle && epTitle !== item.title ? ' - ' + epTitle : ''}`,
            logo: posterUrl || item.logo,
            ...metadata
        };
        const infoContainer = panel.querySelector('#track-info-container');
        if (window.VideoPlayer) {
            VideoPlayer.play(playItem, type, container, infoContainer, startPos);
        } else {
            console.error("VideoPlayer not loaded");
        }
    };

    if (isSeries) {
        const seasonTabsContainer = panel.querySelector('#season-tabs');
        const episodesList = panel.querySelector('#episodes-list');
        const seasons = Object.keys(episodes).sort((a, b) => parseInt(a) - parseInt(b));

        const renderEpisodes = (seasonNum) => {
            episodesList.innerHTML = '';
            const seasonEps = episodes[seasonNum] || [];

            seasonEps.forEach((ep) => {
                const epItem = document.createElement('div');
                epItem.className = 'episode-card-vertical focusable';
                epItem.tabIndex = 0;
                epItem.innerHTML = `
                    <div class="episode-info-main">
                        <div class="ep-number-title">
                            <span class="ep-num-badge">E${ep.episode_num}</span>
                            <span class="ep-title-text">${ep.title}</span>
                        </div>
                        ${ep.info?.plot ? `<div class="ep-plot-preview">${ep.info.plot}</div>` : ''}
                    </div>
                `;

                epItem.addEventListener('click', () => {
                    episodesList.querySelectorAll('.episode-card-vertical').forEach(e => e.classList.remove('active'));
                    epItem.classList.add('active');

                    const epUrl = `${resource.credentials.host}/series/${resource.credentials.username}/${resource.credentials.password}/${ep.id}.${ep.container_extension || 'mp4'}`;

                    let epStartPos = 0;
                    try {
                        const progressRaw = localStorage.getItem('watchnow_watch_progress');
                        if (progressRaw) {
                            const progress = JSON.parse(progressRaw);
                            if (progress[epUrl]) {
                                epStartPos = progress[epUrl].time || 0;
                            }
                        }
                    } catch (e) { }

                    playContent(epUrl, ep.title, {
                        type: 'series',
                        item: {
                            seriesId: item.id,
                            seriesTitle: item.title,
                            episodeId: ep.id,
                            source: item.source
                        },
                        season: seasonNum,
                        episode: ep.episode_num
                    }, '#nested-player-container', epStartPos);
                });

                epItem.addEventListener('keydown', e => { if (e.key === 'Enter') epItem.click(); });
                episodesList.appendChild(epItem);
            });

            if (window.lucide) lucide.createIcons({ root: episodesList });

            // Auto-play specific or first episode
            if (episode) {
                const matchEpItem = episodesList.querySelectorAll('.episode-card-vertical')[parseInt(episode) - 1];
                if (matchEpItem) {
                    setTimeout(() => {
                        matchEpItem.click();
                        matchEpItem.focus();
                    }, 100);
                }
            } else if (seasonEps.length > 0) {
                const firstEp = episodesList.querySelector('.episode-card-vertical');
                if (firstEp && startTime > 0) {
                    setTimeout(() => firstEp.click(), 100);
                }
            }
        };

        seasons.forEach((seasonNum, index) => {
            const tab = document.createElement('button');
            tab.className = 'season-tab focusable';
            tab.textContent = `S${seasonNum}`;
            tab.tabIndex = 0;
            tab.addEventListener('click', () => {
                seasonTabsContainer.querySelectorAll('.season-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                renderEpisodes(seasonNum);
            });
            seasonTabsContainer.appendChild(tab);

            let isTargetSeason = (season && seasonNum === season.toString());
            if ((!season && index === 0) || isTargetSeason) {
                tab.classList.add('active');
                renderEpisodes(seasonNum);
            }
        });
    } else {
        // Movie Play Button
        const playBtn = panel.querySelector('.play-now-btn');
        if (playBtn) {
            const movieStreamUrl = `${resource?.credentials?.host || ''}/movie/${resource?.credentials?.username || ''}/${resource?.credentials?.password || ''}/${item.id}.${ext || 'mp4'}`;
            const startPos = startTime || 0;

            playBtn.addEventListener('click', () => {
                playContent(movieStreamUrl, '', {
                    type: 'movies',
                    item: {
                        movieId: item.id,
                        source: item.source
                    }
                }, '#nested-player-container', startPos);
            });

            if (startPos > 0) {
                setTimeout(() => playBtn.click(), 200);
            }
        }
    }

    // Set initial focus
    const setInitialFocus = () => {
        const primaryBtn = panel.querySelector('.play-now-btn') || panel.querySelector('.btn-primary');
        const backBtn = panel.querySelector('.back-to-grid-btn');
        const targetFocus = primaryBtn || backBtn;

        if (targetFocus && typeof nav !== 'undefined') {
            nav.setFocus(targetFocus);
        }
    };

    setTimeout(setInitialFocus, 250);
    setTimeout(setInitialFocus, 500);
}
