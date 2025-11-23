// background.js

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

// Initialize storage on install
chrome.runtime.onInstalled.addListener(async () => {
    // Create the auto-suspend alarm (starts with 15 second checks)
    chrome.alarms.create('checkAutoSuspend', { delayInMinutes: 0.25 });

    // Create Context Menu Items
    createMenus();

    console.log('TabTidy: Extension installed, alarm created, context menus added');

    // Initialize activity for all existing tabs
    await initializeExistingTabs();
});

// Ensure alarm exists on service worker startup
chrome.runtime.onStartup.addListener(async () => {
    // Create the auto-suspend alarm (starts with 15 second checks)
    chrome.alarms.create('checkAutoSuspend', { delayInMinutes: 0.25 });

    // Re-create Context Menu Items
    createMenus();

    console.log('TabTidy: Service worker started, alarm created');

    // Initialize activity for all existing tabs
    await initializeExistingTabs();
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
        const url = new URL(tab.url);
        let itemToAdd = "";

        if (info.menuItemId === "whitelist-domain") {
            itemToAdd = url.hostname;
        } else {
            itemToAdd = tab.url;
        }

        const data = await chrome.storage.local.get('whitelist');
        const whitelist = data.whitelist || [];

        if (!whitelist.includes(itemToAdd)) {
            whitelist.push(itemToAdd);
            await chrome.storage.local.set({ whitelist });
            console.log(`TabTidy: Added '${itemToAdd}' to whitelist`);
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
});

chrome.tabs.onActivated.addListener((activeInfo) => {
    updateTabActivity(activeInfo.tabId);
});

// Auto-Suspend Logic
const tabActivity = new Map();

function updateTabActivity(tabId) {
    tabActivity.set(tabId, Date.now());
}

// Track new tabs
chrome.tabs.onCreated.addListener((tab) => {
    updateTabActivity(tab.id);
});

// Track removed tabs (cleanup)
chrome.tabs.onRemoved.addListener((tabId) => {
    tabActivity.delete(tabId);
});

// Initialize activity tracking for all existing tabs
async function initializeExistingTabs() {
    const tabs = await chrome.tabs.query({});
    const now = Date.now();
    for (const tab of tabs) {
        if (!isSystemPage(tab.url)) {
            tabActivity.set(tab.id, now);
        }
    }
    console.log(`TabTidy: Initialized activity for ${tabs.length} existing tabs`);
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
    console.log('TabTidy: Alarm fired:', alarm.name);
    if (alarm.name === 'checkAutoSuspend') {
        const checkData = await chrome.storage.local.get('autoSuspendDelay');
        const delayMinutes = checkData.autoSuspendDelay;
        console.log('TabTidy: Auto-suspend delay setting:', delayMinutes);

        if (!delayMinutes || delayMinutes <= 0) {
            console.log('TabTidy: Auto-suspend disabled');
            // Use 1 minute interval when disabled to reduce overhead
            chrome.alarms.create('checkAutoSuspend', { delayInMinutes: 1 });
            return;
        }

        const delayMs = delayMinutes * 60 * 1000;
        const now = Date.now();
        const tabs = await chrome.tabs.query({ active: false, audible: false, status: 'complete' });

        // Get whitelist
        const whitelistData = await chrome.storage.local.get('whitelist');
        const whitelist = whitelistData.whitelist || [];

        console.log(`TabTidy: Checking ${tabs.length} inactive tabs`);

        for (const tab of tabs) {
            // Check whitelist
            const isWhitelisted = whitelist.some(item => {
                return tab.url === item || new URL(tab.url).hostname === item || new URL(tab.url).hostname.endsWith(item);
            });

            if (isWhitelisted) {
                console.log(`TabTidy: Skipping whitelisted tab ${tab.id} (${tab.url})`);
                continue;
            }

            // Skip if already suspended or pinned or system page
            if (tab.url.includes('suspended.html') || tab.pinned || isSystemPage(tab.url)) {
                console.log(`TabTidy: Skipping tab ${tab.id} (${tab.url.substring(0, 50)}...)`);
                continue;
            }

            const lastActive = tabActivity.get(tab.id);

            // If we don't have activity data, initialize it to now (tab was created before extension loaded)
            if (!lastActive) {
                updateTabActivity(tab.id);
                console.log(`TabTidy: Initialized activity for tab ${tab.id}`);
                continue; // Skip this check, will catch it next time
            }

            const inactiveTime = now - lastActive;
            console.log(`TabTidy: Tab ${tab.id} inactive for ${Math.round(inactiveTime / 1000)}s (threshold: ${Math.round(delayMs / 1000)}s)`);

            if (inactiveTime >= delayMs) {
                console.log(`TabTidy: Auto-suspending tab ${tab.id}`);
                await suspendTab(tab);
            }
        }

        // Adaptive check interval: 15s for short delays (<=1 min), 1 min for longer delays
        const nextCheckDelay = delayMinutes <= 1 ? 0.25 : 1;
        chrome.alarms.create('checkAutoSuspend', { delayInMinutes: nextCheckDelay });
    }
});

async function suspendTab(tab) {
    try {
        const suspendedUrl = chrome.runtime.getURL('suspended.html') +
            `?url=${encodeURIComponent(tab.url)}` +
            `&title=${encodeURIComponent(tab.title)}` +
            `&favicon=${encodeURIComponent(tab.favIconUrl || '')}`;

        await chrome.tabs.update(tab.id, { url: suspendedUrl });

        // Wait for the tab to load the suspended page, then discard it
        const listener = function (tid, changeInfo) {
            if (tid === tab.id && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);

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

    } catch (e) {
        console.warn(`Failed to auto-suspend tab ${tab.id}:`, e);
    }
}

async function analyzeTab(tab) {
    // In a real "AI" version, we might send the title/url to an LLM here.
    // For now, we just ensure we have the metadata ready or cache it.
}

async function performTidy() {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const groups = await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });

    // Cluster tabs (This clustering logic is now effectively ignored by the simplified grouping below)
    let groupedCount = 0;
    const tabsToSuspend = [];

    // Process Clusters (Simplified: All in one "Session" group)
    const sessionNum = getNextSessionNumber();
    const sessionName = `Session ${sessionNum}`;

    // Group all valid tabs into one group
    // Incremental Grouping: Only group tabs that are NOT already in a group
    const validTabs = tabs.filter(t => !t.pinned && !isSystemPage(t.url) && t.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE);
    if (validTabs.length > 0) {
        const tabIds = validTabs.map(t => t.id);
        const groupId = await chrome.tabs.group({ tabIds });

        // Cycle colors: blue, red, yellow, green, pink, purple, cyan, orange
        const colors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
        const color = colors[(sessionNum - 1) % colors.length];

        await chrome.tabGroups.update(groupId, { title: sessionName, color: color });

        groupedCount = validTabs.length;

        // Suspend inactive tabs in this group
        for (const tab of validTabs) {
            if (!tab.active && !tab.audible) {
                tabsToSuspend.push(tab.id);
            }
        }
    }

    // Suspend Tabs (Redirect to suspended.html)
    let suspendedCount = 0;
    for (const tabId of tabsToSuspend) {
        try {
            const tab = tabs.find(t => t.id === tabId);
            if (!tab) continue;
            await suspendTab(tab);
            suspendedCount++;
        } catch (e) {
            console.warn(`Failed to suspend tab ${tabId}:`, e);
        }
    }

}

let sessionCounter = 1;
function getNextSessionNumber() {
    return sessionCounter++;
}

function isSystemPage(url) {
    return url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('about:') || url.startsWith('extensions://');
}
