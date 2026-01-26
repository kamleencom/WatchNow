/**
 * License Manager
 * Handles device identification, license verification, and QR code generation.
 */

class LicenseManager {
    constructor() {
        this.okpId = null;
        this.licenseInfo = null;
    }

    /**
     * Generate a deterministic MAC-like ID from input string
     * @param {string} input - Source string to generate ID from
     * @returns {string} MAC-formatted ID (XX:XX:XX:XX:XX:XX)
     */
    generateDeterministicMac(input) {
        if (!input) return "00:00:00:00:00:00";

        // Expand string if too short
        let str = input;
        while (str.length < 20) {
            str += input;
        }

        const hexParts = [];

        // We want 6 bytes (12 hex chars). 
        // We'll generate them by summing character codes in 6 overlapping windows.
        for (let i = 0; i < 6; i++) {
            let sum = 0;
            // Stride through the string
            for (let j = i; j < str.length; j += 6) {
                sum += str.charCodeAt(j);
            }
            // Mix a bit
            sum = (sum * (i + 1)) % 256;
            hexParts.push(sum.toString(16).padStart(2, '0').toUpperCase());
        }

        return hexParts.join(':');
    }

    /**
     * Get or create a virtual device ID for non-WebOS environments
     * @returns {string} MAC-formatted virtual ID
     */
    getVirtualId() {
        let vId = localStorage.getItem('watchnow_virtual_device_id');
        if (!vId) {
            vId = 'virtual_' + Math.random().toString(36).substr(2) + Date.now();
            localStorage.setItem('watchnow_virtual_device_id', vId);
        }
        return this.generateDeterministicMac(vId);
    }

    /**
     * Initialize or retrieve the OKP ID for this device
     * @returns {Promise<string>} The device's OKP ID
     */
    async initializeOkpId() {
        return new Promise((resolve) => {
            const stored = localStorage.getItem('watchnow_okp_id');
            if (stored) {
                this.okpId = stored;
                resolve(stored);
                return;
            }

            // WebOS Service Call
            if (window.webOS && window.webOS.service && window.PalmServiceBridge) {
                webOS.service.request("luna://com.webos.service.sm", {
                    method: "deviceid/getIDs",
                    parameters: { "idType": ["LGUDID"] },
                    onSuccess: (inResponse) => {
                        if (inResponse.idList && inResponse.idList.length > 0 && inResponse.idList[0].idValue) {
                            const id = this.generateDeterministicMac(inResponse.idList[0].idValue);
                            localStorage.setItem('watchnow_okp_id', id);
                            this.okpId = id;
                            resolve(id);
                        } else {
                            const id = this.getVirtualId();
                            localStorage.setItem('watchnow_okp_id', id);
                            this.okpId = id;
                            resolve(id);
                        }
                    },
                    onFailure: (inError) => {
                        console.error("Failed to get device ID", inError);
                        const id = this.getVirtualId();
                        localStorage.setItem('watchnow_okp_id', id);
                        this.okpId = id;
                        resolve(id);
                    }
                });
            } else {
                // Not on WebOS or dev environment
                const id = this.getVirtualId();
                localStorage.setItem('watchnow_okp_id', id);
                this.okpId = id;
                resolve(id);
            }
        });
    }

    /**
     * Get the stored OKP ID
     * @returns {string|null} The OKP ID if initialized
     */
    getOkpId() {
        if (this.okpId) return this.okpId;
        return localStorage.getItem('watchnow_okp_id');
    }

    /**
     * Verify the license with the backend server
     * @param {string} okpId - The device's OKP ID
     * @param {Object} callbacks - Callback functions for different states
     * @param {Function} callbacks.onSuccess - Called when license is active
     * @param {Function} callbacks.onFailed - Called when license check fails
     * @param {Function} callbacks.onPlaylistSync - Called when playlists need syncing
     */
    async verifyLicense(okpId, callbacks = {}) {
        const { onSuccess, onFailed, onPlaylistSync } = callbacks;

        const licenseScreen = document.getElementById('license-screen');
        const idDisplay = document.getElementById('license-okp-id');
        const statusDisplay = document.getElementById('license-status');
        const qrContainer = document.getElementById('license-qr');

        // Populate ID in UI
        if (idDisplay) idDisplay.textContent = okpId;
        if (qrContainer) {
            qrContainer.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://okplayer.app?id=${okpId}" alt="Scan to Buy">`;
        }

        try {
            if (statusDisplay) statusDisplay.textContent = "Connecting to server...";

            // Call Portal API
            const res = await fetch(`http://localhost:3000/api/device/verify?okpId=${okpId}`);
            const data = await res.json();

            if (data.active) {
                // Success! Hide license screen
                if (licenseScreen) licenseScreen.style.display = 'none';

                // Save License Info
                this.licenseInfo = {
                    status: 'Active',
                    expiresAt: data.expiresAt
                };
                localStorage.setItem('watchnow_license', JSON.stringify(this.licenseInfo));
                this.updateLicenseUI(this.licenseInfo);

                // Check for remote playlist sync
                if (data.playlist && onPlaylistSync) {
                    onPlaylistSync(data.playlist);
                }

                if (onSuccess) onSuccess();
            } else {
                // Failed
                if (statusDisplay) {
                    statusDisplay.textContent = data.status === 'expired' ? "License Expired" : "Not Activated";
                }
                // Show Screen
                if (licenseScreen) licenseScreen.style.display = 'flex';

                if (onFailed) onFailed(data.status);
            }
        } catch (e) {
            console.error("License Check Failed", e);
            if (statusDisplay) statusDisplay.textContent = "Connection Error. Retrying...";
            if (licenseScreen) licenseScreen.style.display = 'flex';

            // Retry in 5s
            setTimeout(() => this.verifyLicense(okpId, callbacks), 5000);
        }
    }

    /**
     * Update the license information in the settings UI
     * @param {Object} info - License info object
     * @param {string} info.status - License status
     * @param {string|null} info.expiresAt - Expiration date or null for lifetime
     */
    updateLicenseUI(info) {
        const statusEl = document.getElementById('license-info-status');
        const expiresEl = document.getElementById('license-info-expires');

        if (statusEl) {
            statusEl.textContent = info.status;
            if (info.status === 'Active') statusEl.style.color = '#10b981'; // Green
        }

        if (expiresEl) {
            if (!info.expiresAt) {
                expiresEl.textContent = 'Lifetime';
                expiresEl.style.color = 'var(--primary-color)';
            } else {
                const date = new Date(info.expiresAt);
                expiresEl.textContent = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
        }
    }

    /**
     * Load stored license info from localStorage
     * @returns {Object|null} License info if exists
     */
    loadStoredLicense() {
        try {
            const stored = localStorage.getItem('watchnow_license');
            if (stored) {
                this.licenseInfo = JSON.parse(stored);
                return this.licenseInfo;
            }
        } catch (e) {
            console.error("Failed to load stored license", e);
        }
        return null;
    }
}

// Export singleton
window.licenseManager = new LicenseManager();
