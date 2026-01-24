/**
 * App Manager
 * Main application entry point and bootstrapping.
 */
class AppManager {
    constructor() {
    }

    async init() {
        // Global Instances
        window.nav = new SpatialNavigation();

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
        // Services
        if (window.playlistManager) {
            playlistManager.init();
        }

        // Favorites
        if (window.favoritesManager) {
            favoritesManager.load();
        }

        // Settings
        if (window.settingsManager) {
            settingsManager.load();
        } else {
            loadAppSettings();
        }

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
