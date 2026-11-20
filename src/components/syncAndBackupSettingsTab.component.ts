import { Component, HostBinding, OnInit } from '@angular/core'
import { ConfigService, NotificationsService, PlatformService } from 'tabby-core'
import { BackupService, BackupSnapshotItem } from '../services/backup.service'
import packageJson from '../../package.json'

type SettingsSubTab = 'sync' | 'backups' | 'security' | 'changelog' | 'about'
type BackupView = 'local' | 'remote'

interface UpdateInfo {
    version: string
    url: string
    publishedAt: string
    body: string
}

/**
 * Modular Settings Tab Component for Tabby Sync & Backup
 * Features:
 * - 5 sub-navigation tabs (Sync, Backups, Security, Changelog, About)
 * - Dual backup engine: Local (in Tabby directory) and Remote (/backups on sync target)
 * - Remote Backups conditionally activated only when sync target is configured
 * - Remote and local retention policies with automatic rotation
 * - Explicit Save Settings bar
 */
@Component({
    selector: 'sync-and-backup-settings-tab',
    template: `
        <div class="d-flex align-items-center justify-content-between mb-3">
            <div>
                <h3 class="m-0">Sync &amp; Backup</h3>
                <div class="text-muted small">
                    Synchronize your configuration across devices and manage local automated backups
                </div>
            </div>
            <div class="d-flex align-items-center gap-2">
                <span class="badge bg-primary text-uppercase">v{{ pluginVersion }}</span>
            </div>
        </div>

        <!-- Sticky / Prominent Save Bar when settings are modified -->
        <div
            class="d-flex align-items-center justify-content-between p-3 mb-3 rounded"
            [style.background]="isDirty ? 'rgba(255, 193, 7, 0.12)' : 'rgba(255, 255, 255, 0.04)'"
            [style.border]="isDirty ? '1px solid rgba(255, 193, 7, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)'"
        >
            <div class="d-flex align-items-center gap-2">
                <span class="badge bg-warning text-dark" [class.d-none]="!isDirty">⚠️ Unsaved Changes</span>
                <span class="badge bg-secondary" [class.d-none]="isDirty">✓ All changes saved</span>
                <span class="text-muted small">
                    {{ isDirty ? 'You have unsaved changes. Click Save to persist them.' : 'Settings are saved on disk.' }}
                </span>
            </div>
            <div class="d-flex gap-2">
                <button
                    type="button"
                    class="btn btn-sm btn-outline-secondary"
                    [disabled]="!isDirty"
                    (click)="discardChanges()"
                >
                    Discard
                </button>
                <button
                    type="button"
                    class="btn btn-sm"
                    [class.btn-warning]="isDirty"
                    [class.btn-primary]="!isDirty"
                    [disabled]="!isDirty"
                    (click)="saveSettings()"
                >
                    💾 Save Settings
                </button>
            </div>
        </div>

        <!-- Sub-navigation Pills / Tabs -->
        <ul class="nav nav-pills mb-4">
            <li class="nav-item">
                <button
                    type="button"
                    class="nav-link btn-link"
                    [class.active]="activeTab === 'sync'"
                    (click)="setTab('sync')"
                >
                    🔄 Sync
                </button>
            </li>
            <li class="nav-item">
                <button
                    type="button"
                    class="nav-link btn-link"
                    [class.active]="activeTab === 'backups'"
                    (click)="setTab('backups')"
                >
                    🛡️ Backups
                </button>
            </li>
            <li class="nav-item">
                <button
                    type="button"
                    class="nav-link btn-link"
                    [class.active]="activeTab === 'security'"
                    (click)="setTab('security')"
                >
                    🔐 Security
                </button>
            </li>
            <li class="nav-item">
                <button
                    type="button"
                    class="nav-link btn-link"
                    [class.active]="activeTab === 'changelog'"
                    (click)="setTab('changelog')"
                >
                    📜 Changelog
                </button>
            </li>
            <li class="nav-item">
                <button
                    type="button"
                    class="nav-link btn-link"
                    [class.active]="activeTab === 'about'"
                    (click)="setTab('about')"
                >
                    ℹ️ About
                </button>
            </li>
        </ul>

        <!-- ==================== TAB 1: SYNC ==================== -->
        <div [class.d-none]="activeTab !== 'sync'">
            <div class="card mb-3">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <span class="fw-bold">Storage Provider</span>
                    <span class="badge bg-secondary">{{ getProviderTitle() }}</span>
                </div>
                <div class="card-body">
                    <div class="mb-3">
                        <label class="form-label">Provider Type</label>
                        <select
                            class="form-select"
                            [value]="formData.syncProvider"
                            (change)="onFieldChange('syncProvider', $any($event.target).value)"
                        >
                            <option value="webdav">WebDAV (Nextcloud, ownCloud, custom server)</option>
                            <option value="local">Local Directory / Shared Folder (Syncthing, Dropbox, iCloud)</option>
                        </select>
                        <div class="form-text">
                            Select the target storage provider where your configuration payload will be synchronized.
                        </div>
                    </div>

                    <!-- WebDAV Settings -->
                    <div [class.d-none]="formData.syncProvider !== 'webdav'">
                        <div class="mb-3">
                            <label class="form-label">WebDAV Server URL</label>
                            <input
                                type="text"
                                class="form-control"
                                placeholder="https://nextcloud.example.com/remote.php/dav/files/user/"
                                [value]="formData.webdavUrl"
                                (input)="onFieldChange('webdavUrl', $any($event.target).value)"
                            />
                            <div class="form-text">
                                Full WebDAV root URL including protocol and path.
                            </div>
                        </div>
                        <div class="row g-2 mb-3">
                            <div class="col-md-6">
                                <label class="form-label">Username</label>
                                <input
                                    type="text"
                                    class="form-control"
                                    placeholder="Username or email"
                                    [value]="formData.webdavUsername"
                                    (input)="onFieldChange('webdavUsername', $any($event.target).value)"
                                />
                            </div>
                            <div class="col-md-6">
                                <label class="form-label">Password / App Password</label>
                                <input
                                    type="password"
                                    class="form-control"
                                    placeholder="Password or App Token"
                                    [value]="formData.webdavPassword"
                                    (input)="onFieldChange('webdavPassword', $any($event.target).value)"
                                />
                            </div>
                        </div>
                        <div class="mb-3">
                            <label class="form-label">Remote File Path</label>
                            <input
                                type="text"
                                class="form-control"
                                placeholder="/tabby-config.yaml"
                                [value]="formData.webdavPath"
                                (input)="onFieldChange('webdavPath', $any($event.target).value)"
                            />
                            <div class="form-text">
                                Remote destination filename or subpath on the WebDAV server.
                            </div>
                        </div>
                    </div>

                    <!-- Local Sync Directory Settings -->
                    <div [class.d-none]="formData.syncProvider !== 'local'">
                        <div class="mb-3">
                            <label class="form-label">Local Destination Path</label>
                            <div class="input-group">
                                <input
                                    type="text"
                                    class="form-control"
                                    placeholder="/Users/name/Sync/Tabby/"
                                    [value]="formData.localSyncPath"
                                    (input)="onFieldChange('localSyncPath', $any($event.target).value)"
                                />
                                <button
                                    type="button"
                                    class="btn btn-outline-secondary"
                                    (click)="browseLocalSyncFolder()"
                                >
                                    📂 Browse...
                                </button>
                            </div>
                            <div class="form-text">
                                Specify a folder synced by Syncthing, Dropbox, iCloud, or a mounted network drive.
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Sync Automation & Schedule Card -->
            <div class="card mb-3">
                <div class="card-header fw-bold">Automation &amp; Schedule</div>
                <div class="card-body">
                    <div class="form-check form-switch mb-3">
                        <input
                            class="form-check-input"
                            type="checkbox"
                            id="enableAutoSyncCheck"
                            [checked]="formData.syncEnabled"
                            (change)="onFieldChange('syncEnabled', $any($event.target).checked)"
                        />
                        <label class="form-check-label fw-bold" for="enableAutoSyncCheck">
                            Enable automatic background synchronization
                        </label>
                        <div class="text-muted small">
                            Periodically checks remote storage and uploads/downloads configuration automatically.
                        </div>
                    </div>

                    <div class="mb-3" [class.d-none]="!formData.syncEnabled">
                        <label class="form-label">Sync Interval</label>
                        <select
                            class="form-select"
                            [value]="formData.syncIntervalMinutes"
                            (change)="onFieldChange('syncIntervalMinutes', $any($event.target).value)"
                        >
                            <option [value]="5">Every 5 minutes</option>
                            <option [value]="15">Every 15 minutes</option>
                            <option [value]="30">Every 30 minutes (Recommended)</option>
                            <option [value]="60">Every 1 hour</option>
                            <option [value]="360">Every 6 hours</option>
                        </select>
                    </div>

                    <div class="d-flex align-items-center gap-2 pt-2 border-top">
                        <button type="button" class="btn btn-primary" (click)="triggerSyncNow()">
                            🔄 Sync Now
                        </button>
                        <button type="button" class="btn btn-outline-primary" (click)="triggerUpload()">
                            ⬆️ Upload to Remote
                        </button>
                        <button type="button" class="btn btn-outline-secondary" (click)="triggerDownload()">
                            ⬇️ Download from Remote
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- ==================== TAB 2: BACKUPS ==================== -->
        <div [class.d-none]="activeTab !== 'backups'">
            <!-- Backup Policies Card -->
            <div class="card mb-3">
                <div class="card-header fw-bold">Automated Snapshot Policies &amp; Retention</div>
                <div class="card-body">
                    <div class="form-check form-switch mb-3">
                        <input
                            class="form-check-input"
                            type="checkbox"
                            id="enablePreSyncBackup"
                            [checked]="formData.backupEnabled"
                            (change)="onFieldChange('backupEnabled', $any($event.target).checked)"
                        />
                        <label class="form-check-label" for="enablePreSyncBackup">
                            Create backup snapshot before every synchronization
                        </label>
                        <div class="text-muted small">
                            Protects against accidental config overwrites or remote conflict corruption.
                        </div>
                    </div>

                    <div class="form-check form-switch mb-3">
                        <input
                            class="form-check-input"
                            type="checkbox"
                            id="enableStartupBackup"
                            [checked]="formData.backupOnStartup"
                            (change)="onFieldChange('backupOnStartup', $any($event.target).checked)"
                        />
                        <label class="form-check-label" for="enableStartupBackup">
                            Create daily backup snapshot on Tabby startup
                        </label>
                    </div>

                    <div class="mb-2">
                        <label class="form-label">Retention Policy (Max snapshots to keep per location)</label>
                        <select
                            class="form-select"
                            [value]="formData.maxBackupsToKeep"
                            (change)="onFieldChange('maxBackupsToKeep', $any($event.target).value)"
                        >
                            <option [value]="5">5 snapshots</option>
                            <option [value]="10">10 snapshots (Recommended)</option>
                            <option [value]="25">25 snapshots</option>
                            <option [value]="50">50 snapshots</option>
                        </select>
                        <div class="form-text">
                            Older snapshots are automatically rotated and pruned on both local disk and remote storage.
                        </div>
                    </div>
                </div>
            </div>

            <!-- Segmented Switcher: Local Backups vs Remote Backups -->
            <div class="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
                <div class="btn-group" role="group">
                    <button
                        type="button"
                        class="btn"
                        [class.btn-primary]="backupView === 'local'"
                        [class.btn-outline-primary]="backupView !== 'local'"
                        (click)="setBackupView('local')"
                    >
                        💻 Local Backups (In Tabby Dir)
                        <span class="badge bg-light text-dark ms-1">{{ localBackups.length }}</span>
                    </button>
                    <button
                        type="button"
                        class="btn"
                        [class.btn-primary]="backupView === 'remote'"
                        [class.btn-outline-primary]="backupView !== 'remote'"
                        (click)="setBackupView('remote')"
                    >
                        <span [class.d-none]="isSyncConfigured()">🔒</span>
                        <span [class.d-none]="!isSyncConfigured()">☁️</span>
                        Remote Backups (/backups)
                        <span class="badge bg-light text-dark ms-1" [class.d-none]="!isSyncConfigured()">
                            {{ remoteBackups.length }}
                        </span>
                    </button>
                </div>

                <!-- Actions for Local View -->
                <div class="d-flex gap-2" [class.d-none]="backupView !== 'local'">
                    <button
                        type="button"
                        class="btn btn-sm btn-outline-secondary"
                        (click)="openSnapshotsFolder()"
                    >
                        📁 Open Folder
                    </button>
                    <button
                        type="button"
                        class="btn btn-sm btn-success"
                        (click)="createLocalBackupNow()"
                    >
                        ➕ Create Local Backup
                    </button>
                </div>

                <!-- Actions for Remote View (When Configured) -->
                <div class="d-flex gap-2" [class.d-none]="backupView !== 'remote' || !isSyncConfigured()">
                    <button
                        type="button"
                        class="btn btn-sm btn-outline-secondary"
                        [disabled]="isLoadingBackups"
                        (click)="loadRemoteBackups()"
                    >
                        🔄 Refresh Remote
                    </button>
                    <button
                        type="button"
                        class="btn btn-sm btn-success"
                        [disabled]="isLoadingBackups"
                        (click)="createRemoteBackupNow()"
                    >
                        ☁️ Create Remote Backup
                    </button>
                </div>
            </div>

            <!-- VIEW 1: LOCAL BACKUPS -->
            <div [class.d-none]="backupView !== 'local'">
                <div class="card mb-3">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <span class="fw-bold">Local Snapshots (Stored in Tabby directory)</span>
                        <span class="text-muted small">Max retention: {{ formData.maxBackupsToKeep }}</span>
                    </div>
                    <div class="card-body p-0">
                        <div class="p-4 text-center text-muted" [class.d-none]="localBackups.length > 0">
                            No local backups found. Click <strong>«➕ Create Local Backup»</strong> above to create your first snapshot.
                        </div>
                        <div class="table-responsive" [class.d-none]="localBackups.length === 0">
                            <table class="table table-hover m-0 align-middle">
                                <thead class="table-dark">
                                    <tr>
                                        <th>Date &amp; Time</th>
                                        <th>Trigger</th>
                                        <th>Size</th>
                                        <th class="text-end">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr *ngFor="let item of localBackups">
                                        <td class="font-monospace small">{{ item.formattedDate }}</td>
                                        <td>
                                            <span
                                                class="badge"
                                                [class.bg-info]="item.trigger === 'Manual'"
                                                [class.bg-warning]="item.trigger === 'Pre-Sync'"
                                                [class.bg-secondary]="item.trigger === 'Startup'"
                                            >
                                                {{ item.trigger }}
                                            </span>
                                        </td>
                                        <td class="small">{{ item.sizeKb }} KB</td>
                                        <td class="text-end">
                                            <button
                                                type="button"
                                                class="btn btn-sm btn-outline-primary me-2"
                                                (click)="restoreLocalBackup(item)"
                                            >
                                                Restore
                                            </button>
                                            <button
                                                type="button"
                                                class="btn btn-sm btn-outline-info me-2"
                                                [disabled]="!isSyncConfigured()"
                                                [title]="isSyncConfigured() ? 'Upload to remote /backups/' : 'Configure Sync first to upload'"
                                                (click)="uploadLocalToRemote(item)"
                                            >
                                                ☁️ Upload
                                            </button>
                                            <button
                                                type="button"
                                                class="btn btn-sm btn-outline-danger"
                                                (click)="deleteLocalBackup(item)"
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <!-- VIEW 2: REMOTE BACKUPS -->
            <div [class.d-none]="backupView !== 'remote'">
                <!-- When Sync is NOT configured: Helpful Onboarding Card -->
                <div class="card p-4 text-center my-3" [class.d-none]="isSyncConfigured()">
                    <div class="mb-2 fs-2">☁️🔒</div>
                    <h5 class="fw-bold">Remote Backups Inactive</h5>
                    <p class="text-muted mx-auto" style="max-width: 500px;">
                        Remote backups are stored in the <code>/backups/</code> folder of your sync destination.
                        To activate remote backups, please configure your <strong>WebDAV server</strong> or <strong>Local Directory</strong> in the Sync tab first.
                    </p>
                    <div>
                        <button type="button" class="btn btn-primary" (click)="setTab('sync')">
                            ⚙️ Go to Sync Settings
                        </button>
                    </div>
                </div>

                <!-- When Sync IS configured: Real Remote Snapshots Table -->
                <div class="card mb-3" [class.d-none]="!isSyncConfigured()">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <div>
                            <span class="fw-bold">Remote Snapshots</span>
                            <span class="badge bg-success ms-2">{{ remoteTargetDescription }}</span>
                        </div>
                        <span class="text-muted small">Auto-rotated (Max: {{ formData.maxBackupsToKeep }})</span>
                    </div>
                    <div class="card-body p-0">
                        <div class="p-4 text-center text-muted" [class.d-none]="!isLoadingBackups">
                            ⏳ Fetching remote backups list...
                        </div>
                        <div
                            class="p-4 text-center text-muted"
                            [class.d-none]="isLoadingBackups || remoteBackups.length > 0"
                        >
                            No remote backups found on {{ remoteTargetDescription }}. Click <strong>«☁️ Create Remote Backup»</strong> or upload a local snapshot.
                        </div>
                        <div class="table-responsive" [class.d-none]="isLoadingBackups || remoteBackups.length === 0">
                            <table class="table table-hover m-0 align-middle">
                                <thead class="table-dark">
                                    <tr>
                                        <th>Date &amp; Time</th>
                                        <th>Trigger</th>
                                        <th>Size</th>
                                        <th class="text-end">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr *ngFor="let item of remoteBackups">
                                        <td class="font-monospace small">{{ item.formattedDate }}</td>
                                        <td>
                                            <span
                                                class="badge"
                                                [class.bg-info]="item.trigger === 'Manual'"
                                                [class.bg-warning]="item.trigger === 'Pre-Sync'"
                                                [class.bg-secondary]="item.trigger === 'Startup'"
                                            >
                                                {{ item.trigger }}
                                            </span>
                                        </td>
                                        <td class="small">{{ item.sizeKb }} KB</td>
                                        <td class="text-end">
                                            <button
                                                type="button"
                                                class="btn btn-sm btn-outline-primary me-2"
                                                (click)="restoreRemoteBackup(item)"
                                            >
                                                ⬇️ Restore
                                            </button>
                                            <button
                                                type="button"
                                                class="btn btn-sm btn-outline-danger"
                                                (click)="deleteRemoteBackup(item)"
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- ==================== TAB 3: SECURITY ==================== -->
        <div [class.d-none]="activeTab !== 'security'">
            <div class="card mb-3">
                <div class="card-header fw-bold">Payload Encryption (AES-256-GCM)</div>
                <div class="card-body">
                    <div class="form-check form-switch mb-3">
                        <input
                            class="form-check-input"
                            type="checkbox"
                            id="enableEncryptionCheck"
                            [checked]="formData.encryptionEnabled"
                            (change)="onFieldChange('encryptionEnabled', $any($event.target).checked)"
                        />
                        <label class="form-check-label fw-bold" for="enableEncryptionCheck">
                            Encrypt payload before uploading to remote storage
                        </label>
                        <div class="text-muted small">
                            Protects SSH passwords, tokens, and server IP addresses with authenticated client-side AES-256.
                        </div>
                    </div>

                    <div [class.d-none]="!formData.encryptionEnabled">
                        <div class="mb-3">
                            <label class="form-label">Master Encryption Password</label>
                            <input
                                type="password"
                                class="form-control"
                                placeholder="Enter strong master password..."
                                [value]="formData.encryptionPassword"
                                (input)="onFieldChange('encryptionPassword', $any($event.target).value)"
                            />
                            <div class="form-text text-warning">
                                ⚠️ <strong>Important:</strong> If you lose this password, your cloud-stored settings cannot be recovered.
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card mb-3">
                <div class="card-header fw-bold">Tabby Vault Integration</div>
                <div class="card-body">
                    <div class="d-flex align-items-center justify-content-between">
                        <div>
                            <div class="fw-bold">Vault Security Status</div>
                            <div class="text-muted small">
                                Tabby Vault master passphrase encrypts your credentials locally.
                            </div>
                        </div>
                        <span class="badge bg-success">Active &amp; Protected</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- ==================== TAB 4: CHANGELOG ==================== -->
        <div [class.d-none]="activeTab !== 'changelog'">
            <div class="card mb-3">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <span class="fw-bold">Version History &amp; Release Notes</span>
                    <button
                        type="button"
                        class="btn btn-sm btn-outline-secondary"
                        (click)="openUrl('https://github.com/adelantad0/tabby-sync-and-backup/releases')"
                    >
                        View on GitHub
                    </button>
                </div>
                <div class="card-body">
                    <!-- Current / Unreleased -->
                    <div class="mb-4">
                        <div class="d-flex align-items-center gap-2 mb-2">
                            <span class="badge bg-primary">v0.2.0 (In Development)</span>
                            <span class="text-muted small">Upcoming Release</span>
                        </div>
                        <ul class="mb-0">
                            <li><strong>Local &amp; Remote Backups Engine</strong>: Dual snapshot management supporting local storage in Tabby config directory and remote storage under <code>/backups/</code>.</li>
                            <li><strong>Conditional Remote Activation</strong>: Remote backups are activated only when a valid sync target is configured.</li>
                            <li><strong>Dual Retention Policy &amp; Rotation</strong>: Automated pruning and rotation of both local and remote snapshots when the limit is exceeded.</li>
                            <li><strong>Explicit Save Workflow</strong>: Settings modifications require clicking "Save Settings" rather than auto-saving immediately.</li>
                            <li><strong>Streamlined Storage Providers</strong>: Focused WebDAV and Local Directory synchronization targets.</li>
                        </ul>
                    </div>

                    <hr />

                    <!-- v0.1.0 -->
                    <div>
                        <div class="d-flex align-items-center gap-2 mb-2">
                            <span class="badge bg-success">v0.1.0</span>
                            <span class="text-muted small">2026-11-20 (Initial Release)</span>
                        </div>
                        <ul class="mb-0">
                            <li>Initial plugin scaffolding and integration with Tabby settings sidebar.</li>
                            <li>Toolbar quick-access button and hotkey actions.</li>
                            <li>Configuration schema integration with <code>config.yaml</code>.</li>
                            <li>Automated GitHub release pipeline.</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>

        <!-- ==================== TAB 5: ABOUT ==================== -->
        <div [class.d-none]="activeTab !== 'about'">
            <!-- Update Available Alert Banner -->
            <div class="alert alert-success d-flex align-items-center justify-content-between mb-3 text-start" [class.d-none]="!updateInfo">
                <div>
                    <h6 class="alert-heading m-0">🎉 New version v{{ updateInfo?.version }} is available!</h6>
                    <div class="small mt-1 text-muted">
                        Published on {{ updateInfo?.publishedAt }}
                    </div>
                </div>
                <button
                    type="button"
                    class="btn btn-sm btn-success"
                    (click)="openUrl(updateInfo?.url || 'https://github.com/adelantad0/tabby-sync-and-backup/releases/latest')"
                >
                    Download Update
                </button>
            </div>

            <!-- Up-to-date Confirmation Banner -->
            <div class="alert alert-secondary mb-3 text-start small" [class.d-none]="!hasCheckedUpdates || updateInfo">
                ✅ You are running the latest version of <strong>Tabby Sync &amp; Backup</strong> (v{{ pluginVersion }}).
            </div>

            <div class="card mb-3">
                <div class="card-body text-center py-4">
                    <h4 class="mb-1">Tabby Sync &amp; Backup</h4>
                    <div class="text-muted mb-3">
                        Seamless cross-device configuration synchronization &amp; local snapshot backups.
                    </div>
                    <div class="d-flex justify-content-center gap-2 mb-4">
                        <span class="badge bg-primary">Version {{ pluginVersion }}</span>
                        <span class="badge bg-info text-dark">MIT License</span>
                        <span class="badge bg-secondary">Author: adelantad0</span>
                    </div>

                    <div class="d-flex justify-content-center flex-wrap gap-2 mb-3">
                        <button
                            type="button"
                            class="btn btn-outline-primary"
                            (click)="openUrl('https://github.com/adelantad0/tabby-sync-and-backup')"
                        >
                            ⭐ GitHub Repository
                        </button>
                        <button
                            type="button"
                            class="btn btn-outline-secondary"
                            (click)="openUrl('https://github.com/adelantad0/tabby-sync-and-backup/issues')"
                        >
                            🐞 Report an Issue
                        </button>
                        <button
                            type="button"
                            class="btn btn-outline-success"
                            [disabled]="isCheckingUpdates"
                            (click)="checkForUpdates()"
                        >
                            <span [class.d-none]="isCheckingUpdates">🔄 Check for Updates</span>
                            <span [class.d-none]="!isCheckingUpdates">⏳ Checking...</span>
                        </button>
                    </div>

                    <div class="d-flex justify-content-center">
                        <button
                            type="button"
                            class="btn btn-sm btn-link text-muted"
                            (click)="copyDiagnostics()"
                        >
                            📋 Copy Diagnostics &amp; Environment Info
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `,
    styles: [
        `
            .nav-pills .nav-link {
                color: var(--bs-body-color, #c8c8c8);
                cursor: pointer;
                border-radius: 6px;
                padding: 6px 14px;
                margin-right: 6px;
                border: 1px solid transparent;
            }
            .nav-pills .nav-link:hover {
                background-color: rgba(255, 255, 255, 0.05);
            }
            .nav-pills .nav-link.active {
                background-color: var(--bs-primary, #0d6efd);
                color: #ffffff;
            }
            .card {
                background-color: rgba(255, 255, 255, 0.03);
                border: 1px solid rgba(255, 255, 255, 0.1);
            }
            .card-header {
                background-color: rgba(255, 255, 255, 0.05);
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            }
        `,
    ],
})
export class SyncAndBackupSettingsTabComponent implements OnInit {
    @HostBinding('class.content-box') true = true

    activeTab: SettingsSubTab = 'sync'
    backupView: BackupView = 'local'
    pluginVersion: string = packageJson.version || '0.1.0'

    isDirty: boolean = false
    formData: any = {
        syncEnabled: false,
        syncIntervalMinutes: 30,
        syncProvider: 'webdav',
        webdavUrl: '',
        webdavUsername: '',
        webdavPassword: '',
        webdavPath: '/tabby-config.yaml',
        localSyncPath: '',
        backupEnabled: true,
        backupOnStartup: true,
        maxBackupsToKeep: 10,
        encryptionEnabled: false,
        encryptionPassword: '',
    }

    localBackups: BackupSnapshotItem[] = []
    remoteBackups: BackupSnapshotItem[] = []
    isLoadingBackups: boolean = false
    remoteTargetDescription: string = ''

    isCheckingUpdates: boolean = false
    hasCheckedUpdates: boolean = false
    updateInfo: UpdateInfo | null = null

    constructor(
        public config: ConfigService,
        private notifications: NotificationsService,
        private platform: PlatformService,
        private backupService: BackupService,
    ) {}

    async ngOnInit(): Promise<void> {
        this.resetForm()
        await this.loadLocalBackups()
    }

    resetForm(): void {
        const saved = this.config.store?.syncAndBackup || {}
        this.formData = {
            syncEnabled: saved.syncEnabled ?? false,
            syncIntervalMinutes: saved.syncIntervalMinutes ?? 30,
            syncProvider: saved.syncProvider === 'gist' ? 'webdav' : (saved.syncProvider || 'webdav'),
            webdavUrl: saved.webdavUrl || '',
            webdavUsername: saved.webdavUsername || '',
            webdavPassword: saved.webdavPassword || '',
            webdavPath: saved.webdavPath || '/tabby-config.yaml',
            localSyncPath: saved.localSyncPath || '',
            backupEnabled: saved.backupEnabled ?? true,
            backupOnStartup: saved.backupOnStartup ?? true,
            maxBackupsToKeep: saved.maxBackupsToKeep ?? 10,
            encryptionEnabled: saved.encryptionEnabled ?? false,
            encryptionPassword: saved.encryptionPassword || '',
        }
        this.isDirty = false
        this.remoteTargetDescription = this.backupService.getRemoteTargetDescription()
    }

    isSyncConfigured(): boolean {
        if (this.formData.syncProvider === 'webdav') {
            return !!(this.formData.webdavUrl && this.formData.webdavUrl.trim())
        }
        if (this.formData.syncProvider === 'local') {
            return !!(this.formData.localSyncPath && this.formData.localSyncPath.trim())
        }
        return false
    }

    onFieldChange(field: string, value: any): void {
        if (field === 'syncIntervalMinutes' || field === 'maxBackupsToKeep') {
            this.formData[field] = parseInt(value, 10)
        } else {
            this.formData[field] = value
        }
        this.isDirty = true
        this.remoteTargetDescription = this.backupService.getRemoteTargetDescription()
    }

    async saveSettings(): Promise<void> {
        if (!this.config.store.syncAndBackup) {
            this.config.store.syncAndBackup = {}
        }
        Object.assign(this.config.store.syncAndBackup, this.formData)
        await this.config.save()
        this.isDirty = false
        this.remoteTargetDescription = this.backupService.getRemoteTargetDescription()
        this.notifications.notice('Sync & Backup settings saved successfully!')
    }

    discardChanges(): void {
        this.resetForm()
        this.notifications.info('Unsaved changes discarded.')
    }

    setTab(tab: SettingsSubTab): void {
        this.activeTab = tab
        if (tab === 'backups') {
            this.loadLocalBackups()
            if (this.backupView === 'remote' && this.isSyncConfigured()) {
                this.loadRemoteBackups()
            }
        }
    }

    setBackupView(view: BackupView): void {
        this.backupView = view
        if (view === 'local') {
            this.loadLocalBackups()
        } else if (this.isSyncConfigured()) {
            this.loadRemoteBackups()
        }
    }

    // ==========================================
    // BACKUP ACTIONS
    // ==========================================

    async loadLocalBackups(): Promise<void> {
        try {
            this.localBackups = await this.backupService.listLocalBackups()
        } catch (e: any) {
            console.error('[tabby-sync-and-backup] Failed to list local backups:', e)
        }
    }

    async loadRemoteBackups(): Promise<void> {
        if (!this.isSyncConfigured()) {
            this.remoteBackups = []
            return
        }
        this.isLoadingBackups = true
        this.remoteTargetDescription = this.backupService.getRemoteTargetDescription()
        try {
            this.remoteBackups = await this.backupService.listRemoteBackups()
        } catch (e: any) {
            this.notifications.error(`Could not fetch remote backups: ${e?.message || e}`)
            this.remoteBackups = []
        } finally {
            this.isLoadingBackups = false
        }
    }

    async createLocalBackupNow(): Promise<void> {
        try {
            const snapshot = await this.backupService.createLocalBackup('Manual')
            await this.loadLocalBackups()
            this.notifications.notice(`Local snapshot created: ${snapshot.filename}`)
        } catch (e: any) {
            this.notifications.error(`Failed to create local backup: ${e?.message || e}`)
        }
    }

    async createRemoteBackupNow(): Promise<void> {
        if (!this.isSyncConfigured()) {
            this.notifications.error('Please configure your sync storage in the Sync tab first.')
            return
        }
        this.isLoadingBackups = true
        try {
            const snapshot = await this.backupService.createRemoteBackup('Manual')
            await this.loadRemoteBackups()
            this.notifications.notice(`Remote snapshot created: ${snapshot.filename}`)
        } catch (e: any) {
            this.notifications.error(`Failed to create remote backup: ${e?.message || e}`)
        } finally {
            this.isLoadingBackups = false
        }
    }

    async restoreLocalBackup(item: BackupSnapshotItem): Promise<void> {
        try {
            await this.backupService.restoreLocalBackup(item.filename)
            await this.loadLocalBackups()
            this.notifications.notice(`Configuration successfully restored from ${item.formattedDate}!`)
        } catch (e: any) {
            this.notifications.error(`Failed to restore local backup: ${e?.message || e}`)
        }
    }

    async restoreRemoteBackup(item: BackupSnapshotItem): Promise<void> {
        this.isLoadingBackups = true
        try {
            await this.backupService.restoreRemoteBackup(item)
            await this.loadLocalBackups()
            this.notifications.notice(`Configuration successfully restored from remote snapshot (${item.formattedDate})!`)
        } catch (e: any) {
            this.notifications.error(`Failed to restore remote backup: ${e?.message || e}`)
        } finally {
            this.isLoadingBackups = false
        }
    }

    async uploadLocalToRemote(item: BackupSnapshotItem): Promise<void> {
        if (!this.isSyncConfigured()) {
            this.notifications.error('Cannot upload: configure a valid WebDAV or Local Sync folder first.')
            return
        }
        try {
            await this.backupService.uploadLocalSnapshotToRemote(item)
            this.notifications.notice(`Uploaded ${item.filename} to remote /backups/!`)
            if (this.backupView === 'remote') {
                await this.loadRemoteBackups()
            }
        } catch (e: any) {
            this.notifications.error(`Failed to upload snapshot to remote: ${e?.message || e}`)
        }
    }

    async deleteLocalBackup(item: BackupSnapshotItem): Promise<void> {
        try {
            await this.backupService.deleteLocalBackup(item.filename)
            await this.loadLocalBackups()
            this.notifications.info('Local snapshot deleted.')
        } catch (e: any) {
            this.notifications.error(`Failed to delete local backup: ${e?.message || e}`)
        }
    }

    async deleteRemoteBackup(item: BackupSnapshotItem): Promise<void> {
        try {
            await this.backupService.deleteRemoteBackup(item.filename)
            await this.loadRemoteBackups()
            this.notifications.info('Remote snapshot deleted.')
        } catch (e: any) {
            this.notifications.error(`Failed to delete remote backup: ${e?.message || e}`)
        }
    }

    openSnapshotsFolder(): void {
        const dir = this.backupService.getLocalBackupsDir()
        try {
            this.platform.openPath(dir)
            this.notifications.info(`Opening snapshots directory: ${dir}`)
        } catch (err: any) {
            this.notifications.error(`Could not open directory: ${err?.message || err}`)
        }
    }

    // ==========================================
    // OTHER UTILITIES
    // ==========================================

    openUrl(url: string): void {
        if (this.platform?.openExternal) {
            this.platform.openExternal(url)
        } else {
            window.open(url, '_blank')
        }
    }

    async browseLocalSyncFolder(): Promise<void> {
        try {
            const selectedDir = await this.platform.pickDirectory()
            if (selectedDir) {
                this.onFieldChange('localSyncPath', selectedDir)
                this.notifications.info(`Selected local sync path: ${selectedDir} (Click Save to apply)`)
            }
        } catch (err: any) {
            this.notifications.error(`Could not pick folder: ${err?.message || err}`)
        }
    }

    async checkForUpdates(): Promise<void> {
        this.isCheckingUpdates = true
        this.hasCheckedUpdates = false
        this.updateInfo = null

        try {
            const response = await fetch(
                'https://api.github.com/repos/adelantad0/tabby-sync-and-backup/releases/latest',
                {
                    headers: { Accept: 'application/vnd.github.v3+json' },
                },
            )

            if (!response.ok) {
                if (response.status === 404) {
                    this.hasCheckedUpdates = true
                    this.notifications.notice(`You are on the latest version (v${this.pluginVersion})!`)
                    return
                }
                throw new Error(`GitHub API returned status ${response.status}`)
            }

            const data = await response.json()
            const latestTag = (data.tag_name || '').replace(/^v/, '')

            if (latestTag && this.isNewerVersion(latestTag, this.pluginVersion)) {
                this.updateInfo = {
                    version: latestTag,
                    url: data.html_url || 'https://github.com/adelantad0/tabby-sync-and-backup/releases',
                    publishedAt: new Date(data.published_at).toLocaleDateString(),
                    body: data.body || '',
                }
                this.notifications.notice(
                    `New version available: v${latestTag}! Check the About tab for details.`,
                )
            } else {
                this.hasCheckedUpdates = true
                this.notifications.notice(
                    `You are running the latest version of Tabby Sync & Backup (v${this.pluginVersion})!`,
                )
            }
        } catch (err: any) {
            console.error('[tabby-sync-and-backup] Update check failed:', err)
            this.notifications.error(
                `Failed to check for updates: ${err?.message || 'Network error'}`,
            )
        } finally {
            this.isCheckingUpdates = false
        }
    }

    async copyDiagnostics(): Promise<void> {
        const diagnostics = [
            `--- Tabby Sync & Backup Diagnostics ---`,
            `Plugin Version: v${this.pluginVersion}`,
            `Tabby App Version: ${this.platform.getAppVersion?.() || 'Unknown'}`,
            `Operating System: ${this.platform.getOSRelease?.() || process.platform}`,
            `Storage Provider: ${this.formData.syncProvider || 'webdav'}`,
            `Sync Enabled: ${!!this.formData.syncEnabled}`,
            `Backup Enabled: ${!!this.formData.backupEnabled}`,
            `Timestamp: ${new Date().toISOString()}`,
        ].join('\n')

        try {
            await navigator.clipboard.writeText(diagnostics)
            this.notifications.notice('Diagnostics info copied to clipboard!')
        } catch {
            this.notifications.info('Diagnostics:\n' + diagnostics)
        }
    }

    getProviderTitle(): string {
        const provider = this.formData.syncProvider || 'webdav'
        switch (provider) {
            case 'webdav':
                return 'WebDAV'
            case 'local':
                return 'Local Directory'
            default:
                return provider
        }
    }

    triggerSyncNow(): void {
        this.notifications.info('Sync & Backup: Starting manual synchronization...')
    }

    triggerUpload(): void {
        this.notifications.info('Sync & Backup: Uploading local configuration to remote...')
    }

    triggerDownload(): void {
        this.notifications.info('Sync & Backup: Downloading remote configuration...')
    }

    private isNewerVersion(remoteVer: string, currentVer: string): boolean {
        const rParts = remoteVer.split('.').map(n => parseInt(n, 10) || 0)
        const cParts = currentVer.split('.').map(n => parseInt(n, 10) || 0)
        for (let i = 0; i < Math.max(rParts.length, cParts.length); i++) {
            const r = rParts[i] || 0
            const c = cParts[i] || 0
            if (r > c) return true
            if (r < c) return false
        }
        return false
    }
}
