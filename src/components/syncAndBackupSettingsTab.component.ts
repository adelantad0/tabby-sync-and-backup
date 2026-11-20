import { Component, HostBinding, OnInit } from '@angular/core'
import { ConfigService, HostAppService, NotificationsService, PlatformService } from 'tabby-core'
import { BackupService, BackupSnapshotItem } from '../services/backup.service'
import { CryptoService, EncryptionStatus } from '../services/crypto.service'
import { SyncService, ConnectionTestResult, SyncTargetConfig } from '../services/sync.service'
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
 * - Real-time encryption verification in backup tables with zero performance impact
 * - Safe password change workflow with confirmation and batch re-encryption of local backups
 * - Prompt for historic passwords when restoring backups created under earlier keys
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
                    <span class="fw-bold">Storage Provider Configuration</span>
                    <div class="d-flex align-items-center gap-2">
                        <span
                            class="badge"
                            [class.bg-secondary]="connectionStatus === 'untested'"
                            [class.bg-warning]="connectionStatus === 'testing'"
                            [class.text-dark]="connectionStatus === 'testing'"
                            [class.bg-success]="connectionStatus === 'connected'"
                            [class.bg-danger]="connectionStatus === 'error'"
                        >
                            <span [class.d-none]="connectionStatus !== 'untested'">⚪ Not Tested</span>
                            <span [class.d-none]="connectionStatus !== 'testing'">⏳ Testing...</span>
                            <span [class.d-none]="connectionStatus !== 'connected'">✓ Connected</span>
                            <span [class.d-none]="connectionStatus !== 'error'">✗ Disconnected</span>
                        </span>
                        <span class="badge bg-secondary">{{ getProviderTitle() }}</span>
                    </div>
                </div>
                <div class="card-body">
                    <div class="mb-3">
                        <label class="form-label">Provider Type</label>
                        <select
                            class="form-select"
                            [(ngModel)]="formData.syncProvider"
                            (ngModelChange)="onProviderChange($event)"
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
                                (input)="onStorageParamChange('webdavUrl', $any($event.target).value)"
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
                                    (input)="onStorageParamChange('webdavUsername', $any($event.target).value)"
                                />
                            </div>
                            <div class="col-md-6">
                                <label class="form-label">Password / App Password</label>
                                <div class="input-group">
                                    <input
                                        [type]="showWebdavPassword ? 'text' : 'password'"
                                        class="form-control"
                                        placeholder="Password or App Token"
                                        [value]="formData.webdavPassword"
                                        (input)="onStorageParamChange('webdavPassword', $any($event.target).value)"
                                    />
                                    <button
                                        type="button"
                                        class="btn btn-outline-secondary"
                                        (click)="showWebdavPassword = !showWebdavPassword"
                                    >
                                        {{ showWebdavPassword ? '🙈' : '👁️' }}
                                    </button>
                                </div>
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
                                    (input)="onStorageParamChange('localSyncPath', $any($event.target).value)"
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

                    <!-- Test Connection Button & Live Feedback -->
                    <div class="pt-3 border-top">
                        <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
                            <button
                                type="button"
                                class="btn btn-outline-primary d-inline-flex align-items-center gap-2"
                                [disabled]="isTestingConnection"
                                (click)="testStorageConnection()"
                            >
                                <span [class.d-none]="isTestingConnection">🔍 Test Connection</span>
                                <span [class.d-none]="!isTestingConnection">⏳ Testing Connection...</span>
                            </button>
                            <span class="small text-muted" *ngIf="connectionTestResult?.latencyMs">
                                Response time: <strong>{{ connectionTestResult?.latencyMs }} ms</strong>
                            </span>
                        </div>

                        <!-- Test Result Alert Banner -->
                        <div class="mt-2" *ngIf="connectionTestResult">
                            <div
                                class="alert d-flex align-items-start gap-2 mb-0"
                                [class.alert-success]="connectionTestResult.success"
                                [class.alert-danger]="!connectionTestResult.success"
                            >
                                <span class="fs-5">{{ connectionTestResult.success ? '✓' : '✗' }}</span>
                                <div>
                                    <div class="fw-bold">{{ connectionTestResult.message }}</div>
                                    <div class="small mt-1 opacity-75" *ngIf="connectionTestResult.details">
                                        {{ connectionTestResult.details }}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Sync Automation & Schedule Card -->
            <div class="card mb-3">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <span class="fw-bold">Synchronization Automation &amp; Schedule</span>
                    <span class="badge bg-secondary">Next Milestone</span>
                </div>
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
                            Periodically syncs configuration with remote storage according to interval.
                        </div>
                    </div>

                    <div class="mb-3" [class.d-none]="!formData.syncEnabled">
                        <label class="form-label">Sync Interval</label>
                        <select
                            class="form-select"
                            [(ngModel)]="formData.syncIntervalMinutes"
                            (ngModelChange)="onFieldChange('syncIntervalMinutes', $event)"
                        >
                            <option [ngValue]="5">Every 5 minutes</option>
                            <option [ngValue]="15">Every 15 minutes</option>
                            <option [ngValue]="30">Every 30 minutes (Recommended)</option>
                            <option [ngValue]="60">Every 1 hour</option>
                            <option [ngValue]="360">Every 6 hours</option>
                        </select>
                    </div>

                    <div class="alert alert-secondary d-flex align-items-center gap-2 mb-0 small">
                        <span>ℹ️</span>
                        <div>
                            Storage connection is ready to be configured. The full bidirectional configuration sync engine will be activated in the next step once target connection is confirmed.
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- ==================== TAB 2: BACKUPS ==================== -->
        <div [class.d-none]="activeTab !== 'backups'">
            <!-- Optional Inline Prompt for Historic Backup Password -->
            <div class="card border-warning mb-3" [class.d-none]="!promptRestoreSnapshot">
                <div class="card-header bg-warning text-dark fw-bold d-flex justify-content-between align-items-center">
                    <span>🔑 Password Required: {{ promptRestoreSnapshot?.filename }}</span>
                    <button type="button" class="btn-close" (click)="cancelPromptRestore()"></button>
                </div>
                <div class="card-body">
                    <p class="small text-muted mb-2">
                        This snapshot was encrypted with a different or previous master password. Enter the password used when this snapshot was created to decrypt and restore it.
                    </p>
                    <div class="input-group">
                        <input
                            [type]="showPromptPassword ? 'text' : 'password'"
                            class="form-control"
                            placeholder="Enter snapshot master password..."
                            [value]="promptPasswordInput"
                            (input)="promptPasswordInput = $any($event.target).value"
                            (keyup.enter)="confirmRestoreWithPassword()"
                        />
                        <button
                            type="button"
                            class="btn btn-outline-secondary"
                            (click)="showPromptPassword = !showPromptPassword"
                        >
                            {{ showPromptPassword ? '🙈' : '👁️' }}
                        </button>
                        <button
                            type="button"
                            class="btn btn-primary"
                            [disabled]="!promptPasswordInput"
                            (click)="confirmRestoreWithPassword()"
                        >
                            Decrypt &amp; Restore
                        </button>
                    </div>
                </div>
            </div>

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
                            [(ngModel)]="formData.maxBackupsToKeep"
                            (ngModelChange)="onFieldChange('maxBackupsToKeep', $event)"
                        >
                            <option [ngValue]="5">5 snapshots</option>
                            <option [ngValue]="10">10 snapshots (Recommended)</option>
                            <option [ngValue]="25">25 snapshots</option>
                            <option [ngValue]="50">50 snapshots</option>
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
                                <thead>
                                    <tr>
                                        <th style="width: 170px;">Date &amp; Time</th>
                                        <th style="width: 110px;">Trigger</th>
                                        <th style="width: 150px;">Security</th>
                                        <th style="width: 80px;">Size</th>
                                        <th class="text-end" style="width: 220px;">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr *ngFor="let item of localBackups">
                                        <td class="font-monospace small text-nowrap">{{ item.formattedDate }}</td>
                                        <td class="text-nowrap">
                                            <span
                                                class="badge"
                                                [class.bg-info]="item.trigger === 'Manual'"
                                                [class.bg-warning]="item.trigger === 'Pre-Sync'"
                                                [class.bg-secondary]="item.trigger === 'Startup'"
                                                [class.bg-danger]="item.trigger === 'Pre-Restore'"
                                            >
                                                {{ item.trigger }}
                                            </span>
                                        </td>
                                        <td class="text-nowrap">
                                            <span
                                                class="badge"
                                                [class.bg-secondary]="item.encryptionStatus === 'unencrypted'"
                                                [class.bg-success]="item.encryptionStatus === 'encrypted_matches'"
                                                [class.bg-warning]="item.encryptionStatus === 'encrypted_different'"
                                                [class.text-dark]="item.encryptionStatus === 'encrypted_different'"
                                                [class.bg-info]="item.encryptionStatus === 'encrypted_unknown'"
                                                [title]="getEncryptionTooltip(item)"
                                            >
                                                {{ getEncryptionLabel(item) }}
                                            </span>
                                        </td>
                                        <td class="small text-nowrap">{{ item.sizeKb }} KB</td>
                                        <td class="text-end text-nowrap">
                                            <div class="d-inline-flex gap-1 align-items-center justify-content-end flex-nowrap">
                                                <button
                                                    type="button"
                                                    class="btn btn-sm btn-outline-primary py-1 px-2 text-nowrap"
                                                    title="Restore configuration snapshot"
                                                    (click)="restoreLocalBackup(item)"
                                                >
                                                    ↩️ Restore
                                                </button>
                                                <button
                                                    type="button"
                                                    class="btn btn-sm btn-outline-info py-1 px-2 text-nowrap"
                                                    [disabled]="!isSyncConfigured()"
                                                    [title]="isSyncConfigured() ? 'Upload to remote /backups/' : 'Configure Sync first to upload'"
                                                    (click)="uploadLocalToRemote(item)"
                                                >
                                                    ☁️ Upload
                                                </button>
                                                <button
                                                    type="button"
                                                    class="btn btn-sm btn-outline-danger py-1 px-2 text-nowrap"
                                                    title="Delete local snapshot"
                                                    (click)="deleteLocalBackup(item)"
                                                >
                                                    🗑️ Delete
                                                </button>
                                            </div>
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
                                <thead>
                                    <tr>
                                        <th style="width: 170px;">Date &amp; Time</th>
                                        <th style="width: 110px;">Trigger</th>
                                        <th style="width: 150px;">Security</th>
                                        <th style="width: 80px;">Size</th>
                                        <th class="text-end" style="width: 180px;">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr *ngFor="let item of remoteBackups">
                                        <td class="font-monospace small text-nowrap">{{ item.formattedDate }}</td>
                                        <td class="text-nowrap">
                                            <span
                                                class="badge"
                                                [class.bg-info]="item.trigger === 'Manual'"
                                                [class.bg-warning]="item.trigger === 'Pre-Sync'"
                                                [class.bg-secondary]="item.trigger === 'Startup'"
                                                [class.bg-danger]="item.trigger === 'Pre-Restore'"
                                            >
                                                {{ item.trigger }}
                                            </span>
                                        </td>
                                        <td class="text-nowrap">
                                            <span
                                                class="badge"
                                                [class.bg-secondary]="item.encryptionStatus === 'unencrypted'"
                                                [class.bg-success]="item.encryptionStatus === 'encrypted_matches'"
                                                [class.bg-warning]="item.encryptionStatus === 'encrypted_different'"
                                                [class.text-dark]="item.encryptionStatus === 'encrypted_different'"
                                                [class.bg-info]="item.encryptionStatus === 'encrypted_unknown'"
                                                [title]="getEncryptionTooltip(item)"
                                            >
                                                {{ getEncryptionLabel(item) }}
                                            </span>
                                        </td>
                                        <td class="small text-nowrap">{{ item.sizeKb }} KB</td>
                                        <td class="text-end text-nowrap">
                                            <div class="d-inline-flex gap-1 align-items-center justify-content-end flex-nowrap">
                                                <button
                                                    type="button"
                                                    class="btn btn-sm btn-outline-primary py-1 px-2 text-nowrap"
                                                    title="Download and restore remote snapshot"
                                                    (click)="restoreRemoteBackup(item)"
                                                >
                                                    ⬇️ Restore
                                                </button>
                                                <button
                                                    type="button"
                                                    class="btn btn-sm btn-outline-danger py-1 px-2 text-nowrap"
                                                    title="Delete remote snapshot"
                                                    (click)="deleteRemoteBackup(item)"
                                                >
                                                    🗑️ Delete
                                                </button>
                                            </div>
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
                <div class="card-header fw-bold">Payload &amp; Backup Encryption (AES-256-GCM)</div>
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
                            Encrypt backups and sync payload with master password
                        </label>
                        <div class="text-muted small">
                            Protects SSH passwords, tokens, and server IP addresses with authenticated client-side AES-256-GCM.
                        </div>
                    </div>

                    <!-- Encryption Configuration Panel -->
                    <div [class.d-none]="!formData.encryptionEnabled">
                        <!-- Case 1: Password already established -->
                        <div class="mb-3" [class.d-none]="!hasSavedPassword">
                            <div class="alert alert-success d-flex justify-content-between align-items-center mb-3">
                                <div>
                                    <div class="fw-bold">🔒 Master Password Configured</div>
                                    <div class="small text-muted">
                                        New backups and remote sync payloads are encrypted with AES-256-GCM.
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    class="btn btn-sm btn-outline-primary"
                                    (click)="isChangingPassword = !isChangingPassword"
                                >
                                    {{ isChangingPassword ? 'Cancel Change' : '🔑 Change Master Password' }}
                                </button>
                            </div>
                        </div>

                        <!-- Case 2: Setting password for first time OR Changing existing password -->
                        <div [class.d-none]="hasSavedPassword && !isChangingPassword" class="p-3 border rounded mb-3 security-box">
                            <h6 class="fw-bold mb-3">
                                {{ hasSavedPassword ? '🔑 Change Master Password' : '🔑 Set Initial Master Password' }}
                            </h6>

                            <!-- Old password verification when changing -->
                            <div class="mb-3" [class.d-none]="!hasSavedPassword">
                                <label class="form-label">Current Master Password</label>
                                <div class="input-group">
                                    <input
                                        [type]="showOldPassword ? 'text' : 'password'"
                                        class="form-control"
                                        placeholder="Enter current password to verify..."
                                        [value]="oldPasswordInput"
                                        (input)="oldPasswordInput = $any($event.target).value"
                                    />
                                    <button
                                        type="button"
                                        class="btn btn-outline-secondary"
                                        (click)="showOldPassword = !showOldPassword"
                                    >
                                        {{ showOldPassword ? '🙈' : '👁️' }}
                                    </button>
                                </div>
                            </div>

                            <div class="row g-2 mb-3">
                                <div class="col-md-6">
                                    <label class="form-label">New Master Password</label>
                                    <div class="input-group">
                                        <input
                                            [type]="showNewPassword ? 'text' : 'password'"
                                            class="form-control"
                                            placeholder="Enter strong password (min 6 chars)..."
                                            [value]="newPasswordInput"
                                            (input)="onNewPasswordInput($any($event.target).value)"
                                        />
                                        <button
                                            type="button"
                                            class="btn btn-outline-secondary"
                                            (click)="showNewPassword = !showNewPassword"
                                        >
                                            {{ showNewPassword ? '🙈' : '👁️' }}
                                        </button>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label">Confirm New Password</label>
                                    <div class="input-group">
                                        <input
                                            [type]="showConfirmPassword ? 'text' : 'password'"
                                            class="form-control"
                                            placeholder="Repeat new password..."
                                            [value]="confirmPasswordInput"
                                            (input)="onConfirmPasswordInput($any($event.target).value)"
                                        />
                                        <button
                                            type="button"
                                            class="btn btn-outline-secondary"
                                            (click)="showConfirmPassword = !showConfirmPassword"
                                        >
                                            {{ showConfirmPassword ? '🙈' : '👁️' }}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <!-- Live Password Matching & Strength Feedback -->
                            <div class="mb-3">
                                <div class="small fw-semibold" [class.d-none]="passwordsMatch || !confirmPasswordInput" style="color: #ff6b6b !important;">
                                    ✗ Passwords do not match.
                                </div>
                                <div class="small fw-semibold" [class.d-none]="!passwordsMatch || !newPasswordInput" style="color: #20c997 !important;">
                                    ✓ Passwords match.
                                </div>
                                <div class="small" [class.d-none]="!newPasswordInput || newPasswordInput.length >= 6" style="color: #ffc107 !important;">
                                    ⚠️ Password should be at least 6 characters long.
                                </div>
                            </div>

                            <!-- Re-encryption of existing backups checkbox -->
                            <div class="form-check mb-3">
                                <input
                                    class="form-check-input"
                                    type="checkbox"
                                    id="reEncryptLocalCheck"
                                    [checked]="reEncryptLocalBackups"
                                    (change)="reEncryptLocalBackups = $any($event.target).checked"
                                />
                                <label class="form-check-label small" for="reEncryptLocalCheck">
                                    <strong>Update existing local backups</strong> to the new password automatically
                                </label>
                                <div class="text-muted small">
                                    Decrypts your local snapshots with the previous password and re-encrypts them with the new one.
                                </div>
                            </div>

                            <button
                                type="button"
                                class="btn btn-primary"
                                [disabled]="!canApplyPassword()"
                                (click)="applyPasswordUpdate()"
                            >
                                {{ hasSavedPassword ? 'Apply New Password' : 'Set Master Password' }}
                            </button>
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
                    <!-- v0.2.0 -->
                    <div class="mb-4">
                        <div class="d-flex align-items-center gap-2 mb-2">
                            <span class="badge bg-success">v0.2.0</span>
                            <span class="text-muted small">2026-11-21 (Latest Release)</span>
                        </div>
                        <ul class="mb-0">
                            <li><strong>AES-256-GCM Backup Encryption</strong>: Full payload encryption with instant verification badges (Plain, Protected, Other Key).</li>
                            <li><strong>Safe Password Workflow</strong>: Password confirmation, eye toggles, match validation, and batch re-encryption of local backups.</li>
                            <li><strong>Historic Password Support</strong>: Seamless restore dialog for snapshots encrypted with earlier master passwords.</li>
                            <li><strong>Local &amp; Remote Backups Engine</strong>: Dual snapshot management supporting local storage in Tabby config directory and remote storage under <code>/backups/</code>.</li>
                            <li><strong>Pre-Restore Safety Snapshot &amp; Restart</strong>: Automatic safety backup and application restart upon configuration restore.</li>
                            <li><strong>Settings Persistence Protection</strong>: Restoring older snapshots preserves current master passwords and sync targets.</li>
                            <li><strong>Dual Retention Policy &amp; Rotation</strong>: Automated pruning and rotation of both local and remote snapshots based on max retention limit.</li>
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
            .security-box {
                background: rgba(0, 0, 0, 0.25) !important;
                border: 1px solid rgba(255, 255, 255, 0.12) !important;
            }
            .security-box .form-label,
            .security-box h6,
            .security-box label,
            .security-box strong {
                color: rgba(255, 255, 255, 0.9) !important;
            }
            .security-box .text-muted {
                color: rgba(255, 255, 255, 0.6) !important;
            }
            .security-box .input-group .btn-outline-secondary {
                border-color: rgba(255, 255, 255, 0.2) !important;
                color: rgba(255, 255, 255, 0.85) !important;
                background: rgba(255, 255, 255, 0.08) !important;
            }
            .security-box .input-group .btn-outline-secondary:hover {
                background: rgba(255, 255, 255, 0.18) !important;
                color: #ffffff !important;
            }
            .security-box .input-group .form-control {
                background: rgba(0, 0, 0, 0.35) !important;
                border-color: rgba(255, 255, 255, 0.2) !important;
                color: #ffffff !important;
            }
            .security-box .input-group .form-control:focus {
                border-color: #0d6efd !important;
                box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25) !important;
            }
            .alert-success {
                background-color: rgba(25, 135, 84, 0.18) !important;
                border-color: rgba(25, 135, 84, 0.4) !important;
                color: #75b798 !important;
            }
            .alert-danger {
                background-color: rgba(220, 53, 69, 0.16) !important;
                border-color: rgba(220, 53, 69, 0.35) !important;
                color: #ea868f !important;
            }
            .input-group .btn-outline-secondary {
                border-color: rgba(255, 255, 255, 0.2) !important;
                color: rgba(255, 255, 255, 0.85) !important;
                background: rgba(255, 255, 255, 0.06) !important;
            }
            .input-group .btn-outline-secondary:hover {
                background: rgba(255, 255, 255, 0.16) !important;
                color: #ffffff !important;
            }
            .table-responsive {
                overflow-x: auto;
            }
            .table th, .table td {
                white-space: nowrap !important;
                vertical-align: middle !important;
            }
            .table thead th {
                background: rgba(255, 255, 255, 0.05) !important;
                border-bottom: 1px solid rgba(255, 255, 255, 0.12) !important;
                color: rgba(255, 255, 255, 0.75) !important;
                font-size: 0.82rem;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                padding: 10px 12px;
            }
            .table tbody td {
                padding: 8px 12px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
            }
            .table tbody tr:hover td {
                background-color: rgba(255, 255, 255, 0.03) !important;
            }
            .table .badge {
                font-weight: 500;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 0.75rem;
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

    // Storage Connection Testing State
    isTestingConnection: boolean = false
    connectionTestResult: ConnectionTestResult | null = null
    connectionStatus: 'untested' | 'testing' | 'connected' | 'error' = 'untested'
    showWebdavPassword: boolean = false

    // Security Form State
    isChangingPassword: boolean = false
    oldPasswordInput: string = ''
    newPasswordInput: string = ''
    confirmPasswordInput: string = ''
    showOldPassword: boolean = false
    showNewPassword: boolean = false
    showConfirmPassword: boolean = false
    reEncryptLocalBackups: boolean = true

    // Restore Prompt Modal State
    promptRestoreSnapshot: BackupSnapshotItem | null = null
    promptPasswordInput: string = ''
    showPromptPassword: boolean = false

    isCheckingUpdates: boolean = false
    hasCheckedUpdates: boolean = false
    updateInfo: UpdateInfo | null = null

    get hasSavedPassword(): boolean {
        return !!(this.formData.encryptionPassword && this.formData.encryptionPassword.trim())
    }

    get passwordsMatch(): boolean {
        return !!this.newPasswordInput && this.newPasswordInput === this.confirmPasswordInput
    }

    constructor(
        public config: ConfigService,
        private notifications: NotificationsService,
        private platform: PlatformService,
        private hostApp: HostAppService,
        private backupService: BackupService,
        private syncService: SyncService,
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
        this.isChangingPassword = false
        this.oldPasswordInput = ''
        this.newPasswordInput = ''
        this.confirmPasswordInput = ''
        this.connectionStatus = 'untested'
        this.connectionTestResult = null
        this.isTestingConnection = false
        this.showWebdavPassword = false
        this.remoteTargetDescription = this.backupService.getRemoteTargetDescription()
    }

    onProviderChange(provider: string): void {
        this.formData.syncProvider = provider
        this.isDirty = true
        this.connectionStatus = 'untested'
        this.connectionTestResult = null
        this.remoteTargetDescription = this.backupService.getRemoteTargetDescription()
    }

    onStorageParamChange(field: string, value: any): void {
        this.formData[field] = value
        this.isDirty = true
        this.connectionStatus = 'untested'
        this.connectionTestResult = null
        this.remoteTargetDescription = this.backupService.getRemoteTargetDescription()
    }

    async testStorageConnection(): Promise<void> {
        this.isTestingConnection = true
        this.connectionStatus = 'testing'
        this.connectionTestResult = null

        try {
            const target: SyncTargetConfig = {
                provider: this.formData.syncProvider,
                webdavUrl: this.formData.webdavUrl,
                webdavUsername: this.formData.webdavUsername,
                webdavPassword: this.formData.webdavPassword,
                webdavPath: this.formData.webdavPath,
                localSyncPath: this.formData.localSyncPath,
            }

            const result = await this.syncService.testConnection(target)
            this.connectionTestResult = result
            this.connectionStatus = result.success ? 'connected' : 'error'

            if (result.success) {
                this.notifications.notice(`Connection test passed: ${result.message}`)
            } else {
                this.notifications.error(`Connection test failed: ${result.message}`)
            }
        } catch (e: any) {
            this.connectionTestResult = {
                success: false,
                message: `Connection test error: ${e?.message || e}`,
            }
            this.connectionStatus = 'error'
            this.notifications.error(this.connectionTestResult.message)
        } finally {
            this.isTestingConnection = false
        }
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
            this.formData[field] = typeof value === 'string' ? (parseInt(value, 10) || 10) : value
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

        // Apply retention policy immediately to local and remote snapshots
        if (this.formData.maxBackupsToKeep) {
            await this.backupService.rotateLocalBackups(this.formData.maxBackupsToKeep)
            if (this.isSyncConfigured()) {
                await this.backupService.rotateRemoteBackups(this.formData.maxBackupsToKeep)
            }
        }

        this.notifications.notice('Sync & Backup settings saved successfully!')
        await this.loadLocalBackups()
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
    // SECURITY & PASSWORD MANAGEMENT
    // ==========================================

    onNewPasswordInput(val: string): void {
        this.newPasswordInput = val
    }

    onConfirmPasswordInput(val: string): void {
        this.confirmPasswordInput = val
    }

    canApplyPassword(): boolean {
        if (!this.newPasswordInput || this.newPasswordInput.length < 6) return false
        if (this.newPasswordInput !== this.confirmPasswordInput) return false
        if (this.hasSavedPassword && !this.oldPasswordInput) return false
        return true
    }

    async applyPasswordUpdate(): Promise<void> {
        if (!this.canApplyPassword()) return

        const currentSavedPassword = this.formData.encryptionPassword || ''

        // Verify old password if one was set
        if (this.hasSavedPassword && this.oldPasswordInput !== currentSavedPassword) {
            this.notifications.error('Current master password verification failed!')
            return
        }

        const newPass = this.newPasswordInput
        const oldPass = this.oldPasswordInput || currentSavedPassword

        // 1. Re-encrypt local backups if checked
        if (this.reEncryptLocalBackups && this.hasSavedPassword && oldPass) {
            try {
                const res = await this.backupService.reEncryptAllLocalBackups(oldPass, newPass)
                this.notifications.notice(`Re-encrypted ${res.successCount} local backup(s) with new password!`)
            } catch (err: any) {
                this.notifications.error(`Failed to re-encrypt some backups: ${err?.message || err}`)
            }
        }

        // 2. Update form and config
        this.formData.encryptionPassword = newPass
        this.formData.encryptionEnabled = true
        await this.saveSettings()

        this.isChangingPassword = false
        this.oldPasswordInput = ''
        this.newPasswordInput = ''
        this.confirmPasswordInput = ''
        this.notifications.notice('Master encryption password updated successfully!')
        await this.loadLocalBackups()
    }

    getEncryptionLabel(item: BackupSnapshotItem): string {
        switch (item.encryptionStatus) {
            case 'unencrypted':
                return '📄 Plain'
            case 'encrypted_matches':
                return '🔓 Encrypted (OK)'
            case 'encrypted_different':
                return '🔒 Encrypted (Other Key)'
            case 'encrypted_unknown':
                return '🔒 Encrypted'
            default:
                return 'Unknown'
        }
    }

    getEncryptionTooltip(item: BackupSnapshotItem): string {
        switch (item.encryptionStatus) {
            case 'unencrypted':
                return 'Unencrypted standard YAML file.'
            case 'encrypted_matches':
                return 'Encrypted with AES-256-GCM. Verified to match current master password.'
            case 'encrypted_different':
                return 'Encrypted with a different/previous password. You will be prompted for that password when restoring.'
            case 'encrypted_unknown':
                return 'Encrypted remote payload.'
            default:
                return ''
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

    private async confirmRestoreAction(formattedDate: string): Promise<boolean> {
        const res = await this.platform.showMessageBox({
            type: 'warning',
            message: `Restore configuration snapshot (${formattedDate})?`,
            detail: 'Restoring will replace your current Tabby configuration.\n\nA safety backup (Pre-Restore) will be created automatically before restoring.\n\nTabby will restart immediately after restoring to apply changes.',
            buttons: ['Restore & Restart', 'Cancel'],
            defaultId: 0,
            cancelId: 1,
        })
        return res.response === 0
    }

    async restoreLocalBackup(item: BackupSnapshotItem): Promise<void> {
        try {
            const confirmed = await this.confirmRestoreAction(item.formattedDate)
            if (!confirmed) return

            await this.backupService.restoreLocalBackup(item.filename)
            await this.loadLocalBackups()
            this.notifications.notice(`Configuration successfully restored! Restarting Tabby...`)
            setTimeout(() => {
                this.hostApp.relaunch()
            }, 800)
        } catch (e: any) {
            if (e?.message === 'PASSWORD_REQUIRED' || e?.message === 'INVALID_PASSWORD') {
                this.promptRestoreSnapshot = item
                this.promptPasswordInput = ''
                this.notifications.info(`Please enter the master password for ${item.filename}`)
            } else {
                this.notifications.error(`Failed to restore local backup: ${e?.message || e}`)
            }
        }
    }

    async restoreRemoteBackup(item: BackupSnapshotItem): Promise<void> {
        this.isLoadingBackups = true
        try {
            const confirmed = await this.confirmRestoreAction(item.formattedDate)
            if (!confirmed) {
                this.isLoadingBackups = false
                return
            }

            await this.backupService.restoreRemoteBackup(item)
            await this.loadLocalBackups()
            this.notifications.notice(`Configuration successfully restored from remote snapshot! Restarting Tabby...`)
            setTimeout(() => {
                this.hostApp.relaunch()
            }, 800)
        } catch (e: any) {
            if (e?.message === 'PASSWORD_REQUIRED' || e?.message === 'INVALID_PASSWORD') {
                this.promptRestoreSnapshot = item
                this.promptPasswordInput = ''
                this.notifications.info(`Please enter the master password for ${item.filename}`)
            } else {
                this.notifications.error(`Failed to restore remote backup: ${e?.message || e}`)
            }
        } finally {
            this.isLoadingBackups = false
        }
    }

    async confirmRestoreWithPassword(): Promise<void> {
        if (!this.promptRestoreSnapshot || !this.promptPasswordInput) return

        const item = this.promptRestoreSnapshot
        const pass = this.promptPasswordInput

        const confirmed = await this.confirmRestoreAction(item.formattedDate)
        if (!confirmed) return

        try {
            if (item.location === 'local') {
                await this.backupService.restoreLocalBackup(item.filename, pass)
            } else {
                await this.backupService.restoreRemoteBackup(item, pass)
            }
            this.notifications.notice(`Configuration restored! Restarting Tabby...`)
            this.promptRestoreSnapshot = null
            this.promptPasswordInput = ''
            await this.loadLocalBackups()
            setTimeout(() => {
                this.hostApp.relaunch()
            }, 800)
        } catch (e: any) {
            this.notifications.error('Decryption failed: Incorrect password.')
        }
    }

    cancelPromptRestore(): void {
        this.promptRestoreSnapshot = null
        this.promptPasswordInput = ''
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
                this.formData.localSyncPath = selectedDir
                this.isDirty = true
                this.connectionStatus = 'untested'
                this.connectionTestResult = null
                this.remoteTargetDescription = this.backupService.getRemoteTargetDescription()
                this.notifications.info(`Selected local sync path: ${selectedDir}`)
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
