# Changelog

All notable changes to the **Tabby Sync & Backup** (`tabby-sync-and-backup`) plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- Modular sub-navigation tabs in Settings (`Sync`, `Backups`, `Security`, `Changelog`, `About`).
- Storage provider selector with dedicated configuration panels for WebDAV and Local Directory.
- Dual-target backup engine (`BackupService`) supporting local snapshots (in Tabby config directory) and remote snapshots (`/backups` on WebDAV or local directory).
- Automated retention policy rotation for both local and remote snapshots based on `maxBackupsToKeep`.
- Safety pre-restore snapshot generation preventing configuration loss during restores.
- Segmented UI switcher between Local Backups and Remote Backups with live status, upload, restore, and deletion actions.
- AES-256 payload encryption settings panel and Tabby Vault status indicator.
- In-app Changelog viewer and About card with dynamic version badge and update checker.
- Live update check engine querying GitHub Releases API with visual update banner and notifications.
- Integrated `PlatformService.openExternal()` for launching external links (GitHub repo, issues, releases) in default OS browser.
- Added native OS folder picker (`pickDirectory()`) for local sync and "Open Folder" action (`openPath()`) for snapshot directory.
- One-click "Copy Diagnostics & Environment Info" action for bug reporting.
- Extended `SyncAndBackupConfigProvider` schema defaults in `config.yaml` for provider credentials, retention limits, and encryption toggles.

### Changed
- Streamlined storage providers to WebDAV and Local Directory (temporarily removed GitHub Gist).
- Refactored settings persistence to an explicit "Save Settings" workflow with dirty state tracking, preventing unintended auto-saves on keystrokes.
- Conditional activation of Remote Backups: locked with guidance card until sync storage is configured.

### Fixed
- Fixed duplicate 'v' prefix in GitHub Actions release title.
- Fixed snapshot table list rendering by importing Angular CommonModule and FormsModule into root NgModule.

---

## [0.1.0] - 2026-11-20

### Added
- Initial project architecture and scaffolding for **Tabby Sync & Backup** (`tabby-sync-and-backup`).
- Integration with Tabby settings sidebar via `SettingsTabProvider` (`id: 'sync-and-backup'`).
- Base settings component (`SyncAndBackupSettingsTabComponent`) with auto-sync and backup toggles.
- Custom SVG toolbar button in Tabby tab bar for quick access.
- Command Palette actions:
  - `Sync & Backup: Synchronize Settings`
  - `Sync & Backup: Create Local Backup`
- Configuration provider (`ConfigProvider`) with initial `syncAndBackup` schema defaults in `config.yaml`.
- Hotkey bindings support.
- Fully typed Angular Ivy components and TypeScript build pipeline with Webpack 5.
