// popup.js
'use strict';

document.addEventListener('DOMContentLoaded', async () => {
    const tidyNowBtn = document.getElementById('tidyNowBtn');
    const togglePauseBtn = document.getElementById('togglePauseBtn');
    const openOptions = document.getElementById('openOptions');
    const suspendedList = document.getElementById('suspendedList');
    const suspendedCount = document.getElementById('suspendedCount');

    // Open options page
    openOptions.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    // Tidy Now
    tidyNowBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'performTidy' });
        window.close();
    });

    // Check global pause state
    const data = await chrome.storage.local.get(['globalPauseUntil']);
    const now = Date.now();
    let isPaused = data.globalPauseUntil && data.globalPauseUntil > now;

    function updatePauseButton() {
        if (isPaused) {
            togglePauseBtn.textContent = 'Resume Auto-Suspend';
            togglePauseBtn.classList.remove('btn-secondary');
            togglePauseBtn.classList.add('btn-danger');
        } else {
            togglePauseBtn.textContent = 'Pause Auto-Suspend (1 Hour)';
            togglePauseBtn.classList.remove('btn-danger');
            togglePauseBtn.classList.add('btn-secondary');
        }
    }

    updatePauseButton();

    togglePauseBtn.addEventListener('click', async () => {
        if (isPaused) {
            await chrome.storage.local.remove('globalPauseUntil');
            isPaused = false;
        } else {
            // Pause for 1 hour
            const pauseUntil = Date.now() + (60 * 60 * 1000);
            await chrome.storage.local.set({ globalPauseUntil: pauseUntil });
            isPaused = true;
        }
        updatePauseButton();
    });

    // Load suspended tabs
    const tabs = await chrome.tabs.query({});
    const suspendedTabs = tabs.filter(tab => {
        if (tab.url && tab.url.startsWith(chrome.runtime.getURL('suspended.html'))) {
            return true;
        }
        if (tab.discarded) {
            return true;
        }
        return false;
    });

    suspendedCount.textContent = suspendedTabs.length;

    if (suspendedTabs.length > 0) {
        suspendedList.innerHTML = '';
        suspendedTabs.forEach(tab => {
            const li = document.createElement('li');
            li.className = 'tab-item';
            
            let title = tab.title || 'Suspended Tab';
            let favicon = tab.favIconUrl || 'icons/icon32.png';
            
            if (tab.url && tab.url.startsWith(chrome.runtime.getURL('suspended.html'))) {
                try {
                    const u = new URL(tab.url);
                    title = u.searchParams.get('title') || title;
                    favicon = u.searchParams.get('favicon') || favicon;
                } catch (e) {}
            }

            li.innerHTML = `
                <img src="${favicon}" class="tab-icon" onerror="this.src='icons/icon32.png'">
                <span class="tab-title" title="${title}">${title}</span>
            `;
            
            li.addEventListener('click', () => {
                chrome.tabs.update(tab.id, { active: true });
                chrome.windows.update(tab.windowId, { focused: true });
            });
            
            suspendedList.appendChild(li);
        });
    }
});
