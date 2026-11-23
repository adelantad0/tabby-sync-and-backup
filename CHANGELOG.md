# Changelog

All notable changes to the **Tabby Sync & Backup** (`tabby-sync-and-backup`) plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

## [0.6.5] - 2026-11-23

### Fixed
- **Resolved Fatal Boot Race Condition With Native Tabby Config Encryption**:
  - **Awaited `config.ready$`**: `SyncAndBackupModule` now subscribes to `this.config.ready$.toPromise()` before starting `SyncEngineService`. Previously, the module constructor initialized `SyncEngineService` synchronously during Angular bootstrap before Tabby core had completed decryption and populated `config.store`.
  - **Eliminated Config Store Clobbering**: Removed `this.ensureConfigRoot()` which assigned `this.config.store = {}` when accessed prior to config readiness, destroying Tabby's native `ConfigProxy` and corrupting the vault decryption flow.
  - **Removed Background `config.save()` on Local Backups**: Removed `await this.config.save()` from `createLocalBackup()`. Updating `lastBackupAt` is now strictly in-memory and does not write to `config.yaml` on disk, preventing `hostApp.configChangeBroadcast$` from triggering redundant `config.load()` cycles that asked for the passphrase twice and failed with `Received undefined`.
  - **Transient Device Identity**: `DeviceIdentityService` now uses a stable transient UUID if queried before Tabby's store is ready, eliminating all premature mutations.

### Fixed
- **Root Cause of Duplicate Startup Passphrase & Decryption Crash**:
  - Removed passive `config.save()` calls inside `DeviceIdentityService.getDeviceId()` and `getDeviceName()`. Previously, during plugin initialization on startup, these getters triggered an immediate configuration disk save, which fired Tabby's `hostApp.configChangeBroadcast$`, causing Tabby to immediately trigger an unprompted nested `config.load()` while the window was still booting, resulting in duplicate password prompts and `TypeError [ERR_INVALID_ARG_TYPE]: Received undefined`.
  - Device identity is now safely resolved and stored in-memory without prematurely writing to disk on boot.

## [0.6.3] - 2026-11-23

### Fixed
- **Native Tabby Vault & "Encrypt config file" Full Compatibility**:
  - Removed intrusive `store.encrypted = false` mutation and startup `config.save()` call from `SyncEngineService.init()`, eliminating the recursive `configChangeBroadcast$` reload race condition that triggered duplicate passphrase dialogs and caused Tabby to crash with `TypeError: ... Received undefined`.
  - Removed root `encrypted: true` stripping from `sanitizeConfigYaml`, `restoreLocalBackup`, and `restoreRemoteBackup`, allowing Tabby's native full-config encryption to coexist seamlessly with the plugin.

## [0.6.2] - 2026-11-23

### Fixed
- **Startup Crash Loop & Rogue Config Encryption Protection**:
  - Automatically detect and neutralize Tabby's native `store.encrypted=true` flag on plugin initialization to prevent Tabby from bricking with an unhandled `TypeError [ERR_INVALID_ARG_TYPE] (Received undefined)` startup crash loop when passphrase prompt is cancelled or keychain is unavailable.
  - Added YAML sanitization (`sanitizeConfigYaml`) across all local and remote snapshot creations and restores to guarantee root-level `encrypted: true` flags are stripped before writing to `config.yaml`.
  - Added strict parameter validation in `CryptoService` (`isEncrypted`, `encrypt`, `decrypt`, `checkPassword`, `parseContainer`) ensuring non-string, `null`, or `undefined` inputs throw clean typed errors instead of crashing Node.js runtime crypto primitives.
  - Automatically persist user-entered restore passwords into `config.store.syncAndBackup` so restoring from an empty/erased config preserves master encryption keys without requiring manual reconfiguration.

### Added
- **Disaster Recovery UI & Automated Notification**:
  - Added prominent Disaster Recovery banner in the **Backups** tab (`Settings -> Sync & Backup -> Backups`) when active configuration has 0 profiles but historical snapshots exist on disk, featuring a one-click `🚑 Quick Restore Latest Snapshot` action.
  - Emitted automatic startup recovery notifications when empty profile sets are detected after application reset or "Erase config".
  - Synchronized new translation keys across English, Russian, and Simplified Chinese dictionaries.

## [0.6.1] - 2026-11-23

### Changed
- **In-App Navigation to Installed Plugins on Update**:
  - The update action button in the **About** tab now navigates directly to Tabby's native **Installed Plugins** settings tab (`Settings -> Plugins -> Installed`), enabling one-click upgrades via Tabby's plugin manager instead of redirecting externally to GitHub.
  - Retained an optional secondary link to GitHub Release Notes.
  - Added localized strings for update notices and navigation buttons across English, Russian, and Simplified Chinese.

## [0.6.0] - 2026-11-23

### Added
- **Official Documentation Website (VitePress)**:
  - Launched static documentation website hosted on GitHub Pages (`https://adelantad0.github.io/tabby-sync-and-backup/`).
  - Native tri-lingual localization across English, Russian, and Simplified Chinese with instant switcher.
  - Custom visual aesthetic inspired by [tabby.sh](https://tabby.sh/) with Inter & JetBrains Mono fonts and glowing purple-indigo styling.
  - Comprehensive user guides: Getting Started, How Sync Works (Device-Per-File architecture), Security & E2EE (AES-256-GCM + PBKDF2), Storage Providers (WebDAV, Local Cloud Folders), and Backups & 1-Click Recovery.
- **In-App Documentation Access**:
  - Added dedicated `🌐 Documentation` button in the plugin's **Settings -> About** tab.
  - Added localized translation keys (`SYNC_BACKUP.ABOUT.DOCUMENTATION`) for English, Russian, and Simplified Chinese.
- **Automated Deployment CI/CD**:
  - Added GitHub Actions workflow (`deploy-docs.yml`) for automatic site building and deployment upon push.
- **Badges and Metadata**:
  - Added documentation and npm status badges across `README.md`, `README.ru-RU.md`, and `README.zh-CN.md`.
  - Updated `homepage` in `package.json` to point directly to the documentation website.

## [0.5.2] - 2026-11-22

### Fixed
- **Key Epoch Rotation & Password Change Deadlock**:
  - Prevented synchronization failure when a remote peer in the cluster is on an older key epoch (`remoteEpoch < localEpoch`). The local device now skips unreadable outdated peer payloads without aborting, allowing it to complete its sync cycle and publish its newer encrypted state (`localEpoch`) to the cloud.
  - Excluded the local device's own state file from the remote peer decryption list in `fetchClusterDeviceStates()`.
  - Properly reset password error state and error banners upon sync start and successful completion.
  - Fixed variable interpolation in `t()` to prevent `"undefined"` placeholder values in unlock banners.

## [0.5.1] - 2026-11-22

### Changed
- **Default Sync Triggers Optimization**:
  - Refined default automation triggers upon plugin installation and initial activation:
    - `syncOnStartup` (Tabby startup): **Enabled** (`true`)
    - `syncOnConfigChange` (Configuration change): **Enabled** (`true`)
    - `syncOnFocus` (Window focus): **Disabled** (`false`)
    - `periodicSync` (Periodic interval): **Disabled** (`false`)
  - When the user enables automated synchronization for the first time, exactly the two essential triggers (startup and config change) are selected by default.

## [0.5.0] - 2026-11-22

### Added
- **Config Change Automation Trigger (`syncOnConfigChange`)**:
  - Automatically triggers synchronization when Tabby configuration changes (profiles, groups, vault, or color schemes).
  - Integrated 3.5s debounce and deterministic SHA-256 entity hash comparison to prevent redundant sync requests and avoid infinite loops.
  - Full internationalization support across English, Russian, and Simplified Chinese (`src/i18n/`).

### Changed
- **Automation UI Labels Clarification**:
  - Renamed the master automation switch to "Enable automated synchronization" (`AUTOMATION_ENABLE`) to clearly distinguish it from the periodic timer trigger.

## [0.4.2] - 2026-11-22

### Changed
- **Sync Tab Layout Reordering**:
  - Reorganized configuration cards in the Sync tab into an intuitive sequence:
    1. Storage Provider Configuration
    2. Selective Synchronization
    3. Synchronization Automation & Schedule (Triggers)
    4. Device Identity
    5. Connected Cluster Devices
- **Sticky Floating Save Bar**:
  - Pinned the Save Bar to the top of the viewport (`position: sticky; top: 0`) when unsaved changes exist (`isDirty`), keeping save and discard actions always in sight when scrolling.
  - Automatically hidden when all changes are saved or discarded.
  - Improved visual polish: solid theme background, unified button heights and padding, fixed button text wrapping (`text-nowrap`), and resolved duplicate emoji formatting.
- **Unsaved Changes Guard on Tab Navigation**:
  - Added confirmation dialog when attempting to switch between settings tabs with unsaved changes, offering options to save, discard, or cancel.

## [0.4.1] - 2026-11-22

### Added
- **Device-Isolated Remote Backups**:
  - Remote backups are now segregated per device under `backups/<deviceId>/` for both Local Folder and WebDAV sync providers.
  - Added device selector dropdown in the Remote Snapshots view to inspect and restore backups from specific devices or view all devices together (`🌐 All Devices`).
  - Added friendly device name resolution via `cluster.json` registry.

### Fixed
- **Remote Backups Cache on Sync Path Change**:
  - Automatically reload remote snapshots and update storage target description immediately upon saving sync settings or initializing the tab, eliminating stale backups display when switching paths.
- **Cross-Device Retention Safety**:
  - Remote retention auto-rotation (`rotateRemoteBackups`) now strictly operates on snapshots generated by the current device, preventing cluster machines from pruning each other's backups.
- **Backward Compatibility**:
  - Legacy backups previously stored directly at `backups/` root remain discoverable, viewable, and restorable.

## [0.4.0] - 2026-11-22

### Added
- **Full Internationalization & Localization (i18n)**:
  - Added native multi-language support covering English (`en-US`), Russian (`ru-RU`), and Simplified Chinese (`zh-CN`).
  - Implemented modular dictionary infrastructure in `src/i18n/` (`en.ts`, `ru.ts`, `zh-cn.ts`, `index.ts`).
  - Integrated `TranslateService` across all settings tabs, status badges, banners, buttons, placeholders, notifications, hotkeys, and the toolbar button.
  - Added localized GitHub documentation (`README.md`, `README.ru-RU.md`, `README.zh-CN.md`) with language switcher badges.
  - Updated AI agent development rules (`SKILL.md` and `.agents/rules/tabby-plugin.md`) to enforce synchronous dictionary and documentation updates during future development.


## [0.3.4] - 2026-11-22

### Changed
- **Changelog UI**:
  - Added a bounded scrollable container with customized dark-themed scrollbars for the Changelog block in the About tab (`max-height: 400px`), preventing excessive page height.

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
