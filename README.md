# TabTidy - One-Click Janitor

A lightweight Chrome extension to organize tabs into groups and automatically suspend inactive tabs to save memory.

## Features

### 🗂️ **Smart Tab Grouping**
- **One-Click Organization**: Click the extension icon or use `Ctrl+Shift+Y` (Windows) / `Cmd+Shift+Y` (Mac) to group all ungrouped tabs
- **Incremental Grouping**: Only groups tabs that aren't already in a group, preserving your existing organization
- **Session-Based**: Creates groups named "Session 1", "Session 2", etc.
- **Color Cycling**: Each new session gets a unique color (blue → red → yellow → green → pink → purple → cyan → orange)

### 💤 **Auto-Suspend**
- **Configurable Delays**: Automatically suspend inactive tabs after 1, 5, 15, 30, or 60 minutes
- **Visual Indicators**: Suspended tabs show a faded grayscale favicon and dimmed text
- **Auto-Resume**: Clicking a suspended tab automatically restores it
- **Lightweight Checks**: Adaptive checking intervals (15s for short delays, 1min for longer delays) to minimize resource usage

### ⌨️ **Keyboard Shortcuts**
- **Default**: `Ctrl+Shift+Y` (Windows/Linux) or `Cmd+Shift+Y` (Mac)
- **Customizable**: Configure your own shortcuts in Chrome settings

## Installation

### From Source
1. Clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked"
5. Select the TabTidy folder

## Usage

### Manual Grouping
- Click the TabTidy extension icon, or
- Use the keyboard shortcut `Ctrl+Shift+Y` / `Cmd+Shift+Y`

All ungrouped tabs will be organized into a new session group.

### Auto-Suspend Configuration
1. Right-click the extension icon → **Options**
2. Select your preferred **Auto-Suspend Delay**
3. Inactive tabs will automatically suspend after the specified time

### Keyboard Shortcuts
1. Right-click the extension icon → **Options**
2. Click **Configure Shortcuts**
3. Customize to your preference

## How It Works

- **Tab Grouping**: Uses Chrome's native Tab Groups API to organize tabs
- **Suspension**: Redirects inactive tabs to a lightweight placeholder page, then discards them using Chrome's native tab discarding
- **Activity Tracking**: Monitors tab usage to determine when tabs should be auto-suspended
- **Faded Favicon**: Dynamically generates grayscale versions of favicons for suspended tabs

## Permissions

- **tabs**: Read tab information and create groups
- **tabGroups**: Manage tab groups
- **storage**: Save user preferences
- **scripting**: Reserved for future features
- **alarms**: Schedule auto-suspend checks
- **host_permissions**: Access tab URLs for activity tracking

## Privacy

TabTidy runs entirely locally in your browser. No data is collected or transmitted to external servers.

## License

MIT License - Feel free to use, modify, and distribute.

## Credits

Built with ❤️ for better tab management.
