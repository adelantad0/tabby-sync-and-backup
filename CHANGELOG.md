# Changelog

All notable changes to the **Tabby Sync & Backup** (`tabby-sync-and-backup`) plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- Modular sub-navigation tabs in Settings (`Sync`, `Backups`, `Security`, `Changelog`, `About`).
- Storage provider selector with dedicated configuration panels for GitHub Gist, WebDAV, and Local Directory.
- Backup snapshot policies UI with retention rotation controls and snapshots list table.
- AES-256 payload encryption settings panel and Tabby Vault status indicator.
- In-app Changelog viewer and About card with dynamic version badge and update checker.
- Extended `SyncAndBackupConfigProvider` schema defaults in `config.yaml` for provider credentials, retention limits, and encryption toggles.

### Fixed
- Fixed duplicate 'v' prefix in GitHub Actions release title.

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
