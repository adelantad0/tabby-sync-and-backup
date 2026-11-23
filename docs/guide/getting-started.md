# Getting Started

Welcome to **Tabby Sync & Backup**! This guide will walk you through installing the plugin and synchronizing your first configuration in under 2 minutes.

---

## 1. Installation

You can install the plugin directly through Tabby's built-in plugin manager or via the command line.

### Option A: Via Tabby Plugin Manager (Recommended)

1. Open **Tabby**.
2. Go to **Settings** (`Cmd + ,` on macOS, or `Ctrl + ,` on Windows/Linux).
3. In the left sidebar, click **Plugins**.
4. In the search bar, type `tabby-sync-and-backup`.
5. Click **Install**.
6. Restart Tabby when prompted.

### Option B: Manual Installation (npm)

Navigate to your Tabby user plugins directory and run:

```bash
npm install tabby-sync-and-backup
```

* **macOS:** `~/Library/Application Support/tabby/plugins`
* **Windows:** `%APPDATA%\tabby\plugins`
* **Linux:** `~/.config/tabby/plugins`

---

## 2. Opening the Settings

Once installed, a new item will appear in your Tabby settings menu:

1. Open **Settings** (`Cmd + ,` or `Ctrl + ,`).
2. Navigate to **Sync & Backup** in the sidebar.

You will see five dedicated tabs:
* **🔄 Sync**: Choose your storage provider and trigger manual syncs.
* **🛡️ Backups**: View snapshots history and restore with one click.
* **🔐 Security**: Configure your encryption master password.
* **📜 Changelog**: Release notes and updates.
* **ℹ️ About**: Version info and diagnostics.

---

## 3. Quick Setup Workflow

1. Go to **Settings -> Sync & Backup -> Security**.
2. Set a strong **Master Password** to enable End-to-End Encryption.
3. Switch to the **Sync** tab:
   * Select your preferred **Storage Provider** (e.g., *Local Directory* for iCloud/Dropbox, or *WebDAV*).
   * Enter the path or URL and click **Test Connection**.
4. Click **Save Settings**.
5. Click **Sync Now** to upload your initial configuration snapshot!

---

## Available Command Palette Actions

You can quickly trigger operations at any time without opening Settings using the **Command Palette** (`Cmd + Shift + P` / `Ctrl + Shift + P`):

* `Sync & Backup: Synchronize Settings` — Triggers an immediate sync.
* `Sync & Backup: Create Local Backup` — Instantly creates a point-in-time snapshot.

> [!TIP]
> You can assign custom keyboard shortcuts to these commands under **Settings -> Hotkeys**.
