// suspended.js

function getQueryParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        url: params.get('url'),
        title: params.get('title'),
        favicon: params.get('favicon')
    };
}

function updateUI() {
    const { title, favicon } = getQueryParams();

    // Set Title
    if (title) {
        document.title = title;
    }

    // Set Favicon (Faded & Grayscale)
    if (favicon) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = favicon;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 32;
            canvas.height = 32;
            const ctx = canvas.getContext('2d');

            // Draw original favicon
            ctx.drawImage(img, 0, 0, 32, 32);

            // Apply fading and grayscale
            ctx.globalCompositeOperation = 'source-in';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'; // 50% opacity mask
            ctx.fillRect(0, 0, 32, 32);

            // Alternative: Draw with opacity and filter
            // This is better for preserving shape
            canvas.width = 32; // Reset
            ctx.globalCompositeOperation = 'source-over';
            ctx.filter = 'grayscale(100%) opacity(50%)';
            ctx.drawImage(img, 0, 0, 32, 32);

            let link = document.querySelector("link[rel~='icon']");
            if (!link) {
                link = document.createElement('link');
                link.rel = 'icon';
                document.head.appendChild(link);
            }
            link.href = canvas.toDataURL();
        };
        img.onerror = () => {
            // Fallback to Zzz if favicon fails to load
            setEmojiFavicon();
        };
    } else {
        setEmojiFavicon();
    }
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
        const { url } = getQueryParams();
        if (url) {
            window.location.replace(url);
        }
    }
}

// Initialize
updateUI();

// Listen for visibility change to auto-resume
document.addEventListener('visibilitychange', checkVisibility);

// Also check immediately in case it's already visible (e.g. opened in background then clicked)
checkVisibility();
