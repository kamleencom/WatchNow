/**
 * Utility Helper Functions
 * Shared utilities used across multiple modules.
 */

// --- Settings ---

function loadAppSettings() {
    const defaultSettings = {

        playerType: 'videojs'
    };
    Object.assign(appSettings, storageService.loadAppSettings(defaultSettings));
}

function saveAppSettings() {
    storageService.saveAppSettings(appSettings);
}



// --- Search ---

/**
 * Improved search matching algorithm.
 * 1. Matches exact substring (case-insensitive).
 * 2. Matches if all words/keywords in query are present in any order (case-insensitive).
 */
function matchSearchQuery(text, query) {
    if (!text || !query) return false;
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase().trim();

    // 1. Exact substring
    if (lowerText.includes(lowerQuery)) return true;

    // 2. All words match
    const keywords = lowerQuery.split(/\s+/).filter(k => k.length > 1);
    if (keywords.length > 1) {
        return keywords.every(keyword => lowerText.includes(keyword));
    }

    return false;
}

// --- Platform Detection ---

function getPlatform() {
    if (window.webOS) return "LG WebOS";
    if (navigator.userAgent.includes("Tizen")) return "Samsung Tizen";
    if (navigator.userAgent.includes("Android")) return "Android TV";
    return "Web Browser";
}

// --- Placeholder Generation ---

function getPlaceholder(title, type) {
    let icon = '📺';
    let colorStart = '#1a1a20';
    let colorEnd = '#0f0f13';
    let w = 300, h = 200;

    if (type === 'movies') {
        icon = '🍿';
        colorStart = '#2a1a2a';
        colorEnd = '#150a15';
        w = 200; h = 300;
    } else if (type === 'series') {
        icon = '🎬';
        colorStart = '#1a1a2e';
        colorEnd = '#0a0a15';
        w = 200; h = 300;
    }

    const cleanTitle = title.replace(/[<>&'"]/g, '');

    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
        <defs>
            <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:${colorStart};stop-opacity:1" />
                <stop offset="100%" style="stop-color:${colorEnd};stop-opacity:1" />
            </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#grad)"/>
        <g transform="translate(${w / 2 - 20}, ${h / 2 - 40}) scale(1.5)" fill="none" stroke="#ffffff33" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            ${type === 'movies' ? '<path d="M2.2 2.2L2 22h20l-.2-19.8zM2 7h20M2 12h20M2 17h20M7 2v5M17 2v5M7 17v5M17 17v5"/>' :
            (type === 'series' ? '<rect width="20" height="15" x="2" y="3" rx="2" ry="2"/><path d="m11 13 4-2.5-4-2.5v5Z"/><path d="m12 18 3.5 3.5"/><path d="m20 18-3.5 3.5"/><path d="m12 8-3.5-3.5"/><path d="m20 8-3.5-3.5"/>' :
                '<rect width="20" height="15" x="2" y="7" rx="2" ry="2"/><path d="m17 2-5 5-5-5"/><path d="m2 12h20"/><path d="m2 17h20"/><path d="m7 12v10"/><path d="m17 12v10"/>')}
        </g>
        <text x="50%" y="65%" dominant-baseline="middle" text-anchor="middle" fill="#666" font-family="sans-serif" font-size="14" font-weight="bold">
            ${cleanTitle.substring(0, 15)}${cleanTitle.length > 15 ? '...' : ''}
        </text>
    </svg>`;

    return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
}

// --- Toast Notification ---

function createToastElement() {
    if (document.getElementById('toast-notification')) return;

    const toast = document.createElement('div');
    toast.id = 'toast-notification';
    toast.className = 'toast';
    toast.innerHTML = `
        <span class="toast-icon"></span>
        <span class="toast-message"></span>
    `;
    document.body.appendChild(toast);
}

function showToast(icon, message, type = 'info') {
    const toast = document.getElementById('toast-notification');
    if (!toast) return;

    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }

    const iconEl = toast.querySelector('.toast-icon');
    if (icon.length < 5) {
        iconEl.textContent = icon;
    } else {
        iconEl.innerHTML = `<i data-lucide="${icon}"></i>`;
        lucide.createIcons({ root: iconEl });
    }
    toast.querySelector('.toast-message').textContent = message;

    toast.classList.remove('success', 'error', 'info');
    toast.classList.add(type);
    toast.classList.add('visible');

    toastTimeout = setTimeout(() => {
        toast.classList.remove('visible');
    }, 3000);
}

function showLoading(show) {
    document.getElementById('global-loader').style.display = show ? 'flex' : 'none';
}

// --- Image Error Handler ---

window.handleChannelLogoError = function (img) {
    if (!img || !img.parentNode) return;

    const span = document.createElement('span');
    span.className = 'channel-list-icon';
    span.innerHTML = '<i data-lucide="tv"></i>';

    try {
        img.parentNode.replaceChild(span, img);
        if (window.lucide && window.lucide.createIcons) {
            window.lucide.createIcons({ root: span });
        }
    } catch (e) {
        console.error("Error handling channel logo error", e);
    }
};

// --- Player Info Update ---

function updatePlayerInfo(item) {
    const title = item.title || item.name || 'Unknown Title';

    document.querySelectorAll('[id="nested-channel-name"]').forEach(el => {
        el.textContent = title;
    });

    document.querySelectorAll('[id="nested-program-title"]').forEach(el => {
        el.textContent = "No Program Information";
    });

    document.querySelectorAll('[id="nested-program-desc"]').forEach(el => {
        el.textContent = "Select a channel to start watching.";
    });

    document.querySelectorAll('.channel-logo-large').forEach(logoContainer => {
        if (item.logo || item.stream_icon) {
            const src = item.logo || item.stream_icon;
            logoContainer.innerHTML = `<img src="${src}" alt="" onerror="this.parentElement.innerHTML='<span class=\\'placeholder-logo\\'><i data-lucide=\\'tv\\'></i></span>'; if(window.lucide) window.lucide.createIcons();">`;
        } else {
            logoContainer.innerHTML = `<span class="placeholder-logo"><i data-lucide="tv"></i></span>`;
            if (window.lucide && window.lucide.createIcons) window.lucide.createIcons({ root: logoContainer });
        }
    });
}
