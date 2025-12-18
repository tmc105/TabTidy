// suspended.js
'use strict';

function getQueryParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        url: params.get('url'),
        title: params.get('title'),
        favicon: params.get('favicon')
    };
}

let recoveredInfo = null;

async function recoverOriginalInfoFromStorage() {
    try {
        if (!chrome?.tabs?.getCurrent) return null;
        const currentTab = await chrome.tabs.getCurrent();
        if (!currentTab || typeof currentTab.id !== 'number') return null;

        const data = await chrome.storage.local.get('suspendedTabs');
        const index = data.suspendedTabs || {};
        const entry = index[String(currentTab.id)];
        if (!entry || !entry.originalUrl) return null;

        return {
            url: entry.originalUrl,
            title: entry.title || '',
            favicon: entry.faviconUrl || ''
        };
    } catch (e) {
        console.warn('TabTidy: Failed to recover suspended info:', e);
        return null;
    }
}

function updateUI() {
    const params = getQueryParams();
    const title = params.title || recoveredInfo?.title;
    const favicon = params.favicon || recoveredInfo?.favicon;

    // Set Title
    if (title) {
        document.title = title;
    }

    // Set Favicon (Faded to 50% opacity)
    if (favicon && favicon !== '' && favicon !== 'null') {
        tryFadeFavicon(favicon);
    } else {
        // No favicon provided, use zzz emoji
        setEmojiFavicon();
    }
}

function tryFadeFavicon(faviconUrl) {
    const img = new Image();

    // First attempt: without crossOrigin (works for same-origin and permissive CORS)
    img.src = faviconUrl;
    img.onload = () => {
        try {
            applyFadedFavicon(img);
        } catch (e) {
            // CORS error - try loading with crossOrigin
            tryWithCrossOrigin(faviconUrl);
        }
    };
    img.onerror = () => {
        // Favicon failed to load, use zzz
        setEmojiFavicon();
    };
}

function tryWithCrossOrigin(faviconUrl) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = faviconUrl + '?t=' + Date.now(); // Cache bust to retry
    img.onload = () => {
        try {
            applyFadedFavicon(img);
        } catch (e) {
            // Still failed, use zzz
            setEmojiFavicon();
        }
    };
    img.onerror = () => {
        setEmojiFavicon();
    };
}

function applyFadedFavicon(img) {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');

    // Draw with 50% opacity
    ctx.globalAlpha = 0.5;
    ctx.drawImage(img, 0, 0, 32, 32);

    // This will throw if CORS doesn't allow canvas access
    const dataUrl = canvas.toDataURL();

    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
    }
    link.href = dataUrl;
}

function setEmojiFavicon() {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">💤</text></svg>`;
    link.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
}

function checkVisibility() {
    if (document.visibilityState === 'visible') {
        const params = getQueryParams();
        const url = params.url || recoveredInfo?.url;
        if (url) window.location.replace(url);
    }
}

// Initialize
(async () => {
    const params = getQueryParams();
    if (!params.url) {
        recoveredInfo = await recoverOriginalInfoFromStorage();
    }
    updateUI();
})();

// Listen for visibility change to auto-resume
document.addEventListener('visibilitychange', checkVisibility);

// Also check immediately in case it's already visible (e.g. opened in background then clicked)
checkVisibility();
