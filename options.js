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

    // Whitelist Logic
    const whitelistList = document.getElementById('whitelistItems');
    const newWhitelistInput = document.getElementById('newWhitelistItem');
    const addWhitelistBtn = document.getElementById('addWhitelistBtn');

    async function loadWhitelist() {
        const data = await chrome.storage.local.get('whitelist');
        const whitelist = data.whitelist || [];
        whitelistList.innerHTML = '';

        if (whitelist.length === 0) {
            const li = document.createElement('li');
            li.textContent = 'No whitelisted items';
            li.style.color = '#868e96';
            li.style.justifyContent = 'center';
            whitelistList.appendChild(li);
        } else {
            whitelist.forEach(item => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <span class="whitelist-text">${item}</span>
                    <span class="remove-btn" data-item="${item}">✕</span>
                `;
                whitelistList.appendChild(li);
            });
        }
    }

    // Initial Load
    loadWhitelist();

    // Add Item
    addWhitelistBtn.addEventListener('click', async () => {
        const item = newWhitelistInput.value.trim();
        if (item) {
            const data = await chrome.storage.local.get('whitelist');
            const whitelist = data.whitelist || [];
            if (!whitelist.includes(item)) {
                whitelist.push(item);
                await chrome.storage.local.set({ whitelist });
                newWhitelistInput.value = '';
                loadWhitelist();
            }
        }
    });

    // Remove Item
    whitelistList.addEventListener('click', async (e) => {
        if (e.target.classList.contains('remove-btn')) {
            const itemToRemove = e.target.getAttribute('data-item');
            const data = await chrome.storage.local.get('whitelist');
            let whitelist = data.whitelist || [];
            whitelist = whitelist.filter(item => item !== itemToRemove);
            await chrome.storage.local.set({ whitelist });
            loadWhitelist();
        }
    });
});
