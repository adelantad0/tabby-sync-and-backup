# Tabby Sync & Backup

Two-in-one synchronization and automated backup tool for [Tabby Terminal](https://github.com/Eugeny/tabby).

## Overview

`tabby-sync-and-backup` helps you synchronize your Tabby profiles, themes, and configuration across multiple machines, while maintaining local versioned snapshots to protect against accidental configuration loss.

## Core Capabilities

- **Multi-Device Synchronization Engine**: Device-Per-File multi-master sync (`devices/<deviceId>.json`) with Lamport logical clocks, SHA-256 content hashes, and 30-day tombstone deletion propagation. Completely eliminates cloud drive concurrency conflicts (iCloud, Dropbox, Syncthing, WebDAV).
- **End-to-End Encryption (E2EE)**: Authenticated AES-256-GCM encryption with PBKDF2 (10,000 iterations) for sync payloads and backups with zero plaintext leakage on disk or cloud.
- **Key Epoch Rotation**: Multi-device password rotation tracking with safe lockout, preventing configuration overwrites when master passwords diverge.
- **Zero-Data-Loss Conflict Resolution**: Parallel offline edits automatically fork into safe duplicates (`Profile (Conflict from <Device>)`), preserving all connection details.
- **Automated Pre-Sync Snapshots**: Mandatory local backup snapshot created prior to any configuration merge.
- **Storage Connection Probes**: Real-time latency measurement and validation for WebDAV and local directories.
- **Selective Sync**: Choose whether to sync profiles, folders, vault secrets, or themes while keeping OS shell paths and local hotkeys untouched.

## Settings & Sub-tabs

Under **Settings -> Sync & Backup**, the plugin provides five dedicated sections:
1. **🔄 Sync**: Storage provider selection (WebDAV, Local directory), schedule intervals, explicit "Save Settings" workflow, and manual sync controls.
2. **🛡️ Backups**: Dual local (in Tabby directory) and remote (`/backups`) snapshot management, automated retention rotation, pre-sync & startup policies, and one-click restore.
3. **🔐 Security**: Authenticated AES-256-GCM encryption with master password verification, instant snapshot encryption status badges (`Plain`, `Encrypted (OK)`, `Encrypted (Other Key)`), batch re-encryption on password change, and Tabby Vault status.
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
