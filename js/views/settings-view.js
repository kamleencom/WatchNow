/**
 * Settings View
 * Handles settings page logic, device info loading, and app reset.
 */

function setupSettings() {


    // Reset Button
    const resetBtn = document.getElementById('reset-app-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            ConfirmationModal.show({
                title: 'Reset App?',
                message: 'Are you sure you want to remove all playlists and reset the app?',
                confirmText: 'Reset',
                cancelText: 'Cancel',
                onConfirm: async () => {
                    localStorage.clear();
                    await storageService.clearPlaylistDB();
                    window.location.reload();
                }
            });
        });
    }

    loadDeviceInfo();
}

function loadDeviceInfo() {
    const modelEl = document.getElementById('device-model');
    const sdkEl = document.getElementById('device-sdk');
    const firmwareEl = document.getElementById('device-firmware');
    const nameEl = document.getElementById('device-name');

    if (typeof webOS !== 'undefined' && webOS.deviceInfo) {
        try {
            webOS.deviceInfo((info) => {
                if (modelEl) modelEl.textContent = info.modelName || '-';
                if (sdkEl) sdkEl.textContent = info.sdkVersion || '-';
                if (firmwareEl) firmwareEl.textContent = info.firmwareVersion || '-';
            });
        } catch (e) {
            console.error("webOS deviceInfo error", e);
        }
    }

    if (typeof webOS !== 'undefined' && webOS.service) {
        try {
            webOS.service.request('luna://com.webos.service.tv.systemproperty', {
                method: 'getSystemInfo',
                parameters: {},
                onSuccess: (inResponse) => {
                    if (nameEl && inResponse.modelName) {
                        nameEl.textContent = inResponse.modelName;
                    }
                },
                onFailure: (inError) => {
                    console.error('TV System Info Failed:', inError);
                    retryGenericSystemInfo();
                }
            });

            function retryGenericSystemInfo() {
                webOS.service.request('luna://com.webos.service.systemservice', {
                    method: 'getSystemInfo',
                    parameters: {},
                    onSuccess: (inResponse) => {
                        if (nameEl && inResponse.deviceName) {
                            nameEl.textContent = inResponse.deviceName;
                        }
                    },
                    onFailure: (inError) => {
                        console.error('System Info Failed:', inError);
                    }
                });
            }
        } catch (e) {
            console.error("webOS service request error", e);
        }

        try {
            webOS.service.request('luna://com.webos.service.tv.systemproperty', {
                method: 'getSystemInfo',
                parameters: { keys: ['modelName', 'firmwareVersion', 'UHD', 'sdkVersion'] },
                onSuccess: (inResponse) => {
                    if (modelEl && inResponse.modelName) modelEl.textContent = inResponse.modelName;
                    if (firmwareEl && inResponse.firmwareVersion) firmwareEl.textContent = inResponse.firmwareVersion;
                    if (sdkEl && inResponse.sdkVersion) sdkEl.textContent = inResponse.sdkVersion;
                },
                onFailure: (inError) => {
                    console.error('Detailed Device Info Failed:', inError);
                }
            });
        } catch (e) {
            console.error("webOS detailed info request error", e);
        }
    } else {
        // Browser fallback
        if (modelEl) modelEl.textContent = 'Browser';
        if (sdkEl) sdkEl.textContent = navigator.userAgent.substring(0, 30) + '...';
        if (nameEl) nameEl.textContent = 'Development Environment';
    }
}

// --- Favorites Management ---

function syncFavoritesState() {
    state.favorites = favoritesManager.getAll();
}

function loadFavorites() {
    favoritesManager.load();
    syncFavoritesState();
}

function migrateFavoritesWithIds() {
    favoritesManager.migrate(state.aggregatedData);
    syncFavoritesState();
}

function toggleFavorite(item, type, buttonElement) {
    const isFav = favoritesManager.isItemFavorite(item, type);

    if (isFav) {
        favoritesManager.removeItem(item, type);
        if (buttonElement) {
            if (buttonElement.classList.contains('favorite-icon-container')) {
                buttonElement.innerHTML = '';
                buttonElement.style.marginRight = '0px';
            } else {
                buttonElement.classList.remove('active');
                buttonElement.innerHTML = '<i data-lucide="star"></i>';
                buttonElement.title = 'Add to Favorites';
                lucide.createIcons({ root: buttonElement });
            }
        }
        showToast('star', `Removed from Favorites`, 'info');
    } else {
        favoritesManager.addItem(item, type);
        if (buttonElement) {
            if (buttonElement.classList.contains('favorite-icon-container')) {
                buttonElement.innerHTML = '<i data-lucide="star" style="width:20px; height:20px; color:#ffb020; fill:currentColor;"></i>';
                buttonElement.style.marginRight = '8px';
                lucide.createIcons({ root: buttonElement });
            } else {
                buttonElement.classList.add('active', 'pop');
                buttonElement.innerHTML = '<i data-lucide="star" style="fill: currentColor;"></i>';
                buttonElement.title = 'Remove from Favorites';
                lucide.createIcons({ root: buttonElement });
                setTimeout(() => buttonElement.classList.remove('pop'), 300);
            }
        }
        showToast('star', `Added to Favorites`, 'success');
    }

    syncFavoritesState();

    if (state.currentView === 'home') {
        renderHomeView();
    }

    updateFavoriteButtonsForItem(item, type);
}

function updateFavoriteButtonsForItem(item, type) {
    const isFav = favoritesManager.isItemFavorite(item, type);

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

    document.querySelectorAll(`.nested-list-item[data-url="${CSS.escape(item.url)}"] .favorite-icon-container`).forEach(container => {
        if (isFav) {
            container.innerHTML = '<i data-lucide="star" style="width:20px; height:20px; color:#ffb020; fill:currentColor;"></i>';
            container.style.marginRight = '8px';
            lucide.createIcons({ root: container });
        } else {
            container.innerHTML = '';
            container.style.marginRight = '0px';
        }
    });
}

function toggleFavoriteBucket(name, type, btnElement) {
    const isNowFavorite = favoritesManager.toggleBucket(name, type);
    syncFavoritesState();

    if (btnElement) {
        if (isNowFavorite) {
            btnElement.innerHTML = '<i data-lucide="star" style="width:24px; height:24px; color:#ffb020; fill:currentColor;"></i>';
            btnElement.style.color = '#ffb020';
            btnElement.style.marginRight = '8px';
            btnElement.classList.add('active');
            lucide.createIcons({ root: btnElement });
            btnElement.style.transform = 'scale(1.4)';
            setTimeout(() => btnElement.style.transform = 'scale(1)', 200);
        } else {
            btnElement.innerHTML = '';
            btnElement.style.marginRight = '0px';
            btnElement.style.color = '#666';
            btnElement.classList.remove('active');
        }
    }

    showToast('folder', isNowFavorite ? 'Added Folder to Favorites' : 'Removed Folder from Favorites', isNowFavorite ? 'success' : 'info');
}

// --- Yellow Button Handler for LG Remote ---

function setupFavoritesKeyHandler() {
    document.addEventListener('keydown', (e) => {
        const isYellow = e.keyCode === 405 || e.key === 'y' || e.key === 'Y';
        const isF = e.key === 'f' || e.key === 'F';

        if (isYellow) {
            e.preventDefault();
            handleYellowButtonPress();
            return;
        }

        if (isF) {
            const activeTag = document.activeElement ? document.activeElement.tagName.toUpperCase() : '';
            const isInput = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || (document.activeElement && document.activeElement.isContentEditable);

            if (!isInput) {
                e.preventDefault();
                handleYellowButtonPress();
            }
        }
    });
}

function handleYellowButtonPress() {
    if (state.focusedItem && state.focusedItem.card &&
        (state.focusedItem.card === document.activeElement || state.focusedItem.card.contains(document.activeElement))) {

        const { item, type, card } = state.focusedItem;
        const favBtn = card.querySelector('.favorite-btn') || card.querySelector('.favorite-icon-container');

        if (type === 'bucket') {
            toggleFavoriteBucket(item.name, item.type, favBtn);
        } else {
            toggleFavorite(item, type, favBtn);
        }
    }
}
