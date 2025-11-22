// options.js
document.addEventListener('DOMContentLoaded', async () => {
    const data = await chrome.storage.local.get('autoSuspendDelay');

    // Load Auto-Suspend setting
    const delaySelect = document.getElementById('autoSuspendDelay');
    if (data.autoSuspendDelay !== undefined) {
        delaySelect.value = data.autoSuspendDelay;
    }

    // Save Auto-Suspend setting on change
    delaySelect.addEventListener('change', () => {
        chrome.storage.local.set({ autoSuspendDelay: parseInt(delaySelect.value) });
    });

    document.getElementById('shortcutsLink').addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    });
});
