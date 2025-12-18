// background.js
'use strict';

const TAB_ACTIVITY_KEY = 'tabActivity';
const SESSION_COUNTER_KEY = 'sessionCounter';
const SUSPENDED_TABS_KEY = 'suspendedTabs';
const DEBUG_MODE_KEY = 'debugMode';
const COLORS = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

let badgeUpdateScheduled = false;
let updateIndexDebounceTimer = null;
let debugMode = false;

// Local cache for tab activity to prevent storage race conditions
let localTabActivity = {};
let activitySaveTimer = null;

// Load initial state
chrome.storage.local.get([DEBUG_MODE_KEY, TAB_ACTIVITY_KEY]).then(data => {
    debugMode = !!data[DEBUG_MODE_KEY];
    localTabActivity = data[TAB_ACTIVITY_KEY] || {};
});

// Conditional logging helper
function debugLog(...args) {
    if (debugMode) {
        console.log('TabTidy:', ...args);
    }
}

// Listen for debug mode changes
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[DEBUG_MODE_KEY]) {
        debugMode = !!changes[DEBUG_MODE_KEY].newValue;
    }
});

function isSuspendedTabUrl(url) {
    if (typeof url !== 'string') return false;
    const base = chrome.runtime.getURL('suspended.html');
    return url.startsWith(base);
}

function safeGetHostname(url) {
    if (typeof url !== 'string') return '';
    try {
        const u = new URL(url);
        return (u.hostname || '').toLowerCase();
    } catch {
        return '';
    }
}

function isHttpUrlString(value) {
    if (typeof value !== 'string') return false;
    try {
        const u = new URL(value);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

function normalizeDomainItem(value) {
    if (typeof value !== 'string') return '';
    let domain = value.trim().toLowerCase();
    if (domain.startsWith('*.')) domain = domain.slice(2);
    return domain;
}

function parseSuspendedUrl(url) {
    if (typeof url !== 'string') return null;
    try {
        const u = new URL(url);
        const originalUrl = u.searchParams.get('url');
        if (!originalUrl) return null;
        return {
            url: originalUrl,
            title: u.searchParams.get('title') || '',
            favicon: u.searchParams.get('favicon') || ''
        };
    } catch {
        return null;
    }
}


function getRootDomain(hostname) {
    if (!hostname) return 'Other';
    const parts = hostname.split('.');
    if (parts.length <= 2) return hostname;

    // Heuristic for compound TLDs (co.uk, com.au)
    const last = parts[parts.length - 1];
    const secondLast = parts[parts.length - 2];
    if (last.length === 2 && ['co', 'com', 'net', 'org', 'gov', 'edu'].includes(secondLast)) {
        return parts.slice(-3).join('.');
    }
    return parts.slice(-2).join('.');
}

function getPrettyGroupName(rootDomain) {
    const overrides = {
        'github.com': 'GitHub',
        'youtube.com': 'YouTube',
        'google.com': 'Google',
        'reddit.com': 'Reddit',
        'twitter.com': 'Twitter',
        'x.com': 'X',
        'facebook.com': 'Facebook',
        'amazon.com': 'Amazon',
        'linkedin.com': 'LinkedIn',
        'wikipedia.org': 'Wikipedia',
        'stackoverflow.com': 'Stack Overflow',
        'medium.com': 'Medium',
        'instagram.com': 'Instagram',
        'netflix.com': 'Netflix',
        'twitch.tv': 'Twitch',
        'microsoft.com': 'Microsoft',
        'apple.com': 'Apple',
        'chatgpt.com': 'ChatGPT',
        'openai.com': 'OpenAI'
    };

    if (overrides[rootDomain]) return overrides[rootDomain];

    // Fallback: Take the first part of the root domain and capitalize
    const part = rootDomain.split('.')[0];
    return part.charAt(0).toUpperCase() + part.slice(1);
}

async function updateBadge() {
    try {
        // Removed suspended tab count indicator as requested
        await chrome.action.setBadgeText({ text: '' });
    } catch (e) {
        console.warn('TabTidy: Failed to update badge:', e);
    }
}

function scheduleBadgeUpdate() {
    if (badgeUpdateScheduled) return;
    badgeUpdateScheduled = true;
    setTimeout(() => {
        badgeUpdateScheduled = false;
        updateBadge();
    }, 250);
}

async function getNextSessionNumber() {
    const data = await chrome.storage.local.get(SESSION_COUNTER_KEY);
    const current = Number(data[SESSION_COUNTER_KEY]) || 0;
    const next = current + 1;
    await chrome.storage.local.set({ [SESSION_COUNTER_KEY]: next });
    return next;
}

async function rebuildSuspendedIndex() {
    const tabs = await chrome.tabs.query({});
    const nextIndex = {};

    for (const tab of tabs) {
        if (!tab || typeof tab.id !== 'number') continue;
        if (!isSuspendedTabUrl(tab.url)) continue;

        const parsed = parseSuspendedUrl(tab.url);
        if (!parsed) continue;

        nextIndex[String(tab.id)] = {
            originalUrl: parsed.url,
            title: parsed.title,
            faviconUrl: parsed.favicon,
            suspendedAt: Date.now()
        };
    }

    await chrome.storage.local.set({ [SUSPENDED_TABS_KEY]: nextIndex });
}

// Shared function to create menus
function createMenus() {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: "whitelist-domain",
            title: "TabTidy: Whitelist this Domain",
            contexts: ["all"]
        });
        chrome.contextMenus.create({
            id: "whitelist-url",
            title: "TabTidy: Whitelist this URL",
            contexts: ["all"]
        });
    });
}

async function ensureAutoSuspendAlarm() {
    const alarm = await chrome.alarms.get('checkAutoSuspend');
    if (!alarm) {
        chrome.alarms.create('checkAutoSuspend', { delayInMinutes: 0.25, periodInMinutes: 1 });
    }
}

ensureAutoSuspendAlarm();

// Initialize storage on install
chrome.runtime.onInstalled.addListener(async () => {
    // Create the auto-suspend alarm (starts with 15 second checks)
    await ensureAutoSuspendAlarm();

    // Create Context Menu Items
    createMenus();

    debugLog('Extension installed, alarm created, context menus added');

    // Initialize activity for all existing tabs
    await initializeExistingTabs();

    // Crash/session restore helpers
    await rebuildSuspendedIndex();
    await updateBadge();
});

// Ensure alarm exists on service worker startup
chrome.runtime.onStartup.addListener(async () => {
    // Create the auto-suspend alarm (starts with 15 second checks)
    await ensureAutoSuspendAlarm();

    // Re-create Context Menu Items
    createMenus();

    debugLog('Service worker started, alarm created');

    // Initialize activity for all existing tabs
    await initializeExistingTabs();

    // Crash/session restore helpers
    await rebuildSuspendedIndex();
    await updateBadge();
});

// Listen for extension icon click
chrome.action.onClicked.addListener(async (tab) => {
    await performTidy();
});

// Listen for keyboard commands
chrome.commands.onCommand.addListener(async (command) => {
    if (command === '_execute_action') {
        await performTidy();
    }
});

// Handle Context Menu Clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "whitelist-domain" || info.menuItemId === "whitelist-url") {
        let itemToAdd = "";
        try {
            if (info.menuItemId === "whitelist-domain") {
                const u = new URL(tab.url);
                itemToAdd = u.hostname;
            } else {
                itemToAdd = tab.url;
            }
        } catch (e) {
            console.warn('TabTidy: Failed to parse tab URL for whitelist:', e);
            return;
        }

        const data = await chrome.storage.local.get('whitelist');
        const whitelist = data.whitelist || [];

        if (!whitelist.includes(itemToAdd)) {
            whitelist.push(itemToAdd);
            await chrome.storage.local.set({ whitelist });
            debugLog(`Added '${itemToAdd}' to whitelist`);
        }
    }
});

// Listen for tab updates to analyze content (Future proofing / "AI" prep)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        analyzeTab(tab);
    }
    // Update activity timestamp
    if (changeInfo.status === 'complete' || changeInfo.url) {
        updateTabActivity(tabId);
    }

    // Maintain suspended index + badge (debounced to reduce storage writes)
    if (changeInfo.url || changeInfo.status === 'complete') {
        clearTimeout(updateIndexDebounceTimer);
        updateIndexDebounceTimer = setTimeout(async () => {
            try {
                const data = await chrome.storage.local.get(SUSPENDED_TABS_KEY);
                const index = data[SUSPENDED_TABS_KEY] || {};
                const key = String(tabId);

                if (isSuspendedTabUrl(tab.url)) {
                    if (!index[key]) {
                        const parsed = parseSuspendedUrl(tab.url);
                        if (parsed) {
                            index[key] = {
                                originalUrl: parsed.url,
                                title: parsed.title,
                                faviconUrl: parsed.favicon,
                                suspendedAt: Date.now()
                            };
                            await chrome.storage.local.set({ [SUSPENDED_TABS_KEY]: index });
                        }
                    }
                } else {
                    if (index[key]) {
                        delete index[key];
                        await chrome.storage.local.set({ [SUSPENDED_TABS_KEY]: index });
                    }
                }

                scheduleBadgeUpdate();
            } catch (e) {
                console.warn('TabTidy: Failed to update suspended index:', e);
            }
        }, 100); // 100ms debounce
    }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
    // Update the previous tab's activity so it counts inactivity from NOW
    // (Otherwise it counts from when it was last ACTIVATED, which could be long ago)
    const data = await chrome.storage.local.get('lastActiveTabId');
    const lastTabId = data.lastActiveTabId;

    if (lastTabId && lastTabId !== activeInfo.tabId) {
        await updateTabActivity(lastTabId);
    }

    // Update current tab and save it as the last active
    await updateTabActivity(activeInfo.tabId);
    await chrome.storage.local.set({ 'lastActiveTabId': activeInfo.tabId });
});

// Auto-Suspend Logic
async function updateTabActivity(tabId) {
    localTabActivity[tabId] = Date.now();

    // Debounce storage write
    clearTimeout(activitySaveTimer);
    activitySaveTimer = setTimeout(() => {
        chrome.storage.local.set({ [TAB_ACTIVITY_KEY]: localTabActivity });
    }, 1000);
}

// Track new tabs
chrome.tabs.onCreated.addListener(async (tab) => {
    await updateTabActivity(tab.id);
});

// Track removed tabs (cleanup)
chrome.tabs.onRemoved.addListener(async (tabId) => {
    delete localTabActivity[tabId];
    clearTimeout(activitySaveTimer);
    activitySaveTimer = setTimeout(() => {
        chrome.storage.local.set({ [TAB_ACTIVITY_KEY]: localTabActivity });
    }, 1000);

    const suspendedData = await chrome.storage.local.get(SUSPENDED_TABS_KEY);
    const suspendedIndex = suspendedData[SUSPENDED_TABS_KEY] || {};
    const key = String(tabId);
    if (suspendedIndex[key]) {
        delete suspendedIndex[key];
        await chrome.storage.local.set({ [SUSPENDED_TABS_KEY]: suspendedIndex });
    }

    scheduleBadgeUpdate();
});

// Initialize activity tracking for all existing tabs
async function initializeExistingTabs() {
    const data = await chrome.storage.local.get(TAB_ACTIVITY_KEY);
    const activity = data[TAB_ACTIVITY_KEY] || {};

    const tabs = await chrome.tabs.query({});
    const now = Date.now();
    for (const tab of tabs) {
        if (!isSystemPage(tab.url)) {
            const baseTime = typeof tab.lastAccessed === 'number' ? tab.lastAccessed : now;
            localTabActivity[tab.id] = baseTime;
        }
    }
    await chrome.storage.local.set({ [TAB_ACTIVITY_KEY]: localTabActivity });
    debugLog(`Initialized activity for ${tabs.length} existing tabs`);
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
    debugLog('Alarm fired:', alarm.name);
    if (alarm.name === 'checkAutoSuspend') {
        const settings = await chrome.storage.local.get(['autoSuspendDelay', 'whitelist', TAB_ACTIVITY_KEY, 'groupOnSuspend']);
        const delayMinutes = Number(settings.autoSuspendDelay) || 0;
        const groupOnSuspend = !!settings.groupOnSuspend;

        debugLog('Auto-suspend delay setting:', delayMinutes, 'Group on suspend:', groupOnSuspend);

        if (!delayMinutes || delayMinutes <= 0) {
            debugLog('Auto-suspend disabled');
            // Use 1 minute interval when disabled to reduce overhead
            chrome.alarms.create('checkAutoSuspend', { delayInMinutes: 1 });
            return;
        }

        const delayMs = delayMinutes * 60 * 1000;
        const now = Date.now();
        const tabs = await chrome.tabs.query({ active: false, audible: false, status: 'complete' });

        const activity = localTabActivity;
        const whitelist = settings.whitelist || [];

        debugLog(`Checking ${tabs.length} inactive tabs`);

        const tabsToSuspend = [];

        for (const tab of tabs) {
            // Check whitelist
            const tabHostname = safeGetHostname(tab.url);
            const isWhitelisted = whitelist.some(item => {
                if (isHttpUrlString(item)) {
                    return tab.url === item;
                }

                const domain = normalizeDomainItem(item);
                if (!domain || !tabHostname) return false;
                return tabHostname === domain || tabHostname.endsWith(`.${domain}`);
            });

            if (isWhitelisted) {
                continue;
            }

            // Skip if already suspended or pinned or system page
            if (isSuspendedTabUrl(tab.url) || tab.pinned || isSystemPage(tab.url || '')) {
                continue;
            }

            let lastActive = activity[tab.id];

            // If we don't have activity data, fall back to Chrome's lastAccessed for robustness
            if (!lastActive) {
                if (typeof tab.lastAccessed === 'number') {
                    lastActive = tab.lastAccessed;
                } else {
                    await updateTabActivity(tab.id);
                    debugLog(`Initialized activity for tab ${tab.id}`);
                    continue; // Skip this check, will catch it next time
                }
            }

            const inactiveTime = now - lastActive;
            debugLog(`Tab ${tab.id} inactive for ${Math.round(inactiveTime / 1000)}s`);

            if (inactiveTime >= delayMs) {
                tabsToSuspend.push(tab);
            }
        }

        if (tabsToSuspend.length > 0) {
            debugLog(`Found ${tabsToSuspend.length} tabs to suspend`);

            // Optional: Group them before suspending
            if (groupOnSuspend) {
                debugLog('Grouping tabs prior to suspension...');
                await organizeTabs(tabsToSuspend);
            }

            // Suspend them
            for (const tab of tabsToSuspend) {
                debugLog(`Auto-suspending tab ${tab.id}`);
                // Re-fetch tab to ensure it still exists and get updated state
                try {
                    const currentTab = await chrome.tabs.get(tab.id);
                    if (currentTab) await suspendTab(currentTab);
                } catch (e) {
                    console.warn(`TabTidy: Tab ${tab.id} gone before suspension`, e);
                }
            }
        }

        // Adaptive check interval: 15s for short delays (<=1 min), 1 minute for longer delays
        const nextCheckDelay = delayMinutes <= 1 ? 0.25 : 1;
        chrome.alarms.create('checkAutoSuspend', { delayInMinutes: nextCheckDelay, periodInMinutes: 1 });
    }
});

async function suspendTab(tab) {
    try {
        // Persist original info (crash/session restore index)
        const data = await chrome.storage.local.get(SUSPENDED_TABS_KEY);
        const index = data[SUSPENDED_TABS_KEY] || {};
        index[String(tab.id)] = {
            originalUrl: tab.url,
            title: tab.title || '',
            faviconUrl: tab.favIconUrl || '',
            suspendedAt: Date.now()
        };
        await chrome.storage.local.set({ [SUSPENDED_TABS_KEY]: index });

        const suspendedUrl = chrome.runtime.getURL('suspended.html') +
            `?url=${encodeURIComponent(tab.url)}` +
            `&title=${encodeURIComponent(tab.title)}` +
            `&favicon=${encodeURIComponent(tab.favIconUrl || '')}`;

        await chrome.tabs.update(tab.id, { url: suspendedUrl });

        // Wait for the tab to load the suspended page, then discard it
        const listener = function (tid, changeInfo) {
            if (tid === tab.id && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                clearTimeout(listenerTimeout);

                setTimeout(async () => {
                    try {
                        const currentTab = await chrome.tabs.get(tab.id);
                        if (!currentTab.active) {
                            await chrome.tabs.discard(tab.id);
                        }
                    } catch (err) {
                        console.warn('Discard failed', err);
                    }
                }, 1000);
            }
        };
        chrome.tabs.onUpdated.addListener(listener);

        // Cleanup listener after 30 seconds to prevent memory leaks
        const listenerTimeout = setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
        }, 30000);

        scheduleBadgeUpdate();

    } catch (e) {
        console.warn(`Failed to auto-suspend tab ${tab.id}:`, e);
    }
}

async function analyzeTab(tab) {
    // In a real "AI" version, we might send the title/url to an LLM here.
    // For now, we just ensure we have the metadata ready or cache it.
}

async function organizeTabs(inputTabs) {
    if (!inputTabs || inputTabs.length === 0) return;

    // Get settings
    const settings = await chrome.storage.local.get(['groupingStrategy', 'customGroups']);
    const strategy = settings.groupingStrategy || 'session';
    const customGroups = settings.customGroups || [];

    // Filter valid tabs for grouping (ignore pinned)
    let validTabsToGroup = inputTabs.filter(t => !t.pinned);
    if (validTabsToGroup.length === 0) return;

    let colorIdx = 0;

    // Helper to find or create group
    async function getOrCreateGroup(title, color, windowId, tabIds) {
        // Find existing group with same title in this window
        const groups = await chrome.tabGroups.query({ windowId });
        const existing = groups.find(g => g.title === title);

        if (existing) {
            return await chrome.tabs.group({ tabIds, groupId: existing.id });
        }

        // Create new
        const gid = await chrome.tabs.group({ tabIds, createProperties: { windowId } });
        await chrome.tabGroups.update(gid, { title, color });
        return gid;
    }

    // 1. Process Custom Groups
    if (customGroups.length > 0) {
        for (const groupDef of customGroups) {
            const groupTabs = [];
            validTabsToGroup = validTabsToGroup.filter(tab => {
                const hostname = safeGetHostname(tab.url);
                // Also support grouping if the tab is already suspended but has the original URL in query

                let checkUrl = tab.url;
                let checkHost = hostname;

                if (isSuspendedTabUrl(tab.url)) {
                    const parsed = parseSuspendedUrl(tab.url);
                    if (parsed) {
                        checkUrl = parsed.url;
                        checkHost = safeGetHostname(parsed.url);
                    }
                }

                const matches = groupDef.patterns.some(pattern => {
                    const p = pattern.toLowerCase().trim();
                    return checkHost === p || checkHost.endsWith('.' + p) || checkUrl.includes(p);
                });

                if (matches) {
                    groupTabs.push(tab);
                    return false; // Remove
                }
                return true; // Keep
            });

            if (groupTabs.length > 0) {
                const tabIds = groupTabs.map(t => t.id);
                const windowId = groupTabs[0].windowId;
                try {
                    await getOrCreateGroup(groupDef.name, COLORS[colorIdx % COLORS.length], windowId, tabIds);
                    colorIdx++;
                } catch (e) {
                    console.warn('TabTidy: Failed to create custom group:', e);
                }
            }
        }
    }

    // 2. Process Remaining
    if (validTabsToGroup.length === 0) return;

    if (strategy === 'domain') {
        const domainGroups = {};
        for (const tab of validTabsToGroup) {
            let hostname = safeGetHostname(tab.url);
            if (isSuspendedTabUrl(tab.url)) {
                const parsed = parseSuspendedUrl(tab.url);
                if (parsed) hostname = safeGetHostname(parsed.url);
            }

            const root = getRootDomain(hostname);
            if (!domainGroups[root]) domainGroups[root] = [];
            domainGroups[root].push(tab);
        }

        for (const [root, groupTabs] of Object.entries(domainGroups)) {
            const groupTitle = getPrettyGroupName(root);
            const tabIds = groupTabs.map(t => t.id);
            const windowId = groupTabs[0].windowId;
            try {
                await getOrCreateGroup(groupTitle, COLORS[colorIdx % COLORS.length], windowId, tabIds);
                colorIdx++;
            } catch (e) {
                console.warn('TabTidy: Failed to create/update domain group:', e);
            }
        }
    } else {
        // Session Strategy
        const sessionId = await getNextSessionNumber();
        const tabIds = validTabsToGroup.map(t => t.id);
        const windowId = validTabsToGroup[0].windowId;
        try {
            await getOrCreateGroup(`Session ${sessionId}`, COLORS[colorIdx % COLORS.length], windowId, tabIds);
        } catch (e) {
            console.warn('TabTidy: Failed to create/update session group:', e);
        }
    }
}

async function performTidy() {
    const tabs = await chrome.tabs.query({ currentWindow: true });

    // Filter valid tabs (ungrouped, not pinned, not system)
    const validTabs = tabs.filter(t => !t.pinned && !isSystemPage(t.url));

    // Organize them
    await organizeTabs(validTabs);

    // After organizing, check which tabs should be suspended
    // We only suspend tabs that are not active, skip audible, and have been inactive for at least 1 minute
    const now = Date.now();
    const tabsToSuspend = [];

    for (const tab of validTabs) {
        if (tab.active || tab.audible || tab.pinned || isSuspendedTabUrl(tab.url)) continue;

        const lastActive = localTabActivity[tab.id] || 0;
        const inactiveTime = now - lastActive;

        // Manual tidy suspension: threshold of 1 minute inactivity
        if (inactiveTime >= 60000) {
            tabsToSuspend.push(tab);
        }
    }

    // Suspend
    for (const tabToSuspendInfo of tabsToSuspend) {
        try {
            const t = await chrome.tabs.get(tabToSuspendInfo.id);
            if (t && !t.active) await suspendTab(t);
        } catch (e) {
            console.warn(`TabTidy: Tab ${tabToSuspendInfo.id} gone before manual suspension`, e);
        }
    }

    scheduleBadgeUpdate();
}

function isSystemPage(url) {
    if (typeof url !== 'string') return true;
    const isOwnExtension = url.startsWith(chrome.runtime.getURL(''));
    if (isOwnExtension) return false; // Allow our own pages (like suspended.html)

    return url.startsWith('chrome://') ||
        url.startsWith('edge://') ||
        url.startsWith('about:') ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('extensions://');
}
