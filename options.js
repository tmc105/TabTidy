// options.js
'use strict';

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

    // Load Group On Suspend setting
    const groupOnSuspendCheck = document.getElementById('groupOnSuspend');
    const groupData = await chrome.storage.local.get('groupOnSuspend');
    // Default to false if undefined, or load saved value
    groupOnSuspendCheck.checked = !!groupData.groupOnSuspend;

    // Save Group On Suspend setting on change
    groupOnSuspendCheck.addEventListener('change', () => {
        chrome.storage.local.set({ groupOnSuspend: groupOnSuspendCheck.checked });
    });

    // Load Grouping Strategy setting
    const strategySelect = document.getElementById('groupingStrategy');
    const strategyData = await chrome.storage.local.get('groupingStrategy');
    if (strategyData.groupingStrategy) {
        strategySelect.value = strategyData.groupingStrategy;
    } else {
        // Default to 'session'
        strategySelect.value = 'session';
    }

    // Save Grouping Strategy setting on change
    strategySelect.addEventListener('change', () => {
        chrome.storage.local.set({ groupingStrategy: strategySelect.value });
    });

    document.getElementById('shortcutsLink').addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    });

    // Load Debug Mode setting
    const debugModeCheck = document.getElementById('debugMode');
    const debugData = await chrome.storage.local.get('debugMode');
    debugModeCheck.checked = !!debugData.debugMode;

    // Save Debug Mode setting on change
    debugModeCheck.addEventListener('change', () => {
        chrome.storage.local.set({ debugMode: debugModeCheck.checked });
    });

    // Whitelist Logic
    const whitelistList = document.getElementById('whitelistItems');
    const newWhitelistInput = document.getElementById('newWhitelistItem');
    const addWhitelistBtn = document.getElementById('addWhitelistBtn');
    const exportWhitelistBtn = document.getElementById('exportWhitelistBtn');
    const importWhitelistBtn = document.getElementById('importWhitelistBtn');
    const importWhitelistFile = document.getElementById('importWhitelistFile');
    const whitelistStatus = document.getElementById('whitelistStatus');

    function setStatus(message, isError = false) {
        if (!whitelistStatus) return;
        whitelistStatus.textContent = message || '';
        whitelistStatus.style.color = isError ? '#fa5252' : '#495057';
    }

    function isProbablyUrl(value) {
        try {
            const u = new URL(value);
            return u.protocol === 'http:' || u.protocol === 'https:';
        } catch {
            return false;
        }
    }

    function normalizeWhitelistItem(raw) {
        if (!raw) return null;
        const value = String(raw).trim();
        if (!value) return null;
        if (/\s/.test(value)) return null;

        // Full URL
        if (isProbablyUrl(value)) {
            try {
                const u = new URL(value);
                u.hash = '';
                // Keep query because some apps need it for stability.
                return u.toString();
            } catch {
                return null;
            }
        }

        // Domain (optionally with leading "*.")
        let domain = value.toLowerCase();
        if (domain.startsWith('*.')) domain = domain.slice(2);

        // Basic domain sanity (allow localhost, subdomains). No scheme, no path.
        if (domain.includes('/') || domain.includes('?') || domain.includes('#')) return null;
        if (domain === 'localhost') return domain;
        if (!/^[a-z0-9.-]+$/.test(domain)) return null;
        if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return null;

        return domain;
    }

    function normalizeDomainPattern(raw) {
        if (!raw) return null;
        const value = String(raw).trim();
        if (!value) return null;
        if (/\s/.test(value)) return null;

        // Domain (optionally with leading "*.")
        let domain = value.toLowerCase();
        if (domain.startsWith('*.')) domain = domain.slice(2);

        // Basic domain sanity (allow localhost, subdomains). No scheme, no path.
        if (domain.includes('/') || domain.includes('?') || domain.includes('#')) return null;
        if (domain === 'localhost') return domain;
        if (!/^[a-z0-9.-]+$/.test(domain)) return null;
        if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return null;

        return domain;
    }

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
                const textSpan = document.createElement('span');
                textSpan.className = 'whitelist-text';
                textSpan.textContent = item;
                const removeSpan = document.createElement('span');
                removeSpan.className = 'remove-btn';
                removeSpan.dataset.item = item;
                removeSpan.textContent = '✕';
                li.appendChild(textSpan);
                li.appendChild(removeSpan);
                whitelistList.appendChild(li);
            });
        }
    }

    // Initial Load
    loadWhitelist();

    // Add Item
    const handleAddWhitelist = async () => {
        setStatus('');
        const normalized = normalizeWhitelistItem(newWhitelistInput.value);
        if (!normalized) {
            setStatus('Enter a valid domain (example.com) or full URL (https://example.com/page).', true);
            return;
        }

        const data = await chrome.storage.local.get('whitelist');
        const whitelist = (data.whitelist || []).map(String);
        if (!whitelist.includes(normalized)) {
            whitelist.push(normalized);
            await chrome.storage.local.set({ whitelist });
            newWhitelistInput.value = '';
            setStatus('Added to whitelist.');
            loadWhitelist();
        } else {
            setStatus('Already in whitelist.');
        }
    };

    addWhitelistBtn.addEventListener('click', handleAddWhitelist);
    newWhitelistInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleAddWhitelist();
    });

    // Remove Item
    whitelistList.addEventListener('click', async (e) => {
        if (e.target.classList.contains('remove-btn')) {
            const itemToRemove = e.target.getAttribute('data-item');
            const data = await chrome.storage.local.get('whitelist');
            let whitelist = data.whitelist || [];
            whitelist = whitelist.filter(item => item !== itemToRemove);
            await chrome.storage.local.set({ whitelist });
            setStatus('Removed from whitelist.');
            loadWhitelist();
        }
    });

    // Export / Import
    exportWhitelistBtn.addEventListener('click', async () => {
        setStatus('');
        const data = await chrome.storage.local.get('whitelist');
        const whitelist = (data.whitelist || []).map(String);
        const payload = { whitelist, exportedAt: new Date().toISOString() };

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'tabtidy-whitelist.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setStatus('Whitelist exported.');
    });

    importWhitelistBtn.addEventListener('click', () => {
        setStatus('');
        importWhitelistFile.value = '';
        importWhitelistFile.click();
    });

    importWhitelistFile.addEventListener('change', async () => {
        setStatus('');
        const file = importWhitelistFile.files && importWhitelistFile.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            const rawList = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.whitelist) ? parsed.whitelist : null;
            if (!rawList) {
                setStatus('Invalid file format. Expected JSON array or { whitelist: [...] }.', true);
                return;
            }

            const normalizedList = rawList
                .map(normalizeWhitelistItem)
                .filter(Boolean);

            // Dedupe while preserving order
            const deduped = [];
            const seen = new Set();
            for (const item of normalizedList) {
                if (!seen.has(item)) {
                    seen.add(item);
                    deduped.push(item);
                }
            }

            await chrome.storage.local.set({ whitelist: deduped });
            setStatus(`Imported ${deduped.length} whitelist item(s).`);
            loadWhitelist();
        } catch (err) {
            console.warn('Whitelist import failed:', err);
            setStatus('Failed to import. Make sure the file is valid JSON.', true);
        }
    });
    // Custom Groups Logic
    const customGroupsList = document.getElementById('customGroupsList');
    const newGroupName = document.getElementById('newGroupName');
    const newGroupDomains = document.getElementById('newGroupDomains');
    const addCustomGroupBtn = document.getElementById('addCustomGroupBtn');

    // --- Paused Tabs Logic ---
    const pausedTabsList = document.getElementById('pausedTabsList');
    const unpauseAllBtn = document.getElementById('unpauseAllBtn');

    function formatTimeRemaining(ms) {
        if (ms <= 0) return 'Expired';
        const minutes = Math.floor(ms / 60000);
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (hours > 0) return `${hours}h ${mins}m remaining`;
        return `${mins}m remaining`;
    }

    function formatDurationLabel(durationKey) {
        const labels = {
            '30min': '30 min',
            '1hr': '1 hour',
            '2hr': '2 hours',
            '4hr': '4 hours',
            'session': 'Until restart'
        };
        return labels[durationKey] || durationKey;
    }

    async function loadPausedTabs() {
        if (!pausedTabsList) return;

        const data = await chrome.storage.local.get('pausedTabs');
        const paused = data.pausedTabs || {};
        const entries = Object.entries(paused);

        pausedTabsList.innerHTML = '';

        if (entries.length === 0) {
            const empty = document.createElement('div');
            empty.textContent = 'No paused tabs.';
            empty.style.color = '#868e96';
            empty.style.fontStyle = 'italic';
            pausedTabsList.appendChild(empty);
            unpauseAllBtn.style.display = 'none';
            return;
        }

        unpauseAllBtn.style.display = 'inline-block';
        const now = Date.now();

        for (const [tabId, entry] of entries) {
            const div = document.createElement('div');
            div.className = 'paused-tab-item';

            const infoDiv = document.createElement('div');
            infoDiv.className = 'paused-tab-info';

            const titleSpan = document.createElement('span');
            titleSpan.className = 'paused-tab-title';
            titleSpan.textContent = entry.title || entry.url || `Tab ${tabId}`;

            const metaSpan = document.createElement('span');
            metaSpan.className = 'paused-tab-meta';
            if (entry.pausedUntil === 0) {
                metaSpan.textContent = 'Paused until browser restart';
            } else {
                const remaining = entry.pausedUntil - now;
                metaSpan.textContent = remaining > 0
                    ? formatTimeRemaining(remaining)
                    : 'Expired (will resume on next check)';
            }

            infoDiv.appendChild(titleSpan);
            infoDiv.appendChild(metaSpan);

            const badge = document.createElement('span');
            badge.className = 'paused-tab-badge';
            badge.textContent = formatDurationLabel(entry.durationKey);

            const removeBtn = document.createElement('span');
            removeBtn.className = 'remove-btn';
            removeBtn.dataset.tabId = tabId;
            removeBtn.textContent = '✕';
            removeBtn.title = 'Unpause this tab';

            div.appendChild(infoDiv);
            div.appendChild(badge);
            div.appendChild(removeBtn);
            pausedTabsList.appendChild(div);
        }
    }

    loadPausedTabs();

    // Refresh paused list every 30 seconds
    setInterval(loadPausedTabs, 30000);

    if (pausedTabsList) {
        pausedTabsList.addEventListener('click', async (e) => {
            if (e.target.classList.contains('remove-btn') && e.target.dataset.tabId) {
                const tabId = Number(e.target.dataset.tabId);
                const data = await chrome.storage.local.get('pausedTabs');
                const paused = data.pausedTabs || {};
                delete paused[String(tabId)];
                await chrome.storage.local.set({ pausedTabs: paused });

                // Clear badge on that tab
                try {
                    await chrome.action.setBadgeText({ text: '', tabId });
                } catch { /* tab may be gone */ }

                loadPausedTabs();
            }
        });
    }

    if (unpauseAllBtn) {
        unpauseAllBtn.addEventListener('click', async () => {
            const data = await chrome.storage.local.get('pausedTabs');
            const paused = data.pausedTabs || {};

            // Clear all badges
            for (const tabId of Object.keys(paused)) {
                try {
                    await chrome.action.setBadgeText({ text: '', tabId: Number(tabId) });
                } catch { /* tab may be gone */ }
            }

            await chrome.storage.local.set({ pausedTabs: {} });
            loadPausedTabs();
        });
    }

    async function loadCustomGroups() {
        if (!customGroupsList) return;

        const data = await chrome.storage.local.get('customGroups');
        const groups = data.customGroups || [];

        customGroupsList.innerHTML = '';
        if (groups.length === 0) {
            const empty = document.createElement('div');
            empty.textContent = 'No custom groups defined.';
            empty.style.color = '#868e96';
            empty.style.fontStyle = 'italic';
            customGroupsList.appendChild(empty);
            return;
        }

        groups.forEach((group, groupIndex) => {
            const div = document.createElement('div');
            div.className = 'custom-group-item';

            // Header
            const header = document.createElement('div');
            header.className = 'custom-group-header';
            const nameSpan = document.createElement('span');
            nameSpan.className = 'custom-group-name';
            nameSpan.textContent = group.name;
            const removeGroupBtn = document.createElement('span');
            removeGroupBtn.className = 'remove-btn remove-group-btn';
            removeGroupBtn.dataset.group = groupIndex;
            removeGroupBtn.title = 'Delete Group';
            removeGroupBtn.textContent = '✕';
            header.appendChild(nameSpan);
            header.appendChild(removeGroupBtn);

            // Domain Tags
            const domainsList = document.createElement('div');
            domainsList.className = 'custom-group-domains-list';
            group.patterns.forEach((domain, domainIndex) => {
                const tag = document.createElement('span');
                tag.className = 'domain-tag';
                tag.appendChild(document.createTextNode(domain + ' '));
                const removeBtn = document.createElement('span');
                removeBtn.className = 'domain-remove';
                removeBtn.dataset.group = groupIndex;
                removeBtn.dataset.domain = domainIndex;
                removeBtn.textContent = '✕';
                tag.appendChild(removeBtn);
                domainsList.appendChild(tag);
            });

            // Add Domain Input
            const addDomainDiv = document.createElement('div');
            addDomainDiv.className = 'custom-group-add-domain';
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'add-domain-input';
            input.dataset.group = groupIndex;
            input.placeholder = 'Add domain (e.g. cnn.com)';
            const addBtn = document.createElement('button');
            addBtn.className = 'button add-domain-btn';
            addBtn.dataset.group = groupIndex;
            addBtn.textContent = '+';
            addDomainDiv.appendChild(input);
            addDomainDiv.appendChild(addBtn);

            div.appendChild(header);
            div.appendChild(domainsList);
            div.appendChild(addDomainDiv);
            customGroupsList.appendChild(div);
        });
    }

    // Initial Load
    if (customGroupsList) loadCustomGroups();

    if (addCustomGroupBtn) {
        const handleAddGroup = async () => {
            const name = newGroupName.value.trim();
            const domainsStr = newGroupDomains.value.trim();

            if (!name || !domainsStr) return;

            // Normalize and validate domains
            const rawPatterns = domainsStr.split(',').map(d => d.trim()).filter(d => d.length > 0);
            const patterns = rawPatterns.map(normalizeDomainPattern).filter(Boolean);

            if (patterns.length === 0) {
                alert('Please enter valid domain patterns (e.g., github.com, stackoverflow.com)');
                return;
            }

            const data = await chrome.storage.local.get('customGroups');
            const groups = data.customGroups || [];

            groups.push({ name, patterns });
            await chrome.storage.local.set({ customGroups: groups });

            newGroupName.value = '';
            newGroupDomains.value = '';
            loadCustomGroups();
        };

        addCustomGroupBtn.addEventListener('click', handleAddGroup);
        newGroupName.addEventListener('keydown', (e) => { if (e.key === 'Enter') newGroupDomains.focus(); });
        newGroupDomains.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAddGroup(); });
    }

    if (customGroupsList) {
        customGroupsList.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter' && e.target.classList.contains('add-domain-input')) {
                const groupIdx = parseInt(e.target.getAttribute('data-group'));
                const data = await chrome.storage.local.get('customGroups');
                const groups = data.customGroups || [];

                if (groupIdx >= 0 && groupIdx < groups.length) {
                    const val = e.target.value.trim();
                    if (val) {
                        const normalized = normalizeDomainPattern(val);
                        if (normalized) {
                            groups[groupIdx].patterns.push(normalized);
                            await chrome.storage.local.set({ customGroups: groups });
                            loadCustomGroups();
                        } else {
                            alert('Please enter a valid domain pattern (e.g., github.com)');
                        }
                    }
                }
            }
        });

        customGroupsList.addEventListener('click', async (e) => {
            const data = await chrome.storage.local.get('customGroups');
            const groups = data.customGroups || [];
            let shouldSave = false;

            // Remove Group (Delegated)
            if (e.target.classList.contains('remove-group-btn')) {
                const index = parseInt(e.target.getAttribute('data-group'));
                if (index >= 0 && index < groups.length) {
                    groups.splice(index, 1);
                    shouldSave = true;
                }
            }

            // Remove Domain (Delegated)
            if (e.target.classList.contains('domain-remove')) {
                const groupIdx = parseInt(e.target.getAttribute('data-group'));
                const domainIdx = parseInt(e.target.getAttribute('data-domain'));

                if (groupIdx >= 0 && groupIdx < groups.length) {
                    const group = groups[groupIdx];
                    if (domainIdx >= 0 && domainIdx < group.patterns.length) {
                        group.patterns.splice(domainIdx, 1);
                        shouldSave = true;
                    }
                }
            }

            // Add Domain (Button Click - Delegated)
            if (e.target.classList.contains('add-domain-btn')) {

                const groupIdx = parseInt(e.target.getAttribute('data-group'));
                if (groupIdx >= 0 && groupIdx < groups.length) {
                    const input = customGroupsList.querySelector(`.add-domain-input[data-group="${groupIdx}"]`);
                    const val = input ? input.value.trim() : '';
                    if (val) {
                        const normalized = normalizeDomainPattern(val);
                        if (normalized) {
                            groups[groupIdx].patterns.push(normalized);
                            shouldSave = true;
                        } else {
                            alert('Please enter a valid domain pattern (e.g., github.com)');
                        }
                    }
                }
            }

            if (shouldSave) {
                await chrome.storage.local.set({ customGroups: groups });
                loadCustomGroups();
            }
        });
    }
});
