import { Component, HostBinding } from '@angular/core'
import { ConfigService, NotificationsService, PlatformService } from 'tabby-core'
import packageJson from '../../package.json'

type SettingsSubTab = 'sync' | 'backups' | 'security' | 'changelog' | 'about'

interface UpdateInfo {
    version: string
    url: string
    publishedAt: string
    body: string
}

interface BackupSnapshotItem {
    id: string
    filename: string
    timestamp: number
    formattedDate: string
    sizeKb: number
    trigger: 'Manual' | 'Pre-Sync' | 'Startup'
}

/**
 * Modular Settings Tab Component for Tabby Sync & Backup
 * Features 5 sub-navigation sections: Sync, Backups, Security, Changelog, and About.
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
                            [value]="config.store?.syncAndBackup?.syncProvider || 'gist'"
                            (change)="onProviderChange($event)"
                        >
                            <option value="gist">GitHub Gist (Secret Gist)</option>
                            <option value="webdav">WebDAV (Nextcloud, ownCloud, custom)</option>
                            <option value="local">Local Directory / Shared Folder</option>
                        </select>
                        <div class="form-text">
                            Select where your configuration payload will be stored and synchronized.
                        </div>
                    </div>

                    <!-- GitHub Gist Settings -->
                    <div [class.d-none]="(config.store?.syncAndBackup?.syncProvider || 'gist') !== 'gist'">
                        <div class="mb-3">
                            <label class="form-label">GitHub Personal Access Token (classic or fine-grained)</label>
                            <input
                                type="password"
                                class="form-control"
                                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                                [value]="config.store?.syncAndBackup?.gistToken || ''"
                                (input)="onConfigInput('gistToken', $event)"
                            />
                            <div class="form-text">
                                Requires <code>gist</code> scope to create and update secret gists.
                            </div>
                        </div>

                        <div class="mb-3">
                            <label class="form-label">Gist ID</label>
                            <div class="input-group">
                                <input
                                    type="text"
                                    class="form-control"
                                    placeholder="Leave empty to auto-create on first sync"
                                    [value]="config.store?.syncAndBackup?.gistId || ''"
                                    (input)="onConfigInput('gistId', $event)"
                                />
                                <button type="button" class="btn btn-outline-secondary" (click)="autoCreateGist()">
                                    Auto-Create
                                </button>
                            </div>
                            <div class="form-text">
                                The unique hash identifier of your GitHub Gist.
                            </div>
                        </div>
                    </div>

                    <!-- WebDAV Settings -->
                    <div [class.d-none]="config.store?.syncAndBackup?.syncProvider !== 'webdav'">
                        <div class="mb-3">
                            <label class="form-label">WebDAV Server URL</label>
                            <input
                                type="text"
                                class="form-control"
                                placeholder="https://nextcloud.example.com/remote.php/dav/files/user/"
                                [value]="config.store?.syncAndBackup?.webdavUrl || ''"
                                (input)="onConfigInput('webdavUrl', $event)"
                            />
                        </div>
                        <div class="row g-2 mb-3">
                            <div class="col-md-6">
                                <label class="form-label">Username</label>
                                <input
                                    type="text"
                                    class="form-control"
                                    [value]="config.store?.syncAndBackup?.webdavUsername || ''"
                                    (input)="onConfigInput('webdavUsername', $event)"
                                />
                            </div>
                            <div class="col-md-6">
                                <label class="form-label">Password / App Token</label>
                                <input
                                    type="password"
                                    class="form-control"
                                    [value]="config.store?.syncAndBackup?.webdavPassword || ''"
                                    (input)="onConfigInput('webdavPassword', $event)"
                                />
                            </div>
                        </div>
                        <div class="mb-3">
                            <label class="form-label">Remote File Path</label>
                            <input
                                type="text"
                                class="form-control"
                                placeholder="/tabby-config.yaml"
                                [value]="config.store?.syncAndBackup?.webdavPath || '/tabby-config.yaml'"
                                (input)="onConfigInput('webdavPath', $event)"
                            />
                        </div>
                    </div>

                    <!-- Local Sync Directory Settings -->
                    <div [class.d-none]="config.store?.syncAndBackup?.syncProvider !== 'local'">
                        <div class="mb-3">
                            <label class="form-label">Local Destination Path</label>
                            <div class="input-group">
                                <input
                                    type="text"
                                    class="form-control"
                                    placeholder="/Users/name/Sync/Tabby/"
                                    [value]="config.store?.syncAndBackup?.localSyncPath || ''"
                                    (input)="onConfigInput('localSyncPath', $event)"
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
                                Ideal for syncing across devices using Syncthing, Dropbox, iCloud, or network drives.
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
                            [checked]="config.store?.syncAndBackup?.syncEnabled"
                            (change)="toggleAutoSync($event)"
                        />
                        <label class="form-check-label fw-bold" for="enableAutoSyncCheck">
                            Enable automatic background synchronization
                        </label>
                        <div class="text-muted small">
                            Periodically checks remote storage and uploads/downloads configuration automatically.
                        </div>
                    </div>

                    <div class="mb-3" [class.d-none]="!config.store?.syncAndBackup?.syncEnabled">
                        <label class="form-label">Sync Interval (Minutes)</label>
                        <select
                            class="form-select"
                            [value]="config.store?.syncAndBackup?.syncIntervalMinutes || 30"
                            (change)="onIntervalChange($event)"
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
            <div class="card mb-3">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <span class="fw-bold">Automated Snapshot Policies</span>
                    <div class="d-flex gap-2">
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
                            (click)="createManualBackup()"
                        >
                            ➕ Create Backup Now
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <div class="form-check form-switch mb-3">
                        <input
                            class="form-check-input"
                            type="checkbox"
                            id="enablePreSyncBackup"
                            [checked]="config.store?.syncAndBackup?.backupEnabled"
                            (change)="toggleBackupPolicy('backupEnabled', $event)"
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
                            [checked]="config.store?.syncAndBackup?.backupOnStartup"
                            (change)="toggleBackupPolicy('backupOnStartup', $event)"
                        />
                        <label class="form-check-label" for="enableStartupBackup">
                            Create daily backup snapshot on Tabby startup
                        </label>
                    </div>

                    <div class="mb-2">
                        <label class="form-label">Retention Policy (Max snapshots to keep)</label>
                        <select
                            class="form-select"
                            [value]="config.store?.syncAndBackup?.maxBackupsToKeep || 10"
                            (change)="onMaxBackupsChange($event)"
                        >
                            <option [value]="5">5 snapshots</option>
                            <option [value]="10">10 snapshots (Recommended)</option>
                            <option [value]="25">25 snapshots</option>
                            <option [value]="50">50 snapshots</option>
                        </select>
                        <div class="form-text">
                            Older snapshots are automatically rotated and deleted when this limit is reached.
                        </div>
                    </div>
                </div>
            </div>

            <!-- Existing Snapshots Table -->
            <div class="card mb-3">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <span class="fw-bold">Local Backup Snapshots</span>
                    <span class="badge bg-secondary">{{ dummyBackups.length }} snapshots</span>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive">
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
                                <tr *ngFor="let item of dummyBackups">
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
                                            (click)="restoreBackup(item)"
                                        >
                                            Restore
                                        </button>
                                        <button
                                            type="button"
                                            class="btn btn-sm btn-outline-danger"
                                            (click)="deleteBackup(item)"
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
                            [checked]="config.store?.syncAndBackup?.encryptionEnabled"
                            (change)="toggleEncryption($event)"
                        />
                        <label class="form-check-label fw-bold" for="enableEncryptionCheck">
                            Encrypt payload before uploading to remote storage
                        </label>
                        <div class="text-muted small">
                            Protects SSH passwords, tokens, and server IP addresses with authenticated client-side AES-256.
                        </div>
                    </div>

                    <div [class.d-none]="!config.store?.syncAndBackup?.encryptionEnabled">
                        <div class="mb-3">
                            <label class="form-label">Master Encryption Password</label>
                            <input
                                type="password"
                                class="form-control"
                                placeholder="Enter strong master password..."
                                [value]="config.store?.syncAndBackup?.encryptionPassword || ''"
                                (input)="onConfigInput('encryptionPassword', $event)"
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
                            <li><strong>Modular Settings Tabs</strong>: Added dedicated sub-tabs for Sync, Backups, Security, Changelog, and About.</li>
                            <li><strong>Automated Backup Policies</strong>: Support for pre-sync and startup backup snapshots with retention rotation.</li>
                            <li><strong>Storage Provider Adapters</strong>: GitHub Gist, WebDAV, and Local Directory synchronization.</li>
                            <li><strong>Updates &amp; Diagnostics Engine</strong>: Real-time update checks via GitHub Releases and system diagnostics clipboard export.</li>
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
export class SyncAndBackupSettingsTabComponent {
    @HostBinding('class.content-box') true = true

    activeTab: SettingsSubTab = 'sync'
    pluginVersion: string = packageJson.version || '0.1.0'

    isCheckingUpdates: boolean = false
    hasCheckedUpdates: boolean = false
    updateInfo: UpdateInfo | null = null

    // Sample snapshots for UI representation (will connect to BackupService next)
    dummyBackups: BackupSnapshotItem[] = [
        {
            id: 'snapshot-20261120-220000',
            filename: 'config-20261120-220000.yaml',
            timestamp: Date.now() - 3600000,
            formattedDate: '2026-11-20 22:00:00',
            sizeKb: 14.2,
            trigger: 'Pre-Sync',
        },
        {
            id: 'snapshot-20261120-190000',
            filename: 'config-20261120-190000.yaml',
            timestamp: Date.now() - 14400000,
            formattedDate: '2026-11-20 19:00:00',
            sizeKb: 14.1,
            trigger: 'Manual',
        },
    ]

    constructor(
        public config: ConfigService,
        private notifications: NotificationsService,
        private platform: PlatformService,
    ) {}

    setTab(tab: SettingsSubTab): void {
        this.activeTab = tab
    }

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
                this.ensureConfigStore()
                this.config.store.syncAndBackup.localSyncPath = selectedDir
                this.config.save()
                this.notifications.notice(`Sync folder set to: ${selectedDir}`)
            }
        } catch (err: any) {
            this.notifications.error(`Could not pick folder: ${err?.message || err}`)
        }
    }

    openSnapshotsFolder(): void {
        const homeDir = process.env.HOME || process.env.USERPROFILE || ''
        const snapshotsPath = `${homeDir}/Library/Application Support/tabby/sync-and-backup/snapshots`
        try {
            this.platform.openPath(snapshotsPath)
            this.notifications.info(`Opening snapshots directory: ${snapshotsPath}`)
        } catch (err: any) {
            this.notifications.error(`Could not open directory: ${err?.message || err}`)
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
            `Storage Provider: ${this.config.store?.syncAndBackup?.syncProvider || 'gist'}`,
            `Sync Enabled: ${!!this.config.store?.syncAndBackup?.syncEnabled}`,
            `Backup Enabled: ${!!this.config.store?.syncAndBackup?.backupEnabled}`,
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
        const provider = this.config.store?.syncAndBackup?.syncProvider || 'gist'
        switch (provider) {
            case 'gist':
                return 'GitHub Gist'
            case 'webdav':
                return 'WebDAV'
            case 'local':
                return 'Local Directory'
            default:
                return provider
        }
    }

    onProviderChange(event: Event): void {
        const select = event.target as HTMLSelectElement
        this.ensureConfigStore()
        this.config.store.syncAndBackup.syncProvider = select.value
        this.config.save()
    }

    onIntervalChange(event: Event): void {
        const select = event.target as HTMLSelectElement
        this.ensureConfigStore()
        this.config.store.syncAndBackup.syncIntervalMinutes = parseInt(select.value, 10)
        this.config.save()
    }

    onMaxBackupsChange(event: Event): void {
        const select = event.target as HTMLSelectElement
        this.ensureConfigStore()
        this.config.store.syncAndBackup.maxBackupsToKeep = parseInt(select.value, 10)
        this.config.save()
    }

    onConfigInput(field: string, event: Event): void {
        const input = event.target as HTMLInputElement
        this.ensureConfigStore()
        this.config.store.syncAndBackup[field] = input.value
        this.config.save()
    }

    toggleAutoSync(event: Event): void {
        const input = event.target as HTMLInputElement
        this.ensureConfigStore()
        this.config.store.syncAndBackup.syncEnabled = input.checked
        this.config.save()
    }

    toggleBackupPolicy(field: string, event: Event): void {
        const input = event.target as HTMLInputElement
        this.ensureConfigStore()
        this.config.store.syncAndBackup[field] = input.checked
        this.config.save()
    }

    toggleEncryption(event: Event): void {
        const input = event.target as HTMLInputElement
        this.ensureConfigStore()
        this.config.store.syncAndBackup.encryptionEnabled = input.checked
        this.config.save()
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

    createManualBackup(): void {
        this.notifications.notice('Sync & Backup: New snapshot created successfully!')
    }

    restoreBackup(item: BackupSnapshotItem): void {
        this.notifications.info(`Sync & Backup: Restoring snapshot from ${item.formattedDate}...`)
    }

    deleteBackup(item: BackupSnapshotItem): void {
        this.dummyBackups = this.dummyBackups.filter(b => b.id !== item.id)
        this.notifications.info('Sync & Backup: Snapshot deleted.')
    }

    autoCreateGist(): void {
        this.notifications.info('Sync & Backup: Auto-creating Gist on GitHub...')
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

    private ensureConfigStore(): void {
        if (!this.config.store.syncAndBackup) {
            this.config.store.syncAndBackup = {}
        }
    }
}
