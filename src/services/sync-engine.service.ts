import { Injectable } from '@angular/core'
import { ConfigService, NotificationsService, TranslateService } from 'tabby-core'
import { SyncService } from './sync.service'
import { DeviceIdentityService } from './device-identity.service'
import { SyncMergerService } from './sync-merger.service'
import { BackupService } from './backup.service'
import { registerTranslations } from '../i18n'
import {
    SyncMergeResult,
    SyncClusterMember,
    SyncPasswordRequiredError,
    SyncPasswordMismatchError,
} from '../models/sync.model'

export type SyncEngineStatus = 'idle' | 'syncing' | 'success' | 'error' | 'password_required' | 'password_mismatch'

@Injectable({ providedIn: 'root' })
export class SyncEngineService {
    isSyncing = false
    lastSyncStatus: SyncEngineStatus = 'idle'
    lastSyncError?: string
    lastSyncResult?: SyncMergeResult
    lastSyncTime?: Date
    passwordErrorDevice?: string
    passwordErrorEpoch?: number

    private lastFocusSyncTimestamp = 0
    private periodicIntervalId: any = null
    private isInitialized = false
    private configChangeTimer: any = null
    private lastSyncedConfigHash = ''

    constructor(
        private config: ConfigService,
        private notifications: NotificationsService,
        private syncService: SyncService,
        private deviceIdentity: DeviceIdentityService,
        private syncMerger: SyncMergerService,
        private backupService: BackupService,
        private translate: TranslateService,
    ) {
        registerTranslations(this.translate)
    }

    /**
     * Initialize automatic sync triggers (Startup, Window Focus, Periodic interval)
     */
    init(): void {
        if (this.isInitialized) return
        this.isInitialized = true

        console.log('[tabby-sync-and-backup] SyncEngineService initializing...')

        // Sanity Check: If Tabby native store.encrypted is true, disable it to prevent startup crash loop
        if (this.config.store?.encrypted) {
            console.warn('[tabby-sync-and-backup] Detected native store.encrypted=true flag. Resetting to false to prevent startup loop.')
            this.config.store.encrypted = false
            this.config.save().catch(e => console.warn('Could not save sanitized config:', e))
        }

        // Disaster Recovery Check: If profiles are completely empty (e.g. after Erase config), notify about available backups
        setTimeout(async () => {
            try {
                const profiles = (this.config.store.profiles || []).filter((p: any) => !p.isBuiltin)
                if (profiles.length === 0) {
                    const snapshots = await this.backupService.listLocalBackups()
                    if (snapshots.length > 0) {
                        this.notifications.notice(this.translate.instant('SYNC_BACKUP.NOTIFICATIONS.DISASTER_RECOVERY_AVAILABLE', { count: snapshots.length }))
                    }
                }
            } catch (e) {
                // Ignore background check error
            }
        }, 2500)

        // 1. Startup sync trigger (delayed by 4 seconds to allow Tabby UI to settle)
        setTimeout(() => {
            const cfg = this.config.store?.syncAndBackup
            if (cfg?.syncEnabled && cfg?.syncOnStartup) {
                console.log('[tabby-sync-and-backup] Triggering startup sync...')
                this.syncNow(false).catch(err => {
                    console.warn('[tabby-sync-and-backup] Startup sync encountered an issue:', err)
                })
            }
        }, 4000)

        // 2. Window focus listener (debounced by 30 seconds)
        if (typeof window !== 'undefined') {
            window.addEventListener('focus', () => {
                const now = Date.now()
                const cfg = this.config.store?.syncAndBackup
                if (cfg?.syncEnabled && cfg?.syncOnFocus) {
                    if (now - this.lastFocusSyncTimestamp > 30000) {
                        this.lastFocusSyncTimestamp = now
                        console.log('[tabby-sync-and-backup] Window gained focus, triggering sync...')
                        this.syncNow(false).catch(err => {
                            console.warn('[tabby-sync-and-backup] Window focus sync encountered an issue:', err)
                        })
                    }
                }
            })
        }

        // 3. Periodic timer
        this.restartPeriodicTimer()

        // 4. Initialize baseline hash of synchronized entities
        try {
            const initialLocalState = this.syncMerger.buildLocalDeviceState()
            this.lastSyncedConfigHash = this.deviceIdentity.hashContent({
                profiles: initialLocalState.profiles,
                groups: initialLocalState.profileGroups,
                vault: initialLocalState.vault,
                colorSchemes: initialLocalState.themes,
            })
        } catch {
            // Ignore initial hash error
        }

        // 5. Config change trigger (debounced by 3.5 seconds)
        if (this.config.changed$) {
            this.config.changed$.subscribe(() => {
                const cfg = this.config.store?.syncAndBackup
                if (!cfg?.syncEnabled || !cfg?.syncOnConfigChange || this.isSyncing) {
                    return
                }

                if (this.configChangeTimer) {
                    clearTimeout(this.configChangeTimer)
                }

                this.configChangeTimer = setTimeout(() => {
                    const currentCfg = this.config.store?.syncAndBackup
                    if (!currentCfg?.syncEnabled || !currentCfg?.syncOnConfigChange || this.isSyncing) {
                        return
                    }

                    try {
                        const localState = this.syncMerger.buildLocalDeviceState()
                        const contentToHash = {
                            profiles: localState.profiles,
                            groups: localState.profileGroups,
                            vault: localState.vault,
                            colorSchemes: localState.themes,
                        }
                        const currentHash = this.deviceIdentity.hashContent(contentToHash)
                        if (currentHash === this.lastSyncedConfigHash) {
                            return
                        }
                        console.log('[tabby-sync-and-backup] Config change detected on synced entities, triggering auto-sync...')
                        this.syncNow(false).catch(err => {
                            console.warn('[tabby-sync-and-backup] Config change sync encountered an issue:', err)
                        })
                    } catch (e) {
                        console.warn('[tabby-sync-and-backup] Error evaluating config change:', e)
                    }
                }, 3500)
            })
        }
    }

    /**
     * Restart or update periodic timer based on config
     */
    restartPeriodicTimer(): void {
        if (this.periodicIntervalId) {
            clearInterval(this.periodicIntervalId)
            this.periodicIntervalId = null
        }

        const cfg = this.config.store?.syncAndBackup
        if (cfg?.syncEnabled && cfg?.periodicSync) {
            const minutes = Math.max(1, cfg.syncIntervalMinutes || 15)
            const ms = minutes * 60 * 1000
            console.log(`[tabby-sync-and-backup] Setting periodic sync every ${minutes} min`)
            this.periodicIntervalId = setInterval(() => {
                if (this.config.store?.syncAndBackup?.syncEnabled) {
                    this.syncNow(false).catch(err => {
                        console.warn('[tabby-sync-and-backup] Periodic sync error:', err)
                    })
                }
            }, ms)
        }
    }

    /**
     * Execute full multi-device synchronization cycle
     */
    async syncNow(manual: boolean = false): Promise<SyncMergeResult> {
        if (this.isSyncing) {
            console.log('[tabby-sync-and-backup] Sync already in progress, skipping.')
            return (
                this.lastSyncResult || {
                    profilesAdded: 0,
                    profilesUpdated: 0,
                    profilesDeleted: 0,
                    conflictsCreated: 0,
                    groupsAdded: 0,
                    groupsUpdated: 0,
                    groupsDeleted: 0,
                    vaultUpdated: false,
                    themesUpdated: 0,
                }
            )
        }

        const target = this.syncService.getActiveTargetConfig()
        if (target.provider === 'local' && !target.localSyncPath) {
            const msg = 'Local sync path is not configured. Please set a destination folder in Settings.'
            if (manual) this.notifications.error(msg)
            throw new Error(msg)
        }
        if (target.provider === 'webdav' && !target.webdavUrl) {
            const msg = 'WebDAV URL is not configured. Please enter your server URL in Settings.'
            if (manual) this.notifications.error(msg)
            throw new Error(msg)
        }

        this.isSyncing = true
        this.lastSyncStatus = 'syncing'
        this.lastSyncError = undefined
        this.passwordErrorDevice = undefined
        this.passwordErrorEpoch = undefined

        try {
            console.log('[tabby-sync-and-backup] Starting sync cycle...')

            // STEP 1: Always create a safety Pre-Sync backup snapshot before touching any config!
            try {
                await this.backupService.createLocalBackup('Pre-Sync')
                console.log('[tabby-sync-and-backup] Safety Pre-Sync backup created successfully.')
            } catch (backupErr) {
                console.warn('[tabby-sync-and-backup] Could not create Pre-Sync backup:', backupErr)
            }

            // STEP 2: Fetch peer device states from cluster storage
            const clusterStates = await this.syncService.fetchClusterDeviceStates(target)
            console.log(`[tabby-sync-and-backup] Fetched ${clusterStates.length} device states from cluster.`)

            // STEP 3: Build local device state and merge
            const cachedPreviousState = this.config.store?.syncAndBackup?._lastPublishedState || null
            const localState = this.syncMerger.buildLocalDeviceState(cachedPreviousState)

            const { mergedState, result } = await this.syncMerger.mergeClusterStates(localState, clusterStates)

            // STEP 4: Publish updated state to devices/<deviceId>.json
            await this.syncService.publishDeviceState(target, mergedState)

            // Update cluster.json registry
            const currentMember: SyncClusterMember = {
                deviceId: mergedState.deviceId,
                deviceName: mergedState.deviceName,
                platform: mergedState.platform,
                lastSeenAt: new Date().toISOString(),
                formatVersion: mergedState.formatVersion,
            }
            await this.syncService.updateClusterRegistry(target, currentMember)

            // Cache published state locally in config store
            if (!this.config.store.syncAndBackup) {
                this.config.store.syncAndBackup = {}
            }
            this.config.store.syncAndBackup._lastPublishedState = mergedState
            this.config.store.syncAndBackup.lastSyncedAt = Date.now()
            await this.config.save()

            // Update baseline hash of synced entities to prevent circular sync trigger
            try {
                this.lastSyncedConfigHash = this.deviceIdentity.hashContent({
                    profiles: mergedState.profiles,
                    groups: mergedState.profileGroups,
                    vault: mergedState.vault,
                    colorSchemes: mergedState.themes,
                })
            } catch {
                // Ignore hash update error
            }

            // Update internal service status
            this.lastSyncStatus = 'success'
            this.lastSyncTime = new Date()
            this.lastSyncResult = result
            this.lastSyncError = undefined
            this.passwordErrorDevice = undefined
            this.passwordErrorEpoch = undefined

            // STEP 5: Notify user
            const changesCount =
                result.profilesAdded +
                result.profilesUpdated +
                result.profilesDeleted +
                result.conflictsCreated +
                result.groupsAdded +
                result.groupsUpdated +
                result.groupsDeleted

            if (changesCount > 0) {
                const parts: string[] = []
                if (result.profilesAdded > 0) parts.push(`+${result.profilesAdded} added`)
                if (result.profilesUpdated > 0) parts.push(`~${result.profilesUpdated} updated`)
                if (result.profilesDeleted > 0) parts.push(`-${result.profilesDeleted} deleted`)
                if (result.conflictsCreated > 0) parts.push(`!${result.conflictsCreated} conflicts`)
                const summary = parts.join(', ')

                this.notifications.notice(this.translate.instant('SYNC_BACKUP.NOTIFICATIONS.SYNC_COMPLETED', { summary }))
            } else if (manual) {
                this.notifications.notice(this.translate.instant('SYNC_BACKUP.NOTIFICATIONS.SYNC_UP_TO_DATE'))
            }

            return result
        } catch (err: any) {
            console.error('[tabby-sync-and-backup] Sync cycle failed:', err)
            if (err instanceof SyncPasswordRequiredError) {
                this.lastSyncStatus = 'password_required'
                this.passwordErrorDevice = err.peerDeviceName
                this.passwordErrorEpoch = err.remoteEpoch
                this.lastSyncError = `Master password required: sync payload from "${err.peerDeviceName}" is encrypted (Key Epoch #${err.remoteEpoch}).`
                this.notifications.error(this.lastSyncError)
            } else if (err instanceof SyncPasswordMismatchError) {
                this.lastSyncStatus = 'password_mismatch'
                this.passwordErrorDevice = err.peerDeviceName
                this.passwordErrorEpoch = err.remoteEpoch
                this.lastSyncError = `Master password mismatch on "${err.peerDeviceName}" (Remote Epoch #${err.remoteEpoch}, Local Epoch #${err.localEpoch}).`
                this.notifications.error(this.lastSyncError)
            } else {
                this.lastSyncStatus = 'error'
                this.lastSyncError = err?.message || String(err)
                if (manual) {
                    this.notifications.error(this.translate.instant('SYNC_BACKUP.NOTIFICATIONS.SYNC_FAILED', { err: this.lastSyncError }))
                }
            }
            throw err
        } finally {
            this.isSyncing = false
        }
    }
}
