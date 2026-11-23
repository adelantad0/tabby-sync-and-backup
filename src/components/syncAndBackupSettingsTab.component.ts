import { Component, HostBinding, OnInit } from '@angular/core'
import { AppService, ConfigService, HostAppService, NotificationsService, PlatformService, TranslateService } from 'tabby-core'
import { SettingsTabComponent } from 'tabby-settings'
import { BackupService, BackupSnapshotItem, RemoteBackupDeviceItem } from '../services/backup.service'
import { CryptoService, EncryptionStatus } from '../services/crypto.service'
import { SyncService, ConnectionTestResult, SyncTargetConfig } from '../services/sync.service'
import { DeviceIdentityService } from '../services/device-identity.service'
import { SyncEngineService } from '../services/sync-engine.service'
import { SyncClusterMember } from '../models/sync.model'
import { registerTranslations } from '../i18n'
import packageJson from '../../package.json'
import changelogRaw from '../../CHANGELOG.md'

type SettingsSubTab = 'sync' | 'backups' | 'security' | 'about'
type BackupView = 'local' | 'remote'

interface ChangelogEntry {
    version: string
    date: string
    htmlBody: string
}

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
                <h3 class="m-0">{{ t('SYNC_BACKUP.TAB_TITLE') }}</h3>
                <div class="text-muted small">
                    {{ t('SYNC_BACKUP.SUBTITLE') }}
                </div>
            </div>
            <div class="d-flex align-items-center gap-2">
                <span class="badge bg-primary text-uppercase">v{{ pluginVersion }}</span>
            </div>
        </div>

        <!-- Sticky / Prominent Save Bar when settings are modified -->
        <div
            class="sticky-save-bar d-flex align-items-center justify-content-between px-3 py-2 mb-3 rounded"
            *ngIf="isDirty"
        >
            <div class="d-flex align-items-center gap-3 overflow-hidden me-3">
                <span class="badge bg-warning text-dark text-nowrap px-2 py-1 fw-bold">
                    {{ t('SYNC_BACKUP.SAVE_BAR.DIRTY') }}
                </span>
                <span class="text-light small text-truncate">
                    {{ t('SYNC_BACKUP.SAVE_BAR.DIRTY_DESC') }}
                </span>
            </div>
            <div class="d-flex align-items-center gap-2 flex-shrink-0">
                <button
                    type="button"
                    class="btn btn-sm btn-outline-secondary text-nowrap px-3"
                    (click)="discardChanges()"
                >
                    {{ t('SYNC_BACKUP.SAVE_BAR.DISCARD') }}
                </button>
                <button
                    type="button"
                    class="btn btn-sm btn-warning text-dark text-nowrap fw-bold px-3"
                    (click)="saveSettings()"
                >
                    {{ t('SYNC_BACKUP.SAVE_BAR.SAVE') }}
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
                    {{ t('SYNC_BACKUP.TABS.SYNC') }}
                </button>
            </li>
            <li class="nav-item">
                <button
                    type="button"
                    class="nav-link btn-link"
                    [class.active]="activeTab === 'backups'"
                    (click)="setTab('backups')"
                >
                    {{ t('SYNC_BACKUP.TABS.BACKUPS') }}
                </button>
            </li>
            <li class="nav-item">
                <button
                    type="button"
                    class="nav-link btn-link"
                    [class.active]="activeTab === 'security'"
                    (click)="setTab('security')"
                >
                    {{ t('SYNC_BACKUP.TABS.SECURITY') }}
                </button>
            </li>
            <li class="nav-item">
                <button
                    type="button"
                    class="nav-link btn-link"
                    [class.active]="activeTab === 'about'"
                    (click)="setTab('about')"
                >
                    {{ t('SYNC_BACKUP.TABS.ABOUT') }}
                </button>
            </li>
        </ul>

        <!-- ==================== TAB 1: SYNC ==================== -->
        <div [class.d-none]="activeTab !== 'sync'">
            <!-- 1. Live Sync Status & Manual Trigger Action -->
            <div class="card mb-3 border-primary">
                <div class="card-body d-flex align-items-center justify-content-between flex-wrap gap-3">
                    <div class="d-flex align-items-center gap-3">
                        <button
                            type="button"
                            class="btn btn-primary d-inline-flex align-items-center gap-2"
                            [disabled]="syncEngine.isSyncing || !isSyncConfigured()"
                            (click)="triggerSyncNow()"
                        >
                            <span [class.d-none]="syncEngine.isSyncing">{{ t('SYNC_BACKUP.SYNC.NOW') }}</span>
                            <span [class.d-none]="!syncEngine.isSyncing">{{ t('SYNC_BACKUP.SYNC.SYNCING') }}</span>
                        </button>
                        <div>
                            <div class="d-flex align-items-center gap-2">
                                <span
                                    class="badge"
                                    [class.bg-success]="syncEngine.lastSyncStatus === 'success'"
                                    [class.bg-warning]="syncEngine.lastSyncStatus === 'syncing' || syncEngine.lastSyncStatus === 'password_required' || syncEngine.lastSyncStatus === 'password_mismatch'"
                                    [class.text-dark]="syncEngine.lastSyncStatus === 'syncing' || syncEngine.lastSyncStatus === 'password_required' || syncEngine.lastSyncStatus === 'password_mismatch'"
                                    [class.bg-danger]="syncEngine.lastSyncStatus === 'error'"
                                    [class.bg-secondary]="syncEngine.lastSyncStatus === 'idle'"
                                >
                                    <span [class.d-none]="syncEngine.lastSyncStatus !== 'success'">{{ t('SYNC_BACKUP.SYNC.STATUS_SYNCED') }}</span>
                                    <span [class.d-none]="syncEngine.lastSyncStatus !== 'syncing'">{{ t('SYNC_BACKUP.SYNC.STATUS_IN_PROGRESS') }}</span>
                                    <span [class.d-none]="syncEngine.lastSyncStatus !== 'password_required'">{{ t('SYNC_BACKUP.SYNC.STATUS_PASSWORD_REQUIRED') }}</span>
                                    <span [class.d-none]="syncEngine.lastSyncStatus !== 'password_mismatch'">{{ t('SYNC_BACKUP.SYNC.STATUS_PASSWORD_MISMATCH') }}</span>
                                    <span [class.d-none]="syncEngine.lastSyncStatus !== 'error'">{{ t('SYNC_BACKUP.SYNC.STATUS_ERROR') }}</span>
                                    <span [class.d-none]="syncEngine.lastSyncStatus !== 'idle'">{{ t('SYNC_BACKUP.SYNC.STATUS_READY') }}</span>
                                </span>
                                <span class="small text-muted" *ngIf="syncEngine.lastSyncTime">
                                    {{ t('SYNC_BACKUP.SYNC.LAST_SYNCED') }} {{ formatClusterDate(syncEngine.lastSyncTime.toISOString()) }}
                                </span>
                            </div>
                            <div class="small text-danger mt-1" *ngIf="syncEngine.lastSyncError">
                                {{ syncEngine.lastSyncError }}
                            </div>
                            <div class="small text-muted mt-1" *ngIf="!syncEngine.lastSyncError && !isSyncConfigured()">
                                {{ t('SYNC_BACKUP.SYNC.CONFIGURE_HINT') }}
                            </div>
                        </div>
                    </div>
                    <div>
                        <span class="badge bg-secondary">{{ getProviderTitle() }}</span>
                    </div>
                </div>
            </div>

            <!-- Password Required / Mismatch Unlock Banner -->
            <div
                class="card border-warning mb-3"
                *ngIf="syncEngine.lastSyncStatus === 'password_required' || syncEngine.lastSyncStatus === 'password_mismatch'"
            >
                <div class="card-header bg-warning text-dark fw-bold d-flex justify-content-between align-items-center">
                    <span>🔐 {{ t('SYNC_BACKUP.SYNC.PASSWORD_BANNER_TITLE') }}</span>
                    <span class="badge bg-dark">{{ t('SYNC_BACKUP.SYNC.KEY_EPOCH') }} #{{ syncEngine.passwordErrorEpoch || 1 }}</span>
                </div>
                <div class="card-body">
                    <p class="small text-muted mb-2">
                        {{ syncEngine.lastSyncStatus === 'password_mismatch'
                            ? t('SYNC_BACKUP.SYNC.PASSWORD_MISMATCH_DESC', { device: syncEngine.passwordErrorDevice || 'peer', epoch: syncEngine.passwordErrorEpoch || 1 })
                            : t('SYNC_BACKUP.SYNC.PASSWORD_REQUIRED_DESC', { device: syncEngine.passwordErrorDevice || 'peer' })
                        }}
                    </p>
                    <div class="input-group">
                        <input
                            [type]="showSyncUnlockPassword ? 'text' : 'password'"
                            class="form-control"
                            [placeholder]="t('SYNC_BACKUP.SYNC.PASSWORD_PLACEHOLDER')"
                            [(ngModel)]="syncUnlockPasswordInput"
                            (keyup.enter)="applySyncUnlockPassword()"
                        />
                        <button
                            type="button"
                            class="btn btn-outline-secondary"
                            (click)="showSyncUnlockPassword = !showSyncUnlockPassword"
                        >
                            {{ showSyncUnlockPassword ? '🙈' : '👁️' }}
                        </button>
                        <button
                            type="button"
                            class="btn btn-warning"
                            [disabled]="!syncUnlockPasswordInput"
                            (click)="applySyncUnlockPassword()"
                        >
                            {{ t('SYNC_BACKUP.SYNC.UNLOCK_SYNC') }}
                        </button>
                    </div>
                </div>
            </div>

            <!-- 1. Storage Provider Configuration -->
            <div class="card mb-3">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <span class="fw-bold">{{ t('SYNC_BACKUP.SYNC.STORAGE_TITLE') }}</span>
                    <div class="d-flex align-items-center gap-2">
                        <span
                            class="badge"
                            [class.bg-secondary]="connectionStatus === 'untested'"
                            [class.bg-warning]="connectionStatus === 'testing'"
                            [class.text-dark]="connectionStatus === 'testing'"
                            [class.bg-success]="connectionStatus === 'connected'"
                            [class.bg-danger]="connectionStatus === 'error'"
                        >
                            <span [class.d-none]="connectionStatus !== 'untested'">{{ t('SYNC_BACKUP.SYNC.STATUS_UNTESTED') }}</span>
                            <span [class.d-none]="connectionStatus !== 'testing'">{{ t('SYNC_BACKUP.SYNC.STATUS_TESTING') }}</span>
                            <span [class.d-none]="connectionStatus !== 'connected'">{{ t('SYNC_BACKUP.SYNC.STATUS_CONNECTED') }}</span>
                            <span [class.d-none]="connectionStatus !== 'error'">{{ t('SYNC_BACKUP.SYNC.STATUS_DISCONNECTED') }}</span>
                        </span>
                        <span class="badge bg-secondary">{{ getProviderTitle() }}</span>
                    </div>
                </div>
                <div class="card-body">
                    <div class="mb-3">
                        <label class="form-label">{{ t('SYNC_BACKUP.SYNC.PROVIDER_TYPE') }}</label>
                        <select
                            class="form-select"
                            [(ngModel)]="formData.syncProvider"
                            (ngModelChange)="onProviderChange($event)"
                        >
                            <option value="webdav">{{ t('SYNC_BACKUP.SYNC.PROVIDER_WEBDAV') }}</option>
                            <option value="local">{{ t('SYNC_BACKUP.SYNC.PROVIDER_LOCAL') }}</option>
                        </select>
                        <div class="form-text">
                            {{ t('SYNC_BACKUP.SYNC.PROVIDER_HINT') }}
                        </div>
                    </div>

                    <!-- WebDAV Settings -->
                    <div [class.d-none]="formData.syncProvider !== 'webdav'">
                        <div class="mb-3">
                            <label class="form-label">{{ t('SYNC_BACKUP.SYNC.WEBDAV_URL') }}</label>
                            <input
                                type="text"
                                class="form-control"
                                [placeholder]="t('SYNC_BACKUP.SYNC.WEBDAV_URL_PLACEHOLDER')"
                                [value]="formData.webdavUrl"
                                (input)="onStorageParamChange('webdavUrl', $any($event.target).value)"
                            />
                            <div class="form-text">
                                {{ t('SYNC_BACKUP.SYNC.WEBDAV_URL_HINT') }}
                            </div>
                        </div>
                        <div class="row g-2 mb-3">
                            <div class="col-md-6">
                                <label class="form-label">{{ t('SYNC_BACKUP.SYNC.WEBDAV_USERNAME') }}</label>
                                <input
                                    type="text"
                                    class="form-control"
                                    [placeholder]="t('SYNC_BACKUP.SYNC.WEBDAV_USERNAME_PLACEHOLDER')"
                                    [value]="formData.webdavUsername"
                                    (input)="onStorageParamChange('webdavUsername', $any($event.target).value)"
                                />
                            </div>
                            <div class="col-md-6">
                                <label class="form-label">{{ t('SYNC_BACKUP.SYNC.WEBDAV_PASSWORD') }}</label>
                                <div class="input-group">
                                    <input
                                        [type]="showWebdavPassword ? 'text' : 'password'"
                                        class="form-control"
                                        [placeholder]="t('SYNC_BACKUP.SYNC.WEBDAV_PASSWORD_PLACEHOLDER')"
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
                            <label class="form-label">{{ t('SYNC_BACKUP.SYNC.LOCAL_PATH') }}</label>
                            <div class="input-group">
                                <input
                                    type="text"
                                    class="form-control"
                                    [placeholder]="t('SYNC_BACKUP.SYNC.LOCAL_PATH_PLACEHOLDER')"
                                    [value]="formData.localSyncPath"
                                    (input)="onStorageParamChange('localSyncPath', $any($event.target).value)"
                                />
                                <button
                                    type="button"
                                    class="btn btn-outline-secondary"
                                    (click)="browseLocalSyncFolder()"
                                >
                                    📂 {{ t('SYNC_BACKUP.SYNC.SELECT_FOLDER') }}
                                </button>
                            </div>
                            <div class="form-text">
                                {{ t('SYNC_BACKUP.SYNC.PROVIDER_HINT') }}
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
                                <span [class.d-none]="isTestingConnection">{{ t('SYNC_BACKUP.SYNC.TEST_CONNECTION') }}</span>
                                <span [class.d-none]="!isTestingConnection">{{ t('SYNC_BACKUP.SYNC.STATUS_TESTING') }}</span>
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

            <!-- 2. Selective Synchronization Card -->
            <div class="card mb-3">
                <div class="card-header">
                    <span class="fw-bold">🎛️ {{ t('SYNC_BACKUP.SYNC.SELECTIVE_TITLE') }}</span>
                </div>
                <div class="card-body">
                    <div class="form-check form-switch mb-2">
                        <input
                            class="form-check-input"
                            type="checkbox"
                            id="syncProfilesCheck"
                            [checked]="formData.syncProfiles"
                            (change)="onFieldChange('syncProfiles', $any($event.target).checked)"
                        />
                        <label class="form-check-label fw-bold" for="syncProfilesCheck">
                            {{ t('SYNC_BACKUP.SYNC.SYNC_PROFILES') }}
                        </label>
                        <div class="text-muted small">
                            {{ t('SYNC_BACKUP.SYNC.SYNC_PROFILES_HINT') }}
                        </div>
                    </div>

                    <div class="form-check form-switch mb-2">
                        <input
                            class="form-check-input"
                            type="checkbox"
                            id="syncVaultCheck"
                            [checked]="formData.syncVault"
                            (change)="onFieldChange('syncVault', $any($event.target).checked)"
                        />
                        <label class="form-check-label fw-bold" for="syncVaultCheck">
                            {{ t('SYNC_BACKUP.SYNC.SYNC_VAULT') }}
                        </label>
                        <div class="text-muted small">
                            {{ t('SYNC_BACKUP.SYNC.SYNC_VAULT_HINT') }}
                        </div>
                    </div>

                    <div class="form-check form-switch mb-3">
                        <input
                            class="form-check-input"
                            type="checkbox"
                            id="syncColorSchemesCheck"
                            [checked]="formData.syncColorSchemes"
                            (change)="onFieldChange('syncColorSchemes', $any($event.target).checked)"
                        />
                        <label class="form-check-label fw-bold" for="syncColorSchemesCheck">
                            {{ t('SYNC_BACKUP.SYNC.SYNC_COLOR_SCHEMES') }}
                        </label>
                        <div class="text-muted small">
                            {{ t('SYNC_BACKUP.SYNC.SYNC_COLOR_SCHEMES_HINT') }}
                        </div>
                    </div>

                    <div class="alert alert-secondary d-flex align-items-center gap-2 mb-0 small">
                        <span>ℹ️</span>
                        <div>
                            <strong>Cross-Platform Safety:</strong> System-specific parameters (such as <code>/bin/zsh</code> vs <code>powershell.exe</code> shell executables, window hotkeys, and window geometry) are kept local on each machine and never overwritten.
                        </div>
                    </div>
                </div>
            </div>

            <!-- 3. Synchronization Automation & Schedule Card -->
            <div class="card mb-3">
                <div class="card-header">
                    <span class="fw-bold">⚙️ {{ t('SYNC_BACKUP.SYNC.AUTOMATION_TITLE') }}</span>
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
                            {{ t('SYNC_BACKUP.SYNC.AUTOMATION_ENABLE') }}
                        </label>
                        <div class="text-muted small">
                            {{ t('SYNC_BACKUP.SYNC.AUTOMATION_ENABLE_HINT') }}
                        </div>
                    </div>

                    <div [class.d-none]="!formData.syncEnabled">
                        <div class="form-check mb-2">
                            <input
                                class="form-check-input"
                                type="checkbox"
                                id="syncOnStartupCheck"
                                [checked]="formData.syncOnStartup"
                                (change)="onFieldChange('syncOnStartup', $any($event.target).checked)"
                            />
                            <label class="form-check-label" for="syncOnStartupCheck">
                                {{ t('SYNC_BACKUP.SYNC.TRIGGER_STARTUP') }}
                            </label>
                            <div class="text-muted small">
                                {{ t('SYNC_BACKUP.SYNC.TRIGGER_STARTUP_HINT') }}
                            </div>
                        </div>

                        <div class="form-check mb-2">
                            <input
                                class="form-check-input"
                                type="checkbox"
                                id="syncOnFocusCheck"
                                [checked]="formData.syncOnFocus"
                                (change)="onFieldChange('syncOnFocus', $any($event.target).checked)"
                            />
                            <label class="form-check-label" for="syncOnFocusCheck">
                                {{ t('SYNC_BACKUP.SYNC.TRIGGER_FOCUS') }}
                            </label>
                            <div class="text-muted small">
                                {{ t('SYNC_BACKUP.SYNC.TRIGGER_FOCUS_HINT') }}
                            </div>
                        </div>

                        <div class="form-check mb-3">
                            <input
                                class="form-check-input"
                                type="checkbox"
                                id="syncOnConfigChangeCheck"
                                [checked]="formData.syncOnConfigChange"
                                (change)="onFieldChange('syncOnConfigChange', $any($event.target).checked)"
                            />
                            <label class="form-check-label" for="syncOnConfigChangeCheck">
                                {{ t('SYNC_BACKUP.SYNC.TRIGGER_CONFIG_CHANGE') }}
                            </label>
                            <div class="text-muted small">
                                {{ t('SYNC_BACKUP.SYNC.TRIGGER_CONFIG_CHANGE_HINT') }}
                            </div>
                        </div>

                        <div class="form-check mb-2">
                            <input
                                class="form-check-input"
                                type="checkbox"
                                id="periodicSyncCheck"
                                [checked]="formData.periodicSync"
                                (change)="onFieldChange('periodicSync', $any($event.target).checked)"
                            />
                            <label class="form-check-label" for="periodicSyncCheck">
                                {{ t('SYNC_BACKUP.SYNC.TRIGGER_PERIODIC') }}
                            </label>
                        </div>

                        <div class="mb-2 ps-4" [class.d-none]="!formData.periodicSync">
                            <label class="form-label small">{{ t('SYNC_BACKUP.SYNC.SYNC_INTERVAL') }}</label>
                            <select
                                class="form-select form-select-sm"
                                [(ngModel)]="formData.syncIntervalMinutes"
                                (ngModelChange)="onFieldChange('syncIntervalMinutes', $event)"
                            >
                                <option [ngValue]="5">Every 5 minutes</option>
                                <option [ngValue]="15">Every 15 minutes (Recommended)</option>
                                <option [ngValue]="30">Every 30 minutes</option>
                                <option [ngValue]="60">Every 1 hour</option>
                                <option [ngValue]="360">Every 6 hours</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 4. This Device Identity Card -->
            <div class="card mb-3">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <span class="fw-bold">{{ t('SYNC_BACKUP.SYNC.DEVICE_IDENTITY_TITLE') }}</span>
                    <span class="badge bg-dark border">{{ getPlatformLabel(thisPlatform) }}</span>
                </div>
                <div class="card-body">
                    <div class="row g-3 align-items-center">
                        <div class="col-md-6">
                            <label class="form-label small fw-bold">{{ t('SYNC_BACKUP.SYNC.DEVICE_NAME') }}</label>
                            <input
                                type="text"
                                class="form-control"
                                [placeholder]="t('SYNC_BACKUP.SYNC.DEVICE_NAME_PLACEHOLDER')"
                                [(ngModel)]="formData.deviceName"
                                (ngModelChange)="onDeviceNameChange($event)"
                            />
                            <div class="form-text">
                                {{ t('SYNC_BACKUP.SYNC.DEVICE_NAME_HINT') }}
                            </div>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small fw-bold">{{ t('SYNC_BACKUP.SYNC.DEVICE_ID') }}</label>
                            <div class="input-group">
                                <input
                                    type="text"
                                    class="form-control form-control-sm font-monospace bg-light text-dark"
                                    readonly
                                    [value]="thisDeviceId"
                                />
                                <button type="button" class="btn btn-outline-secondary btn-sm" (click)="copyDeviceId()">
                                    {{ t('SYNC_BACKUP.SYNC.COPY') }}
                                </button>
                            </div>
                            <div class="form-text">
                                {{ t('SYNC_BACKUP.SYNC.DEVICE_ID_HINT') }} (<code>devices/{{ thisDeviceId.substring(0, 8) }}...json</code>).
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 5. Connected Cluster Devices Card -->
            <div class="card mb-3">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <span class="fw-bold">🌐 {{ t('SYNC_BACKUP.SYNC.CLUSTER_TITLE') }}</span>
                    <button
                        type="button"
                        class="btn btn-outline-secondary btn-sm"
                        [disabled]="isLoadingCluster || !isSyncConfigured()"
                        (click)="loadClusterDevices()"
                    >
                        <span [class.d-none]="isLoadingCluster">🔄 Refresh Roster</span>
                        <span [class.d-none]="!isLoadingCluster">⏳ Loading...</span>
                    </button>
                </div>
                <div class="card-body">
                    <div class="text-muted small text-center py-3" *ngIf="clusterMembers.length === 0 && !isLoadingCluster">
                        No peer devices found yet in cluster registry. Click <strong>{{ t('SYNC_BACKUP.SYNC.NOW') }}</strong> to register this device.
                    </div>
                    <div class="table-responsive" *ngIf="clusterMembers.length > 0">
                        <table class="table table-sm align-middle mb-0">
                            <thead>
                                <tr>
                                    <th>{{ t('SYNC_BACKUP.SYNC.COL_DEVICE_NAME') }}</th>
                                    <th>{{ t('SYNC_BACKUP.SYNC.COL_PLATFORM') }}</th>
                                    <th>Security</th>
                                    <th>{{ t('SYNC_BACKUP.SYNC.COL_LAST_SEEN') }}</th>
                                    <th>{{ t('SYNC_BACKUP.SYNC.COL_DEVICE_ID') }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr *ngFor="let member of clusterMembers">
                                    <td>
                                        <strong>{{ member.deviceName || 'Unknown Device' }}</strong>
                                        <span class="badge bg-primary ms-1" *ngIf="member.deviceId === thisDeviceId">{{ t('SYNC_BACKUP.SYNC.THIS_DEVICE_BADGE') }}</span>
                                    </td>
                                    <td>
                                        <span class="badge bg-secondary">{{ getPlatformLabel(member.platform) }}</span>
                                    </td>
                                    <td>
                                        <span class="badge bg-success" *ngIf="member.isEncrypted">
                                            🔐 Encrypted (Epoch #{{ member.keyEpoch || 1 }})
                                        </span>
                                        <span class="badge bg-secondary" *ngIf="!member.isEncrypted">
                                            🔓 Plaintext
                                        </span>
                                    </td>
                                    <td class="small text-muted">{{ formatClusterDate(member.lastSeenAt) }}</td>
                                    <td>
                                        <code class="small user-select-all">{{ member.deviceId }}</code>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <!-- ==================== TAB 2: BACKUPS ==================== -->
        <div [class.d-none]="activeTab !== 'backups'">
            <!-- Disaster Recovery Banner (When active config is empty but snapshots exist) -->
            <div class="card border-danger mb-3" *ngIf="hasNoProfiles() && localBackups.length > 0">
                <div class="card-body bg-danger bg-opacity-10 d-flex justify-content-between align-items-center">
                    <div>
                        <div class="fw-bold text-danger">⚠️ {{ t('SYNC_BACKUP.BACKUPS.DISASTER_RECOVERY_TITLE') }}</div>
                        <div class="small text-muted">{{ t('SYNC_BACKUP.BACKUPS.DISASTER_RECOVERY_DESC', { count: localBackups.length }) }}</div>
                    </div>
                    <button
                        type="button"
                        class="btn btn-danger fw-bold"
                        (click)="restoreLocalBackup(localBackups[0])"
                    >
                        🚑 {{ t('SYNC_BACKUP.BACKUPS.QUICK_RESTORE_LATEST') }}
                    </button>
                </div>
            </div>

            <!-- Optional Inline Prompt for Historic Backup Password -->
            <div class="card border-warning mb-3" [class.d-none]="!promptRestoreSnapshot">
                <div class="card-header bg-warning text-dark fw-bold d-flex justify-content-between align-items-center">
                    <span>🔑 {{ t('SYNC_BACKUP.BACKUPS.MODAL_PASSWORD_TITLE') }}: {{ promptRestoreSnapshot?.filename }}</span>
                    <button type="button" class="btn-close" (click)="cancelPromptRestore()"></button>
                </div>
                <div class="card-body">
                    <p class="small text-muted mb-2">
                        {{ t('SYNC_BACKUP.BACKUPS.MODAL_PASSWORD_DESC') }}
                    </p>
                    <div class="input-group">
                        <input
                            [type]="showPromptPassword ? 'text' : 'password'"
                            class="form-control"
                            [placeholder]="t('SYNC_BACKUP.SYNC.PASSWORD_PLACEHOLDER')"
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
                            {{ t('SYNC_BACKUP.BACKUPS.MODAL_SUBMIT') }}
                        </button>
                    </div>
                </div>
            </div>

            <!-- Backup Policies Card -->
            <div class="card mb-3">
                <div class="card-header fw-bold">{{ t('SYNC_BACKUP.BACKUPS.OPTIONS_TITLE') }}</div>
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
                            {{ t('SYNC_BACKUP.BACKUPS.ENABLE_BACKUPS') }}
                        </label>
                        <div class="text-muted small">
                            {{ t('SYNC_BACKUP.BACKUPS.ENABLE_BACKUPS_HINT') }}
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
                            {{ t('SYNC_BACKUP.BACKUPS.BACKUP_ON_STARTUP') }}
                        </label>
                    </div>

                    <div class="mb-2">
                        <label class="form-label">{{ t('SYNC_BACKUP.BACKUPS.MAX_BACKUPS') }}</label>
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
                        {{ t('SYNC_BACKUP.BACKUPS.VIEW_LOCAL') }}
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
                        {{ t('SYNC_BACKUP.BACKUPS.VIEW_REMOTE') }}
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
                        📁 {{ t('SYNC_BACKUP.BACKUPS.OPEN_FOLDER') }}
                    </button>
                    <button
                        type="button"
                        class="btn btn-sm btn-success"
                        (click)="createLocalBackupNow()"
                    >
                        ➕ {{ t('SYNC_BACKUP.BACKUPS.CREATE_BACKUP') }}
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
                        ☁️ {{ t('SYNC_BACKUP.BACKUPS.CREATE_BACKUP') }}
                    </button>
                </div>
            </div>

            <!-- VIEW 1: LOCAL BACKUPS -->
            <div [class.d-none]="backupView !== 'local'">
                <div class="card mb-3">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <span class="fw-bold">{{ t('SYNC_BACKUP.BACKUPS.VIEW_LOCAL') }}</span>
                        <span class="text-muted small">Max retention: {{ formData.maxBackupsToKeep }}</span>
                    </div>
                    <div class="card-body p-0">
                        <div class="p-4 text-center text-muted" [class.d-none]="localBackups.length > 0">
                            {{ t('SYNC_BACKUP.BACKUPS.NO_BACKUPS') }}
                        </div>
                        <div class="table-responsive" [class.d-none]="localBackups.length === 0">
                            <table class="table table-hover m-0 align-middle">
                                <thead>
                                    <tr>
                                        <th style="width: 170px;">{{ t('SYNC_BACKUP.BACKUPS.TABLE_DATE') }}</th>
                                        <th style="width: 110px;">{{ t('SYNC_BACKUP.BACKUPS.TABLE_TYPE') }}</th>
                                        <th style="width: 150px;">{{ t('SYNC_BACKUP.BACKUPS.TABLE_SECURITY') }}</th>
                                        <th style="width: 80px;">{{ t('SYNC_BACKUP.BACKUPS.TABLE_SIZE') }}</th>
                                        <th class="text-end" style="width: 220px;">{{ t('SYNC_BACKUP.BACKUPS.TABLE_ACTIONS') }}</th>
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
                                                    ↩️ {{ t('SYNC_BACKUP.BACKUPS.RESTORE') }}
                                                </button>
                                                <button
                                                    type="button"
                                                    class="btn btn-sm btn-outline-info py-1 px-2 text-nowrap"
                                                    [disabled]="!isSyncConfigured()"
                                                    [title]="isSyncConfigured() ? 'Upload to remote /backups/' : 'Configure Sync first to upload'"
                                                    (click)="uploadLocalToRemote(item)"
                                                >
                                                    ☁️ {{ t('SYNC_BACKUP.BACKUPS.UPLOAD_REMOTE') }}
                                                </button>
                                                <button
                                                    type="button"
                                                    class="btn btn-sm btn-outline-danger py-1 px-2 text-nowrap"
                                                    title="Delete local snapshot"
                                                    (click)="deleteLocalBackup(item)"
                                                >
                                                    🗑️ {{ t('SYNC_BACKUP.BACKUPS.DELETE') }}
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
                    <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
                        <div class="d-flex align-items-center gap-2 flex-wrap">
                            <span class="fw-bold">Remote Snapshots</span>
                            <span class="badge bg-success">{{ remoteTargetDescription }}</span>

                            <!-- Device Selector Dropdown -->
                            <div class="input-group input-group-sm ms-2" style="width: auto;" *ngIf="remoteBackupDevices.length > 0">
                                <span class="input-group-text bg-transparent text-muted py-0 px-2">🖥️ Device:</span>
                                <select
                                    class="form-select form-select-sm py-0"
                                    [ngModel]="selectedRemoteBackupDeviceId"
                                    (ngModelChange)="onRemoteDeviceChanged($event)"
                                    style="width: auto; min-width: 170px;"
                                >
                                    <option *ngFor="let dev of remoteBackupDevices" [value]="dev.deviceId">
                                        {{ dev.deviceName }}{{ dev.isCurrent ? ' (This Device)' : '' }} ({{ dev.count }})
                                    </option>
                                    <option value="all">
                                        🌐 All Devices
                                    </option>
                                </select>
                            </div>
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
                                        <th *ngIf="selectedRemoteBackupDeviceId === 'all'" style="width: 150px;">Device</th>
                                        <th style="width: 110px;">Trigger</th>
                                        <th style="width: 150px;">Security</th>
                                        <th style="width: 80px;">Size</th>
                                        <th class="text-end" style="width: 180px;">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr *ngFor="let item of remoteBackups">
                                        <td class="font-monospace small text-nowrap">{{ item.formattedDate }}</td>
                                        <td *ngIf="selectedRemoteBackupDeviceId === 'all'" class="small text-nowrap">
                                            <span class="badge bg-secondary">{{ item.deviceName || item.deviceId?.substring(0, 8) || 'Unknown' }}</span>
                                        </td>
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
                <div class="card-header fw-bold">{{ t('SYNC_BACKUP.SECURITY.CARD_TITLE') }}</div>
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
                            {{ t('SYNC_BACKUP.SECURITY.ENABLE_ENCRYPTION') }}
                        </label>
                        <div class="text-muted small">
                            {{ t('SYNC_BACKUP.SECURITY.ENABLE_ENCRYPTION_HINT') }}
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
                                        {{ t('SYNC_BACKUP.SECURITY.CARD_DESC') }}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    class="btn btn-sm btn-outline-primary"
                                    (click)="isChangingPassword = !isChangingPassword"
                                >
                                    {{ isChangingPassword ? 'Cancel Change' : ('🔑 ' + t('SYNC_BACKUP.SECURITY.UPDATE_PASSWORD')) }}
                                </button>
                            </div>
                        </div>

                        <!-- Case 2: Setting password for first time OR Changing existing password -->
                        <div [class.d-none]="hasSavedPassword && !isChangingPassword" class="p-3 border rounded mb-3 security-box">
                            <h6 class="fw-bold mb-3">
                                {{ hasSavedPassword ? ('🔑 ' + t('SYNC_BACKUP.SECURITY.UPDATE_PASSWORD')) : ('🔑 ' + t('SYNC_BACKUP.SECURITY.UPDATE_PASSWORD')) }}
                            </h6>

                            <!-- Old password verification when changing -->
                            <div class="mb-3" [class.d-none]="!hasSavedPassword">
                                <label class="form-label">{{ t('SYNC_BACKUP.SECURITY.CURRENT_PASSWORD') }}</label>
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
                                    <label class="form-label">{{ t('SYNC_BACKUP.SECURITY.NEW_PASSWORD') }}</label>
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
                                    <label class="form-label">{{ t('SYNC_BACKUP.SECURITY.CONFIRM_PASSWORD') }}</label>
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
                                    <strong>{{ t('SYNC_BACKUP.SECURITY.RE_ENCRYPT_LOCAL') }}</strong>
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
                                {{ t('SYNC_BACKUP.SECURITY.UPDATE_PASSWORD') }}
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

        <!-- ==================== TAB 4: ABOUT ==================== -->
        <div [class.d-none]="activeTab !== 'about'">
            <!-- Update Available Alert Banner -->
            <div class="alert alert-success d-flex align-items-center justify-content-between mb-3 text-start flex-wrap gap-2" [class.d-none]="!updateInfo">
                <div>
                    <h6 class="alert-heading m-0">🎉 {{ t('SYNC_BACKUP.ABOUT.UPDATE_AVAILABLE_TITLE', { version: updateInfo?.version }) }}</h6>
                    <div class="small mt-1 text-muted">
                        {{ t('SYNC_BACKUP.ABOUT.UPDATE_AVAILABLE_DESC', { date: updateInfo?.publishedAt }) }}
                    </div>
                </div>
                <div class="d-flex align-items-center gap-2">
                    <button
                        type="button"
                        class="btn btn-sm btn-success"
                        (click)="openPluginsTab()"
                    >
                        📦 {{ t('SYNC_BACKUP.ABOUT.GO_TO_PLUGINS') }}
                    </button>
                    <button
                        type="button"
                        class="btn btn-sm btn-outline-secondary"
                        (click)="openUrl(updateInfo?.url || 'https://github.com/adelantad0/tabby-sync-and-backup/releases/latest')"
                    >
                        GitHub ↗
                    </button>
                </div>
            </div>

            <!-- Up-to-date Confirmation Banner -->
            <div class="alert alert-secondary mb-3 text-start small" [class.d-none]="!hasCheckedUpdates || updateInfo">
                ✅ {{ t('SYNC_BACKUP.ABOUT.RUNNING_LATEST', { version: pluginVersion }) }}
            </div>

            <div class="card mb-3">
                <div class="card-body text-center py-4">
                    <h4 class="mb-1">{{ t('SYNC_BACKUP.ABOUT.TITLE') }}</h4>
                    <div class="text-muted mb-3">
                        {{ t('SYNC_BACKUP.ABOUT.DESC') }}
                    </div>
                    <div class="d-flex justify-content-center gap-2 mb-4">
                        <span class="badge bg-primary">{{ t('SYNC_BACKUP.ABOUT.VERSION') }} {{ pluginVersion }}</span>
                        <span class="badge bg-info text-dark">MIT License</span>
                        <span class="badge bg-secondary">Author: adelantad0</span>
                    </div>

                    <div class="d-flex justify-content-center flex-wrap gap-2 mb-3">
                        <button
                            type="button"
                            class="btn btn-outline-info"
                            (click)="openUrl('https://adelantad0.github.io/tabby-sync-and-backup/')"
                        >
                            🌐 {{ t('SYNC_BACKUP.ABOUT.DOCUMENTATION') }}
                        </button>
                        <button
                            type="button"
                            class="btn btn-outline-primary"
                            (click)="openUrl('https://github.com/adelantad0/tabby-sync-and-backup')"
                        >
                            ⭐ {{ t('SYNC_BACKUP.ABOUT.GITHUB_REPO') }}
                        </button>
                        <button
                            type="button"
                            class="btn btn-outline-secondary"
                            (click)="openUrl('https://github.com/adelantad0/tabby-sync-and-backup/issues')"
                        >
                            🐞 {{ t('SYNC_BACKUP.ABOUT.REPORT_ISSUE') }}
                        </button>
                        <button
                            type="button"
                            class="btn btn-outline-success"
                            [disabled]="isCheckingUpdates"
                            (click)="checkForUpdates()"
                        >
                            <span [class.d-none]="isCheckingUpdates">🔄 {{ t('SYNC_BACKUP.ABOUT.CHECK_UPDATES') }}</span>
                            <span [class.d-none]="!isCheckingUpdates">⏳ Checking...</span>
                        </button>
                    </div>

                    <div class="d-flex justify-content-center">
                        <button
                            type="button"
                            class="btn btn-sm btn-link text-muted"
                            (click)="copyDiagnostics()"
                        >
                            {{ t('SYNC_BACKUP.ABOUT.COPY_DIAGNOSTICS') }}
                        </button>
                    </div>
                </div>
            </div>

            <!-- Dynamic Changelog & Release Notes Card -->
            <div class="card mb-3">
                <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <div class="d-flex align-items-center gap-2">
                        <span class="fw-bold">📜 Release Notes &amp; Version History</span>
                        <span class="badge bg-success" *ngIf="changelogSource === 'github'">Online (GitHub)</span>
                        <span class="badge bg-secondary" *ngIf="changelogSource === 'local'">Bundled</span>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <button
                            type="button"
                            class="btn btn-sm btn-outline-secondary"
                            [disabled]="isLoadingChangelog"
                            (click)="refreshChangelog()"
                            title="Refresh Release Notes from GitHub"
                        >
                            <span [class.d-none]="isLoadingChangelog">🔄 Refresh</span>
                            <span [class.d-none]="!isLoadingChangelog">⏳ Loading...</span>
                        </button>
                        <button
                            type="button"
                            class="btn btn-sm btn-outline-secondary"
                            (click)="openUrl('https://github.com/adelantad0/tabby-sync-and-backup/releases')"
                        >
                            View on GitHub ↗
                        </button>
                    </div>
                </div>
                <div class="card-body changelog-scroll-container">
                    <div *ngIf="isLoadingChangelog && changelogEntries.length === 0" class="text-center py-3 text-muted">
                        <i class="fas fa-spinner fa-spin me-2"></i> Loading release history...
                    </div>
                    <div *ngIf="!isLoadingChangelog && changelogEntries.length === 0" class="text-muted small">
                        No release notes found.
                    </div>
                    <div *ngFor="let item of changelogEntries; let last = last" class="mb-3">
                        <div class="d-flex align-items-center gap-2 mb-2 flex-wrap">
                            <span class="badge bg-primary" *ngIf="item.version === pluginVersion">v{{ item.version }} (Current)</span>
                            <span class="badge bg-secondary" *ngIf="item.version !== pluginVersion">v{{ item.version }}</span>
                            <span class="text-muted small" *ngIf="item.date">{{ item.date }}</span>
                        </div>
                        <div class="ps-2 text-start small changelog-body" [innerHTML]="item.htmlBody"></div>
                        <hr *ngIf="!last" class="my-3 opacity-25" />
                    </div>
                </div>
            </div>
        </div>
    `,
    styles: [
        `
            .sticky-save-bar {
                position: sticky;
                top: 0;
                z-index: 1050;
                background: #1e2227;
                border: 1px solid rgba(255, 193, 7, 0.85);
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
                min-height: 48px;
            }
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
            .changelog-scroll-container {
                max-height: 400px;
                overflow-y: auto;
                padding-right: 12px;
            }
            .changelog-scroll-container::-webkit-scrollbar {
                width: 6px;
            }
            .changelog-scroll-container::-webkit-scrollbar-track {
                background: rgba(0, 0, 0, 0.15);
                border-radius: 4px;
            }
            .changelog-scroll-container::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.2);
                border-radius: 4px;
            }
            .changelog-scroll-container::-webkit-scrollbar-thumb:hover {
                background: rgba(255, 255, 255, 0.35);
            }
            .changelog-body code {
                background: rgba(255, 255, 255, 0.1);
                color: #e2e8f0;
                padding: 1px 5px;
                border-radius: 4px;
                font-size: 85%;
            }
            .changelog-body ul {
                margin-bottom: 0.5rem;
            }
            .changelog-body li {
                margin-bottom: 0.25rem;
                line-height: 1.45;
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

    changelogEntries: ChangelogEntry[] = []
    isLoadingChangelog: boolean = false
    changelogSource: 'github' | 'local' = 'local'

    isDirty: boolean = false
    formData: any = {
        syncEnabled: false,
        syncIntervalMinutes: 15,
        syncProvider: 'webdav',
        webdavUrl: '',
        webdavUsername: '',
        webdavPassword: '',
        webdavPath: '/tabby-config.yaml',
        localSyncPath: '',
        syncProfiles: true,
        syncVault: false,
        syncColorSchemes: true,
        syncOnStartup: true,
        syncOnFocus: false,
        syncOnConfigChange: true,
        periodicSync: false,
        backupEnabled: true,
        backupOnStartup: true,
        maxBackupsToKeep: 10,
        encryptionEnabled: false,
        encryptionPassword: '',
    }

    localBackups: BackupSnapshotItem[] = []
    remoteBackups: BackupSnapshotItem[] = []
    remoteBackupDevices: RemoteBackupDeviceItem[] = []
    selectedRemoteBackupDeviceId: string = ''
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

    // Device Identity & Multi-Device Cluster State
    thisDeviceId: string = ''
    thisDeviceName: string = ''
    thisPlatform: string = ''
    clusterMembers: SyncClusterMember[] = []
    isLoadingCluster: boolean = false

    // Quick sync unlock input
    syncUnlockPasswordInput: string = ''
    showSyncUnlockPassword: boolean = false

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
        public deviceIdentity: DeviceIdentityService,
        public syncEngine: SyncEngineService,
        public translate: TranslateService,
        private app: AppService,
    ) {
        registerTranslations(this.translate)
    }

    t(key: string, params?: Record<string, any>): string {
        let str = this.translate.instant(key, params) || key
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                const val = (v !== undefined && v !== null) ? String(v) : ''
                str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), val)
            }
        }
        return str
    }

    async ngOnInit(): Promise<void> {
        this.resetForm()
        this.loadLocalChangelog()
        this.refreshChangelog().catch(() => null)
        await this.loadLocalBackups()
        if (this.isSyncConfigured()) {
            await this.loadRemoteBackups()
        }
        await this.loadClusterDevices()
    }

    resetForm(): void {
        const saved = this.config.store?.syncAndBackup || {}
        this.thisDeviceId = this.deviceIdentity.getDeviceId()
        this.thisDeviceName = this.deviceIdentity.getDeviceName()
        this.thisPlatform = this.deviceIdentity.getPlatform()
        this.selectedRemoteBackupDeviceId = this.thisDeviceId

        this.formData = {
            syncEnabled: saved.syncEnabled ?? false,
            syncIntervalMinutes: saved.syncIntervalMinutes ?? 15,
            syncProvider: saved.syncProvider === 'gist' ? 'webdav' : (saved.syncProvider || 'webdav'),
            webdavUrl: saved.webdavUrl || '',
            webdavUsername: saved.webdavUsername || '',
            webdavPassword: saved.webdavPassword || '',
            webdavPath: saved.webdavPath || '/tabby-config.yaml',
            localSyncPath: saved.localSyncPath || '',

            deviceId: this.thisDeviceId,
            deviceName: this.thisDeviceName,

            syncProfiles: saved.syncProfiles ?? true,
            syncVault: saved.syncVault ?? false,
            syncColorSchemes: saved.syncColorSchemes ?? true,

            syncOnStartup: saved.syncOnStartup ?? true,
            syncOnFocus: saved.syncEnabled ? (saved.syncOnFocus ?? false) : false,
            syncOnConfigChange: saved.syncOnConfigChange ?? true,
            periodicSync: saved.periodicSync ?? false,

            backupEnabled: saved.backupEnabled ?? true,
            backupOnStartup: saved.backupOnStartup ?? true,
            maxBackupsToKeep: saved.maxBackupsToKeep ?? 10,
            encryptionEnabled: saved.encryptionEnabled ?? false,
            encryptionPassword: saved.encryptionPassword || '',
            keyEpoch: saved.keyEpoch ?? 1,
            keyUpdatedAt: saved.keyUpdatedAt ?? null,
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
                this.notifications.notice(this.t('SYNC_BACKUP.NOTIFICATIONS.CONNECTION_PASSED', { msg: result.message }))
            } else {
                this.notifications.error(this.t('SYNC_BACKUP.NOTIFICATIONS.CONNECTION_FAILED', { msg: result.message }))
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
        if (field === 'syncEnabled' && value === true) {
            // When enabling automated sync, ensure default triggers (startup & config change) are active
            if (!this.formData.syncOnStartup && !this.formData.syncOnConfigChange && !this.formData.syncOnFocus && !this.formData.periodicSync) {
                this.formData.syncOnStartup = true
                this.formData.syncOnConfigChange = true
            }
        }
        this.isDirty = true
        this.remoteTargetDescription = this.backupService.getRemoteTargetDescription()
    }

    onDeviceNameChange(name: string): void {
        this.formData.deviceName = name
        this.thisDeviceName = name
        this.isDirty = true
    }

    copyDeviceId(): void {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
            navigator.clipboard.writeText(this.thisDeviceId).then(() => {
                this.notifications.info(this.t('SYNC_BACKUP.NOTIFICATIONS.DEVICE_ID_COPIED'))
            }).catch(() => {
                this.notifications.info(`Device ID: ${this.thisDeviceId}`)
            })
        } else {
            this.notifications.info(`Device ID: ${this.thisDeviceId}`)
        }
    }

    async applySyncUnlockPassword(): Promise<void> {
        const pass = (this.syncUnlockPasswordInput || '').trim()
        if (!pass) return

        this.formData.encryptionEnabled = true
        this.formData.encryptionPassword = pass
        if (this.syncEngine.passwordErrorEpoch) {
            this.formData.keyEpoch = this.syncEngine.passwordErrorEpoch
            this.formData.keyUpdatedAt = Date.now()
        }
        await this.saveSettings()
        this.syncUnlockPasswordInput = ''
        await this.triggerSyncNow()
    }

    async triggerSyncNow(): Promise<void> {
        try {
            await this.syncEngine.syncNow(true)
            await this.loadClusterDevices()
            await this.loadLocalBackups()
        } catch (e) {
            // Error notification handled in syncEngine
        }
    }

    async loadClusterDevices(): Promise<void> {
        if (!this.isSyncConfigured()) {
            this.clusterMembers = []
            return
        }

        this.isLoadingCluster = true
        try {
            const target = this.syncService.getActiveTargetConfig()
            const registry = await this.syncService.fetchClusterRegistry(target)
            if (registry && registry.members) {
                this.clusterMembers = Object.values(registry.members)
            } else {
                this.clusterMembers = []
            }
        } catch (e) {
            console.warn('[tabby-sync-and-backup] Could not load cluster registry:', e)
        } finally {
            this.isLoadingCluster = false
        }
    }

    formatClusterDate(isoString: string): string {
        if (!isoString) return 'Never'
        try {
            const d = new Date(isoString)
            return d.toLocaleString()
        } catch {
            return isoString
        }
    }

    getPlatformLabel(plat: string): string {
        if (plat === 'darwin') return 'macOS'
        if (plat === 'win32') return 'Windows'
        if (plat === 'linux') return 'Linux'
        return plat || 'Unknown'
    }

    async saveSettings(): Promise<void> {
        if (!this.config.store.syncAndBackup) {
            this.config.store.syncAndBackup = {}
        }
        Object.assign(this.config.store.syncAndBackup, this.formData)
        await this.config.save()

        if (this.formData.deviceName) {
            await this.deviceIdentity.setDeviceName(this.formData.deviceName)
        }
        this.syncEngine.restartPeriodicTimer()

        this.isDirty = false
        this.remoteTargetDescription = this.backupService.getRemoteTargetDescription()

        // Apply retention policy immediately to local and remote snapshots
        if (this.formData.maxBackupsToKeep) {
            await this.backupService.rotateLocalBackups(this.formData.maxBackupsToKeep)
            if (this.isSyncConfigured()) {
                await this.backupService.rotateRemoteBackups(this.formData.maxBackupsToKeep)
            }
        }

        this.notifications.notice(this.t('SYNC_BACKUP.NOTIFICATIONS.SETTINGS_SAVED'))
        await this.loadLocalBackups()
        if (this.isSyncConfigured()) {
            await this.loadRemoteBackups()
        } else {
            this.remoteBackups = []
            this.remoteBackupDevices = []
        }
    }

    discardChanges(): void {
        this.resetForm()
        this.notifications.info(this.t('SYNC_BACKUP.NOTIFICATIONS.SETTINGS_DISCARDED'))
    }

    async setTab(tab: SettingsSubTab): Promise<void> {
        if (this.isDirty && tab !== this.activeTab) {
            const res = await this.platform.showMessageBox({
                type: 'warning',
                message: this.t('SYNC_BACKUP.SAVE_BAR.DIRTY'),
                detail: this.t('SYNC_BACKUP.SAVE_BAR.SWITCH_PROMPT') || this.t('SYNC_BACKUP.SAVE_BAR.DIRTY_DESC'),
                buttons: [
                    this.t('SYNC_BACKUP.SAVE_BAR.SAVE'),
                    this.t('SYNC_BACKUP.SAVE_BAR.DISCARD'),
                    this.t('SYNC_BACKUP.BACKUPS.MODAL_CANCEL') || 'Cancel',
                ],
                defaultId: 0,
                cancelId: 2,
            })
            if (res.response === 0) {
                await this.saveSettings()
            } else if (res.response === 1) {
                this.discardChanges()
            } else {
                return
            }
        }
        this.activeTab = tab
        if (tab === 'sync') {
            this.loadClusterDevices()
        } else if (tab === 'backups') {
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

    hasNoProfiles(): boolean {
        const list = (this.config.store?.profiles || []).filter((p: any) => !p.isBuiltin)
        return list.length === 0
    }

    async applyPasswordUpdate(): Promise<void> {
        if (!this.canApplyPassword()) return

        const currentSavedPassword = this.formData.encryptionPassword || ''

        // Verify old password if one was set
        if (this.hasSavedPassword && this.oldPasswordInput !== currentSavedPassword) {
            this.notifications.error(this.t('SYNC_BACKUP.NOTIFICATIONS.PASSWORD_VERIFY_FAILED'))
            return
        }

        const newPass = this.newPasswordInput
        const oldPass = this.oldPasswordInput || currentSavedPassword

        // 1. Re-encrypt local backups if checked
        if (this.reEncryptLocalBackups && this.hasSavedPassword && oldPass) {
            try {
                const res = await this.backupService.reEncryptAllLocalBackups(oldPass, newPass)
                this.notifications.notice(this.t('SYNC_BACKUP.NOTIFICATIONS.RE_ENCRYPT_SUCCESS', { count: res.successCount }))
            } catch (err: any) {
                this.notifications.error(this.t('SYNC_BACKUP.NOTIFICATIONS.RE_ENCRYPT_FAILED', { err: err?.message || err }))
            }
        }

        // 2. Update form and config
        this.formData.encryptionPassword = newPass
        this.formData.encryptionEnabled = true
        this.formData.keyEpoch = (this.formData.keyEpoch || 1) + 1
        this.formData.keyUpdatedAt = Date.now()
        await this.saveSettings()

        this.isChangingPassword = false
        this.oldPasswordInput = ''
        this.newPasswordInput = ''
        this.confirmPasswordInput = ''
        this.notifications.notice(this.t('SYNC_BACKUP.NOTIFICATIONS.PASSWORD_UPDATED', { epoch: this.formData.keyEpoch }))
        await this.loadLocalBackups()

        // 3. Immediately re-encrypt and publish cloud sync state if configured
        if (this.isSyncConfigured()) {
            this.triggerSyncNow().catch(err => {
                console.warn('[tabby-sync-and-backup] Post-password change sync notice:', err)
            })
        }
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
            this.remoteBackupDevices = []
            return
        }
        this.isLoadingBackups = true
        this.remoteTargetDescription = this.backupService.getRemoteTargetDescription()
        try {
            this.remoteBackupDevices = await this.backupService.listRemoteBackupDevices()
            if (!this.selectedRemoteBackupDeviceId) {
                this.selectedRemoteBackupDeviceId = this.thisDeviceId
            }
            this.remoteBackups = await this.backupService.listRemoteBackups(this.selectedRemoteBackupDeviceId)
        } catch (e: any) {
            this.notifications.error(`Could not fetch remote backups: ${e?.message || e}`)
            this.remoteBackups = []
        } finally {
            this.isLoadingBackups = false
        }
    }

    async onRemoteDeviceChanged(deviceId: string): Promise<void> {
        this.selectedRemoteBackupDeviceId = deviceId
        this.isLoadingBackups = true
        try {
            this.remoteBackups = await this.backupService.listRemoteBackups(this.selectedRemoteBackupDeviceId)
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
            this.notifications.notice(this.t('SYNC_BACKUP.NOTIFICATIONS.LOCAL_SNAPSHOT_CREATED', { filename: snapshot.filename }))
        } catch (e: any) {
            this.notifications.error(this.t('SYNC_BACKUP.NOTIFICATIONS.LOCAL_SNAPSHOT_FAILED', { err: e?.message || e }))
        }
    }

    async createRemoteBackupNow(): Promise<void> {
        if (!this.isSyncConfigured()) {
            this.notifications.error(this.t('SYNC_BACKUP.NOTIFICATIONS.REMOTE_CONFIGURE_FIRST'))
            return
        }
        this.isLoadingBackups = true
        try {
            const snapshot = await this.backupService.createRemoteBackup('Manual')
            await this.loadRemoteBackups()
            this.notifications.notice(this.t('SYNC_BACKUP.NOTIFICATIONS.REMOTE_SNAPSHOT_CREATED', { filename: snapshot.filename }))
        } catch (e: any) {
            this.notifications.error(this.t('SYNC_BACKUP.NOTIFICATIONS.REMOTE_SNAPSHOT_FAILED', { err: e?.message || e }))
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
            this.notifications.notice(this.t('SYNC_BACKUP.NOTIFICATIONS.RESTORE_SUCCESS'))
            setTimeout(() => {
                this.hostApp.relaunch()
            }, 800)
        } catch (e: any) {
            if (e?.message === 'PASSWORD_REQUIRED' || e?.message === 'INVALID_PASSWORD') {
                this.promptRestoreSnapshot = item
                this.promptPasswordInput = ''
                this.notifications.info(this.t('SYNC_BACKUP.NOTIFICATIONS.ENTER_PASSWORD_FOR_SNAPSHOT', { filename: item.filename }))
            } else {
                this.notifications.error(this.t('SYNC_BACKUP.NOTIFICATIONS.RESTORE_FAILED', { err: e?.message || e }))
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
            this.notifications.notice(this.t('SYNC_BACKUP.NOTIFICATIONS.RESTORE_SUCCESS'))
            setTimeout(() => {
                this.hostApp.relaunch()
            }, 800)
        } catch (e: any) {
            if (e?.message === 'PASSWORD_REQUIRED' || e?.message === 'INVALID_PASSWORD') {
                this.promptRestoreSnapshot = item
                this.promptPasswordInput = ''
                this.notifications.info(this.t('SYNC_BACKUP.NOTIFICATIONS.ENTER_PASSWORD_FOR_SNAPSHOT', { filename: item.filename }))
            } else {
                this.notifications.error(this.t('SYNC_BACKUP.NOTIFICATIONS.RESTORE_FAILED', { err: e?.message || e }))
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
            this.notifications.notice(this.t('SYNC_BACKUP.NOTIFICATIONS.RESTORE_SUCCESS'))
            this.promptRestoreSnapshot = null
            this.promptPasswordInput = ''
            await this.loadLocalBackups()
            setTimeout(() => {
                this.hostApp.relaunch()
            }, 800)
        } catch (e: any) {
            this.notifications.error(this.t('SYNC_BACKUP.NOTIFICATIONS.DECRYPTION_FAILED'))
        }
    }

    cancelPromptRestore(): void {
        this.promptRestoreSnapshot = null
        this.promptPasswordInput = ''
    }

    async uploadLocalToRemote(item: BackupSnapshotItem): Promise<void> {
        if (!this.isSyncConfigured()) {
            this.notifications.error(this.t('SYNC_BACKUP.NOTIFICATIONS.REMOTE_CONFIGURE_FIRST'))
            return
        }
        try {
            await this.backupService.uploadLocalSnapshotToRemote(item)
            this.notifications.notice(this.t('SYNC_BACKUP.NOTIFICATIONS.UPLOAD_REMOTE_SUCCESS', { filename: item.filename }))
            if (this.backupView === 'remote') {
                await this.loadRemoteBackups()
            }
        } catch (e: any) {
            this.notifications.error(this.t('SYNC_BACKUP.NOTIFICATIONS.REMOTE_SNAPSHOT_FAILED', { err: e?.message || e }))
        }
    }

    async deleteLocalBackup(item: BackupSnapshotItem): Promise<void> {
        try {
            await this.backupService.deleteLocalBackup(item.filename)
            await this.loadLocalBackups()
            this.notifications.info(this.t('SYNC_BACKUP.NOTIFICATIONS.SNAPSHOT_DELETED_LOCAL'))
        } catch (e: any) {
            this.notifications.error(this.t('SYNC_BACKUP.NOTIFICATIONS.DELETE_FAILED', { err: e?.message || e }))
        }
    }

    async deleteRemoteBackup(item: BackupSnapshotItem): Promise<void> {
        try {
            await this.backupService.deleteRemoteBackup(item)
            await this.loadRemoteBackups()
            this.notifications.info(this.t('SYNC_BACKUP.NOTIFICATIONS.SNAPSHOT_DELETED_REMOTE'))
        } catch (e: any) {
            this.notifications.error(this.t('SYNC_BACKUP.NOTIFICATIONS.DELETE_FAILED', { err: e?.message || e }))
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
                    this.t('SYNC_BACKUP.NOTIFICATIONS.UPDATE_AVAILABLE_NOTICE', { version: latestTag }),
                )
            } else {
                this.hasCheckedUpdates = true
                this.notifications.notice(
                    this.t('SYNC_BACKUP.NOTIFICATIONS.LATEST_VERSION', { version: this.pluginVersion }),
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

    openPluginsTab(): void {
        try {
            const settingsTab = this.app.tabs.find((tab: any) => tab instanceof SettingsTabComponent || tab.activeTab !== undefined) as any
            if (settingsTab) {
                settingsTab.activeTab = 'plugins'
            }
        } catch (e) {
            console.warn('[tabby-sync-and-backup] Could not set settingsTab.activeTab:', e)
        }

        // 1. Switch settings navigation to 'plugins' tab
        setTimeout(() => {
            const navLinks = Array.from(document.querySelectorAll('a[ngbnavlink], ul.nav-pills a, .nav-link, a'))
            const pluginLink = navLinks.find(el => {
                const text = (el.textContent || '').trim().toLowerCase()
                const id = (el.getAttribute('id') || '').toLowerCase()
                return (
                    text === 'plugins' ||
                    text === 'плагины' ||
                    text === '插件' ||
                    id.includes('plugins') ||
                    el.closest('[ngbnavitem="plugins"]') !== null
                )
            }) as HTMLElement | null

            if (pluginLink) {
                pluginLink.click()
            }

            // 2. Select the "Installed" sub-tab within the Plugins page
            setTimeout(() => {
                const subNavLinks = Array.from(document.querySelectorAll('ul.nav-tabs a, a[ngbnavlink], .nav-link'))
                const installedLink = subNavLinks.find(el => {
                    const text = (el.textContent || '').trim().toLowerCase()
                    return (
                        text === 'installed' ||
                        text === 'установленные' ||
                        text === '已安装'
                    )
                }) as HTMLElement | null

                if (installedLink) {
                    installedLink.click()
                }
            }, 100)
        }, 30)
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
            this.notifications.notice(this.t('SYNC_BACKUP.NOTIFICATIONS.DIAGNOSTICS_COPIED'))
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
                return this.t('SYNC_BACKUP.SYNC.LOCAL_PATH')
            default:
                return provider
        }
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

    formatMarkdown(text: string): string {
        if (!text) return ''
        let html = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')

        // Section headers
        html = html.replace(/###\s+(Added|Fixed|Changed|Security|Removed|Deprecated)[^\n]*/gi, (_, cat) => {
            const lower = cat.toLowerCase()
            const colorClass = lower === 'fixed' ? 'text-info' : lower === 'added' ? 'text-success' : 'text-warning'
            return `<div class="fw-bold mt-2 mb-1 ${colorClass}">${cat}:</div>`
        })

        // Bold and inline code
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

        // Lists
        html = html.replace(/^-\s+(.+)$/gm, '<li>$1</li>')
        html = html.replace(/(<li>.*<\/li>(\r?\n)?)+/g, (match) => `<ul class="mb-1 ps-3">${match}</ul>`)

        // Line breaks for paragraphs that aren't inside lists
        html = html.replace(/\n\n/g, '<br/>')

        return html
    }

    loadLocalChangelog(): void {
        try {
            const entries: ChangelogEntry[] = []
            const sections = (changelogRaw || '').split(/\n##\s+\[?/)
            for (const sec of sections) {
                if (!sec.trim()) continue
                const firstLineEnd = sec.indexOf('\n')
                const header = (firstLineEnd !== -1 ? sec.substring(0, firstLineEnd) : sec).trim()
                const body = (firstLineEnd !== -1 ? sec.substring(firstLineEnd) : '').trim()
                const vMatch = header.match(/^v?([0-9]+\.[0-9]+\.[0-9]+[^\]\s]*)/)
                if (!vMatch) continue
                const version = vMatch[1]
                const dMatch = header.match(/\b(20\d\d-\d\d-\d\d)\b/)
                const date = dMatch ? dMatch[1] : ''
                entries.push({
                    version,
                    date,
                    htmlBody: this.formatMarkdown(body),
                })
            }
            if (entries.length > 0) {
                this.changelogEntries = entries
                this.changelogSource = 'local'
            }
        } catch (e) {
            console.warn('[tabby-sync-and-backup] Could not parse local changelog:', e)
        }
    }

    async refreshChangelog(): Promise<void> {
        this.isLoadingChangelog = true
        try {
            const response = await fetch(
                'https://api.github.com/repos/adelantad0/tabby-sync-and-backup/releases?per_page=10',
                {
                    headers: { Accept: 'application/vnd.github.v3+json' },
                },
            )
            if (response.ok) {
                const releases = await response.json()
                if (Array.isArray(releases) && releases.length > 0) {
                    this.changelogEntries = releases.map((r: any) => ({
                        version: (r.tag_name || '').replace(/^v/, ''),
                        date: r.published_at ? new Date(r.published_at).toISOString().split('T')[0] : '',
                        htmlBody: this.formatMarkdown(r.body || ''),
                    }))
                    this.changelogSource = 'github'
                }
            }
        } catch (err) {
            console.warn('[tabby-sync-and-backup] Could not fetch remote releases, using bundled changelog:', err)
        } finally {
            this.isLoadingChangelog = false
        }
    }
}
