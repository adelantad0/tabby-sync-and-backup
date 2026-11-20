# Tabby Sync & Backup

Two-in-one synchronization and automated backup tool for [Tabby Terminal](https://github.com/Eugeny/tabby).

## Overview

`tabby-sync-and-backup` helps you synchronize your Tabby profiles, themes, and configuration across multiple machines, while maintaining local versioned snapshots to protect against accidental configuration loss.

## Core Capabilities

- **Bidirectional Settings Sync**: Share terminal profiles, color themes, and custom hotkeys across macOS, Linux, and Windows.
- **Automated Snapshots**: Create local backup copies of `config.yaml` prior to synchronization operations.
- **Rollback Support**: Restore previous configuration states if needed.
- **Multiple Storage Targets**: Support for storage backends such as WebDAV (Nextcloud, ownCloud) and local/network directories (Syncthing, Dropbox, iCloud).
- **Vault Compatibility**: Designed to respect Tabby encrypted secrets and configuration structures.

## Settings & Sub-tabs

Under **Settings -> Sync & Backup**, the plugin provides five dedicated sections:
1. **🔄 Sync**: Storage provider selection (WebDAV, Local directory), schedule intervals, explicit "Save Settings" workflow, and manual sync controls.
2. **🛡️ Backups**: Dual local (in Tabby directory) and remote (`/backups`) snapshot management, automated retention rotation, pre-sync & startup policies, and one-click restore.
3. **🔐 Security**: Client-side AES-256 payload encryption with master passphrase and Tabby Vault status.
4. **📜 Changelog**: In-app version history and release notes viewer.
5. **ℹ️ About**: Plugin information, dynamic version display, update checking, and issue reporting links.

## Installation

### Via Tabby Plugin Manager
1. Open Tabby **Settings** (`Cmd + ,` or `Ctrl + ,`).
2. Select **Plugins**.
3. Search for `tabby-sync-and-backup`.
4. Click **Install** and restart Tabby.

### Manual Installation
Run inside your Tabby user plugins directory:
```bash
npm install tabby-sync-and-backup
```

## Available Commands

Access these commands via Tabby's **Command Palette** (`Cmd + Shift + P` / `Ctrl + Shift + P`):
- `Sync & Backup: Synchronize Settings`
- `Sync & Backup: Create Local Backup`

Hotkeys can be customized under **Settings -> Hotkeys**.

## Development Setup

```bash
# Clone the repository
git clone https://github.com/adelantad0/tabby-sync-and-backup.git
cd tabby-sync-and-backup

# Install dependencies and build
npm install
npm run build

# Watch mode for iterative development
npm run watch
```

To test locally in Tabby:
```bash
# macOS link example
mkdir -p "$HOME/Library/Application Support/tabby/plugins/node_modules"
ln -sfn "$(pwd)" "$HOME/Library/Application Support/tabby/plugins/node_modules/tabby-sync-and-backup"
```

## License

MIT
