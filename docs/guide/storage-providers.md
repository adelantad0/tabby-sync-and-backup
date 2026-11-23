# Storage Providers

Tabby Sync & Backup does not lock you into any proprietary cloud service. You have 100% control over where your encrypted data is stored.

---

## Supported Providers

You can choose your storage engine under **Settings -> Sync & Backup -> Sync**:

### 1. Local Directory (Recommended for Cloud Sync Drives)

If you already use a cloud synchronization client on your computers (such as **iCloud Drive**, **Dropbox**, **Google Drive**, **OneDrive**, or **Syncthing**), this is the simplest and fastest setup.

#### How to configure:
1. In Tabby settings, select **Provider: Local Directory**.
2. Click **Browse** and select a folder inside your cloud drive:
   * *iCloud Drive (macOS):* `~/Library/Mobile Documents/com~apple~CloudDocs/TabbySync`
   * *Dropbox:* `~/Dropbox/Apps/TabbySync`
   * *Syncthing / Local:* any shared folder path.
3. Click **Test Connection** (measures read/write latency).
4. Click **Save Settings**.

> [!TIP]
> Because Tabby Sync & Backup writes independent files per device (`devices/<id>.json`), background cloud sync tools will never produce file conflicts.

---

### 2. WebDAV (Nextcloud, ownCloud, Yandex.Disk, etc.)

Ideal for self-hosted clouds and privacy enthusiasts.

#### How to configure:
1. Select **Provider: WebDAV**.
2. Fill in the connection parameters:
   * **Server URL**: Your WebDAV endpoint (e.g. `https://cloud.example.com/remote.php/dav/files/username/tabby/`).
   * **Username**: Your cloud login.
   * **Password**: An **App Password** / token generated in your cloud security settings.
3. Click **Test Connection** to verify HTTPS latency and write permissions.
4. Click **Save Settings**.

---

## Selective Synchronization

You don't have to sync everything. In the **Sync Settings** sub-panel, you can toggle:

* **Sync Profiles & Connections**: All your SSH hosts, Telnet, Serial, and local shell profiles.
* **Sync Tab Groups & Folders**: Organization hierarchy of your connections.
* **Sync Color Themes**: Custom ANSI color schemes and UI appearance tweaks.
* **Sync Vault Secrets**: Encrypted passwords and credentials (optional).

> [!NOTE]
> OS-specific properties (like local terminal paths `C:\Program Files\PowerShell` vs `/bin/zsh`) and local hotkeys remain machine-specific and are never inappropriately overwritten across different operating systems.
