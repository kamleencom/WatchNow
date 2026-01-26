/**
 * App Manager
 * Main application entry point and bootstrapping.
 */
class AppManager {
    constructor() {
    }

    async init() {
        // Global Instances
        window.nav = new Navigation();

        // Initialize state as early as possible to avoid race conditions with remote sync
        if (window.playlistManager) {
            playlistManager.init();
        }
        if (window.favoritesManager) {
            favoritesManager.load();
        }

        // License Check
        const okpId = await licenseManager.initializeOkpId();

        licenseManager.verifyLicense(okpId, {
            onSuccess: () => this.startApp(),
            onFailed: (status) => console.log('License failed:', status),
            onPlaylistSync: (playlist) => {
                if (window.playlistManager) {
                    playlistManager.syncRemotePlaylistsFromServer(playlist);
                }
            }
        });

        const deviceMac = document.getElementById('device-mac');
        if (deviceMac) {
            deviceMac.textContent = licenseManager.getOkpId() || 'Error';
        }

        const storedLicense = licenseManager.loadStoredLicense();
        if (storedLicense) {
            licenseManager.updateLicenseUI(storedLicense);
        }
    }

    async startApp() {
        // Settings
        if (window.settingsManager) {
            settingsManager.load();
        } else {
            loadAppSettings();
        }

        // Initialize Settings View & Handlers
        if (typeof setupSettings === 'function') setupSettings();
        if (typeof setupFavoritesKeyHandler === 'function') setupFavoritesKeyHandler();

        // Setup UI Helpers
        createToastElement();

        // Initialize Services
        if (window.VideoPlayer) VideoPlayer.init();
        if (window.weatherService) weatherService.init();

        // Load Content
        if (window.playlistManager) {
            await playlistManager.loadCachedContent();
        }

        // Navigation
        if (window.router) {
            router.init();
            router.switchToView('home');
        }

        if (window.nav) {
            nav.init();
        }

        // Global Sync (Background)
        if (window.playlistManager) {
            playlistManager.syncToBackend();
        }

        if (window.lucide) {
            lucide.createIcons();
        }
    }
}

window.appManager = new AppManager();

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
    appManager.init();
});
