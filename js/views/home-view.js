/**
 * Home View
 * Handles home view rendering including Continue Watching, Favorites carousels,
 * and favorite channels/buckets player views.
 */


function renderHomeView() {
    // Check if any detail panel is currently open
    const homeContent = document.getElementById('home-content');
    const isDetailOpen = homeContent && homeContent.querySelector('.vod-detail-panel, #home-favorites-panel, #home-bucket-panel');

    // Manage Welcome Section Visibility
    const welcomeSection = document.getElementById('welcome-section');
    if (welcomeSection) {
        if (isDetailOpen) {
            welcomeSection.style.display = 'none';
        } else {
            // Restore visibility if it was hidden
            if (welcomeSection.style.display === 'none') {
                welcomeSection.style.display = '';
            }
        }
    }

    // Sync state favorites first
    if (typeof favoritesManager !== 'undefined') {
        state.favorites = favoritesManager.getAll();
    }

    const container = document.getElementById('continue-watching-carousel');
    const section = document.getElementById('continue-watching-section');
    if (!container || !section) return;

    // Load progress
    let progressData = {};
    try {
        const stored = localStorage.getItem('watchnow_watch_progress');
        if (stored) progressData = JSON.parse(stored);
    } catch (e) { console.error("Error loading progress", e); }

    // Filter and Sort
    const now = Date.now();
    const items = Object.values(progressData)
        .filter(item => {
            if (!item.duration || !item.time) return false;
            const remaining = item.duration - item.time;
            const watched = item.time;
            if (remaining < 300) return false;
            if (watched < 120) return false;
            return true;
        })
        .sort((a, b) => (b.lastWatched || 0) - (a.lastWatched || 0));

    if (items.length === 0) {
        section.style.display = 'none';
        container.innerHTML = '';
    } else {
        // Only show if no detail panel is open
        if (!isDetailOpen) {
            section.style.display = 'block';
        }

        container.innerHTML = '';

        container.style.display = 'flex';
        container.style.overflowX = 'auto';
        container.style.flexWrap = 'nowrap';
        container.style.gap = '24px';
        container.style.paddingBottom = '30px';

        items.forEach(prog => {
            const item = prog.item || {
                title: prog.title || 'Unknown',
                url: prog.url,
                logo: prog.logo
            };

            const type = prog.type || 'movies';
            const percent = Math.min(100, Math.max(0, (prog.time / prog.duration) * 100));

            // Build clickItem for handleNestedMediaClick
            // The progress data structure has: prog.item = playItem which contains item = { seriesId, seriesTitle, source }
            const clickItem = { ...item };

            // For series: extract seriesId from the nested item object (prog.item.item)
            // This is because playContent() stores metadata like: { type, item: { seriesId, seriesTitle, source } }
            const nestedItem = prog.item && prog.item.item;

            if (prog.type === 'series' && nestedItem && nestedItem.seriesId) {
                clickItem.id = nestedItem.seriesId;
                clickItem.title = nestedItem.seriesTitle || clickItem.title;
                clickItem.source = nestedItem.source;
            } else if (prog.type === 'movies') {
                // For movies: extract movieId from nested item
                if (nestedItem && nestedItem.movieId) clickItem.id = nestedItem.movieId;
                if (nestedItem && nestedItem.source) clickItem.source = nestedItem.source;
            }

            const wrapper = MediaCard.create(item, type, {
                showProgress: true,
                progressPercent: percent,
                progressTime: prog.time,
                progressDuration: prog.duration,
                continueWatchingMeta: {
                    season: prog.season,
                    episode: prog.episode
                },
                onClick: (item, type, card, meta) => {
                    const homeContent = document.getElementById('home-content');
                    // Store the clicked item's URL for focus restoration
                    const cardUrl = item.url || clickItem.url;
                    // For series: open in series mode (no auto-play), just pre-select season
                    // For movies: resume from last position
                    const isSeries = type === 'series';
                    handleNestedMediaClick(clickItem, type, card, {
                        season: isSeries ? prog.season : null,
                        episode: null, // Don't auto-play episode, let user choose
                        startTime: isSeries ? 0 : prog.time, // Only resume for movies
                        parentContainer: homeContent,
                        onBack: () => restoreHomeView(homeContent, 'continue-watching-carousel', cardUrl),
                        panelId: 'direct-home'
                    });
                }
            });

            container.appendChild(wrapper);
        });

        if (window.lucide) lucide.createIcons({ root: container });
    }

    const showOptions = { shouldShow: !isDetailOpen };

    // Render other carousels
    renderCarousel('home-fav-channels-section', 'home-fav-channels-carousel', state.favorites.channels || [], 'live', showOptions);
    renderCarousel('home-fav-buckets-section', 'home-fav-buckets-carousel', state.favorites.buckets || [], 'bucket', showOptions);
    renderCarousel('home-fav-movies-section', 'home-fav-movies-carousel', state.favorites.movies || [], 'movies', showOptions);
    renderCarousel('home-fav-series-section', 'home-fav-series-carousel', state.favorites.series || [], 'series', showOptions);
}

function renderCarousel(sectionId, containerId, items, type, options = {}) {
    const section = document.getElementById(sectionId);
    const container = document.getElementById(containerId);

    if (!section || !container) return;

    if (items.length > 0) {
        if (options.shouldShow !== false) {
            section.style.display = 'block';
        }

        container.innerHTML = '';

        container.style.display = 'flex';
        container.style.overflowX = 'auto';
        container.style.flexWrap = 'nowrap';
        container.style.gap = '24px';
        container.style.paddingBottom = '30px';

        items.forEach(item => {
            let card;
            const cardOptions = { ...options };

            if (type === 'bucket') {
                cardOptions.isBucketCard = true;
                cardOptions.onClick = () => openFavoriteBucketView(item);
                card = MediaCard.create(item, item.type, cardOptions);
            } else {
                card = MediaCard.create(item, type, cardOptions);

                if (type === 'live') {
                    card.style.flex = '0 0 auto';
                    card.style.width = '240px';
                    card.style.height = '160px';
                } else if (type === 'movies' || type === 'series') {
                    card.style.flex = '0 0 auto';
                    card.style.width = '240px';
                    card.style.height = '330px';
                }

                if (type === 'movies' || type === 'series') {
                    if (!cardOptions.onClick) {
                        const originalCard = card;
                        card = originalCard.cloneNode(true);

                        const favBtn = card.querySelector('.favorite-btn');
                        if (favBtn) {
                            favBtn.addEventListener('click', (e) => {
                                e.stopPropagation();
                                toggleFavorite(item, type, favBtn);
                            });
                        }

                        card.addEventListener('click', () => {
                            const homeContent = document.getElementById('home-content');
                            const cardUrl = item.url; // Store URL for focus restoration
                            handleNestedMediaClick(item, type, card, {
                                parentContainer: homeContent,
                                onBack: () => restoreHomeView(homeContent, containerId, cardUrl),
                                panelId: 'direct-home'
                            });
                        });

                        card.addEventListener('focus', () => {
                            state.focusedItem = { item, type, card };
                        });
                    }
                } else if (type === 'live') {
                    card.addEventListener('click', () => openFavoriteChannelsPlayer(item));
                }
            }

            container.appendChild(card);
        });
        if (window.lucide) lucide.createIcons({ root: container });
    } else {
        section.style.display = 'none';
    }
}

function restoreHomeView(homeContent, focusContainerId = 'continue-watching-carousel', cardUrl = null) {
    if (homeContent) {
        const existingPanel = homeContent.querySelector('.vod-detail-panel');
        renderHomeView();
        const newContainer = document.getElementById(focusContainerId);
        if (newContainer && typeof nav !== 'undefined') {
            let targetCard = null;

            // If cardUrl is provided, find the specific card with that URL
            if (cardUrl) {
                // For continue watching, we need to find the focusable card within wrappers
                const allCards = newContainer.querySelectorAll('.card[data-url], .card.focusable');
                for (const card of allCards) {
                    const dataUrl = card.dataset.url;
                    if (dataUrl === cardUrl) {
                        targetCard = card;
                        break;
                    }
                }
            }

            // Fallback to first focusable element
            if (!targetCard) {
                targetCard = newContainer.querySelector('.card.focusable, .focusable');
            }

            if (targetCard) {
                nav.setFocus(targetCard);
            }
        }
    }
}

function openFavoriteChannelsPlayer(startChannel) {
    const homeContent = document.getElementById('home-content');
    if (!homeContent) return;

    const favChannels = state.favorites.channels || [];
    if (favChannels.length === 0) {
        showToast('info', 'No favorite channels', 'info');
        return;
    }

    homeContent.style.overflow = 'hidden';

    // Use ViewLayoutFactory helper to hide sections
    const hiddenState = ViewLayoutFactory.hideSections(ViewLayoutFactory.HOME_SECTION_IDS);

    // Get or create panel
    let panel = document.getElementById('home-favorites-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'home-favorites-panel';
        homeContent.appendChild(panel);
    }

    // Use ViewLayoutFactory to create the layout
    const layout = ViewLayoutFactory.createSidebarWithPlayer({
        sidebarId: 'home-fav-items-panel',
        contentId: 'home-fav-content-area',
        headerTitle: 'Favorite Channels',
        closeBtnId: 'close-home-fav-panel',
        showCatchupList: false,
        placeholderText: 'Select a channel to play'
    });

    panel.innerHTML = '';
    panel.appendChild(layout.container);

    // Populate channel list
    favChannels.forEach((item, index) => {
        const btn = ChannelListItem.create(item, {
            favoriteType: 'channels',
            onClick: (channelItem, element) => {
                layout.listContainer.querySelectorAll('.nested-list-item').forEach(b => b.classList.remove('active'));
                element.classList.add('active');
                updatePlayerInfo(channelItem);
                const playerContainer = layout.contentArea.querySelector('#nested-player-container');
                if (playerContainer) VideoPlayer.play(channelItem, 'live', playerContainer);
            }
        });

        if (startChannel && item.url === startChannel.url) {
            setTimeout(() => {
                if (btn.scrollIntoView) btn.scrollIntoView({ block: 'center' });
                btn.click();
                btn.focus();
                if (typeof nav !== 'undefined') nav.setFocus(btn);
            }, 100);
        } else if (index === 0 && !startChannel) {
            setTimeout(() => {
                btn.click();
                btn.focus();
                if (typeof nav !== 'undefined') nav.setFocus(btn);
            }, 100);
        }

        layout.listContainer.appendChild(btn);
    });

    // Bind close button
    if (layout.closeBtn) {
        layout.closeBtn.addEventListener('click', () => {
            closeHomeFavorites(panel, hiddenState);
        });
    }
}

function closeHomeFavorites(panel, hiddenState) {
    if (!panel) return;

    const homeContent = document.getElementById('home-content');
    if (homeContent) homeContent.style.overflow = '';

    const playerContainer = panel.querySelector('#nested-player-container');
    if (playerContainer) {
        VideoPlayer.dispose();
    }

    panel.remove();

    // Use ViewLayoutFactory helper to restore sections
    ViewLayoutFactory.restoreSections(hiddenState);

    setTimeout(() => {
        const firstCard = document.querySelector('#home-fav-channels-carousel .card');
        if (firstCard && typeof nav !== 'undefined') {
            nav.setFocus(firstCard);
        }
    }, 50);
}

function openFavoriteBucketView(bucket) {
    const homeContent = document.getElementById('home-content');
    if (!homeContent) return;

    const bucketType = bucket.type;
    const bucketName = bucket.name;

    let dataKey = bucketType;
    if (bucketType === 'channels') dataKey = 'channels';

    const allData = state.aggregatedData[dataKey];
    if (!allData || !allData[bucketName]) {
        showToast('info', 'Bucket is empty or not found', 'info');
        return;
    }

    const items = allData[bucketName];

    homeContent.style.overflow = 'hidden';

    // Use ViewLayoutFactory helper to hide sections
    const hiddenState = ViewLayoutFactory.hideSections(ViewLayoutFactory.HOME_SECTION_IDS);

    // Get or create panel
    let panel = document.getElementById('home-bucket-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'home-bucket-panel';
        homeContent.appendChild(panel);
    }

    panel.innerHTML = '';

    let layout;
    let closeBtn;

    // Determine Container ID
    let containerId = 'bucket-nested-container';
    if (bucketType === 'channels' || bucketType === 'live') containerId = 'live-bucket';
    else if (bucketType === 'movies') containerId = 'movies-bucket';
    else if (bucketType === 'series') containerId = 'series-bucket';
    else if (bucketType === 'catchup') containerId = 'catch-up-bucket';

    if (bucketType === 'channels') {
        // Use sidebar + player layout for channels
        layout = ViewLayoutFactory.createSidebarWithPlayer({
            sidebarId: 'bucket-items-panel',
            contentId: 'bucket-content-area',
            headerTitle: bucketName,
            closeBtnId: 'close-bucket-btn',
            showCatchupList: false,
            placeholderText: 'Select a channel to play',
            containerId: containerId
        });

        panel.appendChild(layout.container);
        closeBtn = layout.closeBtn;

        // Populate channel list
        items.forEach((item, index) => {
            const btn = ChannelListItem.create(item, {
                favoriteType: 'channels',
                onClick: (channelItem, element) => {
                    layout.listContainer.querySelectorAll('.nested-list-item').forEach(b => b.classList.remove('active'));
                    element.classList.add('active');
                    updatePlayerInfo(channelItem);
                    const playerContainer = layout.contentArea.querySelector('#nested-player-container');
                    if (playerContainer) VideoPlayer.play(channelItem, 'live', playerContainer);
                }
            });

            if (index === 0) {
                setTimeout(() => {
                    if (btn.scrollIntoView) btn.scrollIntoView({ block: 'center' });
                    btn.click();
                    btn.focus();
                    if (typeof nav !== 'undefined') nav.setFocus(btn);
                }, 100);
            }

            layout.listContainer.appendChild(btn);
        });

    } else {
        // Use content + grid layout for movies/series
        layout = ViewLayoutFactory.createContentWithGrid({
            contentId: 'bucket-content-area',
            headerTitle: bucketName,
            closeBtnId: 'close-bucket-btn',
            gridId: 'bucket-grid',
            containerId: containerId
        });

        panel.appendChild(layout.container);
        closeBtn = layout.closeBtn;

        // Populate grid
        items.forEach((item, index) => {
            const card = MediaCard.create(item, bucketType, {
                onClick: (item, type, card) => {
                    handleNestedMediaClick(item, type, card, {
                        panelId: 'bucket-view'
                    });
                }
            });
            layout.gridContainer.appendChild(card);

            if (index === 0) {
                setTimeout(() => {
                    card.focus();
                    if (typeof nav !== 'undefined') nav.setFocus(card);
                }, 100);
            }
        });

        if (window.lucide) lucide.createIcons({ root: layout.gridContainer });
    }

    // Bind close button
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeBucketView(panel, hiddenState, homeContent);
        });
    }
}

function closeBucketView(panel, hiddenState, homeContent) {
    if (!panel) return;

    if (homeContent) homeContent.style.overflow = '';

    const playerContainer = panel.querySelector('#nested-player-container');
    if (playerContainer) {
        VideoPlayer.dispose();
    }

    panel.remove();

    // Use ViewLayoutFactory helper to restore sections
    ViewLayoutFactory.restoreSections(hiddenState);

    setTimeout(() => {
        const firstCard = document.querySelector('#home-fav-buckets-carousel .card');
        if (firstCard && typeof nav !== 'undefined') {
            nav.setFocus(firstCard);
        }
    }, 50);
}
