/**
 * Live TV View
 * Handles Live TV and Catchup view rendering and interactions.
 */

function renderNestedLayout(viewId, dataGroups) {
    const container = document.getElementById(`${viewId}-rows`);
    container.innerHTML = '';

    const groups = Object.keys(dataGroups).sort();

    if (groups.length === 0) {
        container.innerHTML = `<div style="padding:40px; text-align:center; color:#666;">No content available. Go to Resources to add playlists.</div>`;
        return;
    }

    // Determine if this view needs an items sidebar (Live TV / Catchup have channels list)
    const showItemsSidebar = (viewId === 'live' || viewId === 'catchup');

    // Use ViewLayoutFactory to create the nested layout structure
    const layout = ViewLayoutFactory.createNestedViewLayout({
        viewId: viewId,
        showItemsSidebar: showItemsSidebar
    });

    // Get references from layout
    const { categoriesList, itemsSidebar, contentArea } = layout;

    // Populate Categories
    groups.forEach(group => {
        const count = dataGroups[group].length;
        const bucketType = (viewId === 'live' || viewId === 'catchup') ? 'channels' : viewId;
        const isFav = favoritesManager.isBucketFavorite(group, bucketType);

        const btn = document.createElement('div');
        btn.className = `nested-list-item focusable ${isFav ? 'favorite-group' : ''}`;
        btn.tabIndex = 0;
        btn.dataset.category = group;
        btn.innerHTML = `
            <div style="display:flex; align-items:center;">
                <span class="favorite-icon-container" style="display:flex; align-items:center; ${isFav ? 'margin-right:8px;' : ''}">
                    ${isFav ? '<i data-lucide="star" style="width:24px; height:24px; color:#ffb020; fill:currentColor;"></i>' : ''}
                </span>
                <span class="category-name">${group}</span>
            </div>
            <span class="count-badge">${count}</span>
        `;

        btn.addEventListener('click', (e) => {
            categoriesList.querySelectorAll('.nested-list-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            handleNestedCategoryClick(viewId, group, dataGroups[group], itemsSidebar, contentArea);
        });

        btn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') btn.click();
        });

        btn.addEventListener('focus', () => {
            state.focusedItem = { item: { name: group, type: bucketType }, type: 'bucket', card: btn };
        });

        categoriesList.appendChild(btn);
    });

    container.appendChild(layout.container);

    lucide.createIcons({ root: container });
}

function handleNestedCategoryClick(viewId, groupName, items, itemsSidebar, contentArea) {
    if (viewId === 'live' || viewId === 'catchup') {
        itemsSidebar.classList.add('visible');
        const listContainer = itemsSidebar.querySelector('.nested-list');
        listContainer.scrollTop = 0;
        listContainer.innerHTML = '';

        const rawSearchQuery = state.categorySearchQuery[viewId] || '';
        const searchQuery = rawSearchQuery.length >= 2 ? rawSearchQuery : '';
        let filteredItems = items;
        if (searchQuery) {
            filteredItems = items.filter(item => matchSearchQuery(item.title, searchQuery));
        }

        const totalMatching = filteredItems.length;
        if (searchQuery && totalMatching > MAX_SEARCH_RESULTS) {
            filteredItems = filteredItems.slice(0, MAX_SEARCH_RESULTS);
        }

        const channelHeader = itemsSidebar.querySelector('.nested-header');
        if (channelHeader) {
            if (searchQuery && totalMatching < items.length) {
                const isCapped = totalMatching > MAX_SEARCH_RESULTS;
                const limitText = isCapped ? ` (Capped at ${MAX_SEARCH_RESULTS})` : '';
                channelHeader.textContent = `Channels (${isCapped ? MAX_SEARCH_RESULTS : totalMatching}/${items.length})${limitText}`;
            } else {
                channelHeader.textContent = 'Channels';
            }
        }

        const existingPlayer = contentArea.querySelector('#nested-player-container');
        if (!existingPlayer) {
            contentArea.innerHTML = PlayerContainer.createLive({ showCatchupList: viewId === 'catchup' });
            PlayerContainer.initIcons(contentArea);
        }

        const favType = (viewId === 'live' || viewId === 'catchup') ? 'channels' : viewId;

        filteredItems.forEach(item => {
            const btn = ChannelListItem.create(item, {
                favoriteType: favType,
                onClick: (channelItem, element) => {
                    listContainer.querySelectorAll('.nested-list-item').forEach(b => b.classList.remove('active'));
                    element.classList.add('active');

                    updatePlayerInfo(channelItem);
                    const playerContainer = contentArea.querySelector('#nested-player-container');
                    if (playerContainer) {
                        VideoPlayer.play(channelItem, 'live', playerContainer);

                        if (viewId === 'catchup') {
                            loadCatchupEpg(channelItem, contentArea);
                        }
                    } else {
                        console.error("Player container not found!");
                    }
                }
            });
            listContainer.appendChild(btn);
        });

    } else {
        // Movies/Series: Show Grid in Content Area
        contentArea.scrollTop = 0;
        contentArea.innerHTML = '';

        const rawSearchQuery = state.categorySearchQuery[viewId] || '';
        const searchQuery = rawSearchQuery.length >= 2 ? rawSearchQuery : '';
        let filteredItems = items;
        if (searchQuery) {
            filteredItems = items.filter(item => matchSearchQuery(item.title, searchQuery));
        }

        // Sort by release date (newest first)
        if (viewId === 'series' || viewId === 'movies') {
            filteredItems.sort((a, b) => {
                const parseDate = (val) => {
                    if (!val) return 0;
                    if (!isNaN(val) && val.toString().length >= 10) {
                        return parseInt(val) * 1000;
                    }
                    const d = new Date(val).getTime();
                    return isNaN(d) ? 0 : d;
                };
                const dateA = parseDate(a.releaseDate);
                const dateB = parseDate(b.releaseDate);
                return dateB - dateA;
            });
        }

        const totalMatches = filteredItems.length;
        if (searchQuery && totalMatches > MAX_SEARCH_RESULTS) {
            filteredItems = filteredItems.slice(0, MAX_SEARCH_RESULTS);
        }

        const grid = document.createElement('div');
        grid.className = 'favorites-grid nested-media-grid';
        grid.style.padding = '40px';

        if (searchQuery && totalMatches > MAX_SEARCH_RESULTS) {
            const cappedNotice = document.createElement('div');
            cappedNotice.style.gridColumn = '1 / -1';
            cappedNotice.style.padding = '10px 20px';
            cappedNotice.style.marginBottom = '20px';
            cappedNotice.style.background = 'rgba(59, 130, 246, 0.1)';
            cappedNotice.style.border = '1px solid rgba(59, 130, 246, 0.3)';
            cappedNotice.style.borderRadius = '8px';
            cappedNotice.style.color = '#3b82f6';
            cappedNotice.style.fontSize = '14px';
            cappedNotice.innerHTML = `<i data-lucide="info" style="width:16px; height:16px; vertical-align:middle; margin-right:8px;"></i> showing first ${MAX_SEARCH_RESULTS} results for better performance`;
            grid.appendChild(cappedNotice);
        }

        const renderItems = (itemList) => {
            let firstNewCard = null;
            itemList.forEach((item, index) => {
                const card = MediaCard.create(item, viewId);
                grid.appendChild(card);
                if (index === 0) firstNewCard = card;
            });
            if (window.lucide) {
                lucide.createIcons({ root: grid });
            }
            return firstNewCard;
        };

        renderItems(filteredItems.slice(0, DISPLAY_LIMIT));

        if (filteredItems.length > DISPLAY_LIMIT) {
            const moreBtn = document.createElement('div');
            moreBtn.className = 'card focusable';
            moreBtn.style.minHeight = '150px';
            moreBtn.style.display = 'flex';
            moreBtn.style.alignItems = 'center';
            moreBtn.style.justifyContent = 'center';
            moreBtn.innerHTML = `<span>+${filteredItems.length - DISPLAY_LIMIT} More</span>`;
            moreBtn.tabIndex = 0;
            moreBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                moreBtn.remove();
                const firstCard = renderItems(filteredItems.slice(DISPLAY_LIMIT));
                if (firstCard && typeof nav !== 'undefined') {
                    setTimeout(() => {
                        nav.setFocus(firstCard);
                    }, 10);
                }
            });
            grid.appendChild(moreBtn);
        }

        contentArea.appendChild(grid);
    }
}

async function loadCatchupEpg(item, contentArea) {
    const listDiv = contentArea.querySelector('#catchup-list');
    if (!listDiv) return;

    listDiv.innerHTML = '<div class="spinner"></div>';

    const resource = state.resources.find(r => r.name === item.source);
    if (!resource || !resource.credentials) {
        listDiv.innerHTML = '<div style="padding:10px;">Error: No credentials found for this stream.</div>';
        return;
    }

    const { host, username, password } = resource.credentials;
    const client = new XtreamClient(host, username, password);

    const channelId = item.id;
    const channelTitle = item.title;

    try {
        const epgData = await client.getEpg(channelId);
        const listings = epgData.epg_listings || [];

        if (listings.length === 0) {
            listDiv.innerHTML = '<div style="padding:10px;">No catchup programs available.</div>';
            return;
        }

        listDiv.innerHTML = '';

        const now = Date.now() / 1000;

        listings.sort((a, b) => {
            const tA = parseInt(a.start_timestamp) || 0;
            const tB = parseInt(b.start_timestamp) || 0;
            return tB - tA;
        });

        listings.forEach(prog => {
            const hasArchive = prog.has_archive || 1;
            if (!hasArchive) return;

            let startTs = parseInt(prog.start_timestamp);
            let endTs = parseInt(prog.stop_timestamp);

            if (isNaN(startTs)) return;
            if (isNaN(endTs)) return;

            if (startTs > now || endTs > (now - 60)) return;

            const date = new Date(startTs * 1000);
            const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const dateStr = date.toLocaleDateString();

            const progEl = document.createElement('div');
            progEl.className = 'catchup-program-item focusable';
            progEl.tabIndex = 0;
            progEl.innerHTML = `
                <div class="catchup-time">
                    <span class="c-time">${timeStr}</span>
                    <span class="c-date">${dateStr}</span>
                </div>
                <div class="catchup-details">
                    <div class="c-title">${prog.title}</div>
                    <div class="c-desc"></div> 
                </div> 
                <div class="catchup-play-icon"><i data-lucide="play-circle"></i></div>
            `;

            let desc = prog.description || '';
            try {
                if (desc && /^[A-Za-z0-9+/=]+$/.test(desc.trim())) {
                    desc = atob(desc);
                }
                try { desc = decodeURIComponent(escape(desc)); } catch (e) { }
            } catch (e) { }
            progEl.querySelector('.c-desc').textContent = desc;

            let title = prog.title || '';
            try {
                if (title && /^[A-Za-z0-9+/=]+$/.test(title.trim())) {
                    title = atob(title.trim());
                }
                try { title = decodeURIComponent(escape(title)); } catch (e) { }
            } catch (e) { }
            progEl.querySelector('.c-title').textContent = title;

            progEl.addEventListener('click', async () => {
                const durationSeconds = endTs - startTs;
                const durationMinutes = Math.floor(durationSeconds / 60);

                const y = date.getFullYear();
                const m = String(date.getMonth() + 1).padStart(2, '0');
                const d = String(date.getDate()).padStart(2, '0');
                const H = String(date.getHours()).padStart(2, '0');
                const M = String(date.getMinutes()).padStart(2, '0');
                const startFormatted = `${y}-${m}-${d}:${H}-${M}`;

                const url = `${host}/timeshift/${username}/${password}/${durationMinutes}/${startFormatted}/${channelId}.m3u8`;

                const playerContainer = contentArea.querySelector('#nested-player-container');
                VideoPlayer.play({
                    url: url,
                    title: `[Catch Up] ${prog.title}`
                }, 'live', playerContainer);
            });

            progEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') progEl.click();
            });

            listDiv.appendChild(progEl);
        });

        lucide.createIcons({ root: listDiv });

    } catch (e) {
        console.error("EPG Error", e);
        listDiv.innerHTML = '<div style="padding:10px;">Error loading programs.</div>';
    }
}
