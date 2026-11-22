# Changelog

All notable changes to the **Tabby Sync & Backup** (`tabby-sync-and-backup`) plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

## [0.3.3] - 2026-11-22

### Changed
- **Navigation & Changelog UX**:
  - Streamlined settings navigation to 4 core tabs (Sync, Backups, Security, About), removing the separate top-level Changelog tab.
  - Relocated Changelog and Version History to the bottom of the "About" tab.
  - Implemented dynamic Release Notes engine: automatically fetches live release notes from GitHub Releases API with seamless offline fallback to the bundled `CHANGELOG.md`.

## [0.3.2] - 2026-11-22

### Fixed
- **Profile Group Synchronization (`config.store.groups`)**:
  - Fixed property mismatch: Tabby stores profile groups under `config.store.groups` (not `config.store.profileGroups`).
  - Groups created on peer devices are now properly discovered, synced into the cluster state, and added to the local device's `groups` array, preventing synced profiles from falling into the "Ungrouped" bucket.

## [0.3.1] - 2026-11-22

### Fixed
- **Plugin Installation via Tabby UI (`@npmcli/arborist`)**:
  - Removed `tabby-core` and `tabby-settings` from `peerDependencies`. Tabby provides these libraries at runtime via host webpack externals; their presence in `peerDependencies` triggered `ETARGET` resolution failures in Tabby's internal Arborist installer because `tabby-core` releases on npm are nightly builds (`-nightly.x`).

## [0.3.0] - 2026-11-22

### Added
- **Multi-Device Synchronization Engine**:
  - Device-Per-File multi-master architecture (`devices/<deviceId>.json`) completely eliminating file-collision conflicts in shared folders (iCloud Drive, Dropbox, Syncthing, Nextcloud, WebDAV).
  - Lamport logical revision counters (`rev`, `baseRev`) and deterministic SHA-256 content hashing for complete clock skew immunity.
  - Tombstone deletion propagation tracking (`deletedAt`, `rev`) with 30-day Time-To-Live (TTL) automatic garbage collection.
  - Three-way deterministic merge engine with non-destructive duplicate conflict forking (`<Name> (Conflict from <Device>)`) guaranteeing zero data loss during parallel offline edits.
  - First-startup safe onboarding: fresh instances pull cloud state without overwriting or deleting remote profiles.
- **End-to-End Encryption (E2EE) for Cloud Sync**:
  - Full cryptographic sealing of sync state files (`sync/devices/<deviceId>.json`) using authenticated AES-256-GCM and PBKDF2 (10,000 iterations).
  - Zero plaintext leakage on disk: all profiles, groups, vaults, and themes sealed inside `TABBY_ENC_V1` container.
  - `keyEpoch` and `keyUpdatedAt` tracking for deterministic multi-device password rotation.
  - Safe lockout mechanism (`SyncPasswordMismatchError`) preventing accidental configuration overwrites when passwords diverge.
  - Inline master password unlock banner in the Sync tab for immediate recovery upon password changes.
- **Storage Connection Testing Engine (`SyncService`)**:
  - Real-time probe for WebDAV collections (`PROPFIND` / `OPTIONS`), latency benchmarking, and diagnostic error analysis.
  - Local directory probe verifying existence, directory attributes, and read/write permissions via probe files.
  - Live status badges (`✓ Connected`, `✗ Disconnected`, `⏳ Testing...`, `⚪ Not Tested`).
  - Eye toggle (`👁️` / `🙈`) for WebDAV authentication password field.
- **Sync Automation & UI Overhaul**:
  - "This Device Identity" card with editable device names and persistent UUID badges.
  - Selective synchronization scope switches (Profiles, Profile Groups, Vault secrets, Color Schemes).
  - Preserved cross-platform configuration: OS shell executables, window hotkeys, and window geometry remain device-local.
  - Automated sync triggers: delayed startup sync (4s), window focus sync with 30-second debounce, and periodic background timer.
  - Connected Cluster Devices roster table showing peer names, operating systems, security status, and last-seen timestamps.
  - Dedicated `Pre-Sync` automated safety backup snapshot before every configuration merge.

## [0.2.0] - 2026-11-21

### Added
- Modular sub-navigation tabs in Settings (`Sync`, `Backups`, `Security`, `Changelog`, `About`).
- Storage provider selector with dedicated configuration panels for WebDAV and Local Directory.
- Dual-target backup engine (`BackupService`) supporting local snapshots (in Tabby config directory) and remote snapshots (`/backups` on WebDAV or local directory).
- Cryptographic security engine (`CryptoService`) utilizing authenticated AES-256-GCM and PBKDF2 (10,000 iterations).
- Self-contained encrypted backup container format (`TABBY_ENC_V1`) with 16-byte fast verifier block allowing zero-overhead password match verification without decrypting full payloads.
- Real-time encryption verification badges in backup tables (`📄 Plain`, `🔓 Encrypted (OK)`, `🔒 Encrypted (Other Key)`).
- Safe Master Password workflow with current password verification, confirmation match indicator, eye toggles, and optional batch re-encryption of existing local snapshots.
- Historic password restore workflow: prompt modal allowing restoration of snapshots created under earlier master passwords.
- Confirmation dialog (`PlatformService.showMessageBox`) before configuration restore with notice of application restart.
- Automatic application relaunch (`HostAppService.relaunch()`) following snapshot restoration.
- Distinct `Pre-Restore` trigger classification and visual badge for safety snapshots.
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
- Fixed contrast and background color issues in Security settings panel to conform to Tabby dark theme styling.
- Fixed header parsing in `CryptoService.checkPassword` to extract metadata from snippet buffers without failing `JSON.parse`, eliminating false "Encrypted (Other Key)" badges.
- Fixed snapshot restore engine to preserve active `syncAndBackup` settings, ensuring master encryption passwords and credentials are never erased when restoring older configurations.
- Fixed safety backup trigger naming to `Pre-Restore` instead of `Pre-Sync`.
- Fixed snapshot table layout and button wrapping with strict `white-space: nowrap`, fixed column sizing, and inline flex action groups.
- Fixed `<select>` two-way data binding in Settings (`maxBackupsToKeep`, `syncIntervalMinutes`, `syncProvider`) by utilizing Angular `[(ngModel)]` with `[ngValue]` directives.
- Added immediate retention policy rotation on saving settings with modified `maxBackupsToKeep`.

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
