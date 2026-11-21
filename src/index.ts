import { NgModule, Injectable } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import {
    ToolbarButtonProvider,
    ToolbarButton,
    NotificationsService,
    HotkeyProvider,
    HotkeyDescription,
    ConfigProvider,
    AppService,
} from 'tabby-core'
import { SettingsTabProvider } from 'tabby-settings'

import { SyncAndBackupSettingsTabProvider } from './settings'
import { SyncAndBackupSettingsTabComponent } from './components/syncAndBackupSettingsTab.component'
import { BackupService } from './services/backup.service'
import { SyncService } from './services/sync.service'
import { DeviceIdentityService } from './services/device-identity.service'
import { SyncMergerService } from './services/sync-merger.service'
import { SyncEngineService } from './services/sync-engine.service'

// @ts-ignore
import syncIcon from './icons/sync.svg'

/**
 * 1. Toolbar Button Provider for Tabby Sync & Backup
 */
@Injectable()
export class SyncAndBackupToolbarButtonProvider extends ToolbarButtonProvider {
    constructor(
        private notifications: NotificationsService,
        private app: AppService,
        private syncEngine: SyncEngineService,
    ) {
        super()
    }

    provide(): ToolbarButton[] {
        return [
            {
                icon: syncIcon,
                title: 'Sync & Backup: Synchronize Now',
                weight: 5, // Positioned on the right toolbar section
                click: async () => {
                    console.log('[tabby-sync-and-backup] Toolbar button clicked')
                    try {
                        await this.syncEngine.syncNow(true)
                    } catch (e) {
                        // Handled in service
                    }
                },
            },
        ]
    }
}

/**
 * 2. Hotkey Provider for Sync & Backup actions
 */
@Injectable()
export class SyncAndBackupHotkeyProvider extends HotkeyProvider {
    constructor(
        private notifications: NotificationsService,
        private syncEngine: SyncEngineService,
        private backupService: BackupService,
    ) {
        super()
    }

    async provide(): Promise<HotkeyDescription[]> {
        return [
            {
                id: 'sync-and-backup:sync',
                name: 'Sync & Backup: Synchronize Settings',
            },
            {
                id: 'sync-and-backup:create-backup',
                name: 'Sync & Backup: Create Local Backup',
            },
        ]
    }

    handle(id: string): boolean {
        if (id === 'sync-and-backup:sync') {
            console.log('[tabby-sync-and-backup] Sync hotkey triggered')
            this.syncEngine.syncNow(true).catch(e => {
                console.warn('[tabby-sync-and-backup] Hotkey sync error:', e)
            })
            return true
        }
        if (id === 'sync-and-backup:create-backup') {
            console.log('[tabby-sync-and-backup] Backup hotkey triggered')
            this.backupService.createLocalBackup('Manual').then(() => {
                this.notifications.notice('Sync & Backup: Manual backup created!')
            }).catch(e => {
                this.notifications.error(`Backup failed: ${e?.message || e}`)
            })
            return true
        }
        return false
    }
}

/**
 * 3. Configuration Provider for Sync & Backup defaults
 */
@Injectable()
export class SyncAndBackupConfigProvider extends ConfigProvider {
    defaults = {
        syncAndBackup: {
            // Sync settings
            syncEnabled: false,
            syncProvider: 'webdav', // 'webdav' | 'local'
            webdavUrl: '',
            webdavUsername: '',
            webdavPassword: '',
            webdavPath: '/tabby-config.yaml',
            localSyncPath: '',
            lastSyncedAt: null,

            // Device identity
            deviceId: '',
            deviceName: '',

            // Selective sync settings
            syncProfiles: true,
            syncVault: false,
            syncColorSchemes: true,

            // Sync triggers
            syncOnStartup: true,
            syncOnFocus: true,
            periodicSync: false,
            syncIntervalMinutes: 15,

            // Backup settings
            backupEnabled: true,
            backupOnStartup: true,
            maxBackupsToKeep: 10,
            lastBackupAt: null,

            // Security settings
            encryptionEnabled: false,
            encryptionPassword: '',
        },
    }
}

/**
 * 4. Main NgModule for Tabby Sync & Backup
 */
@NgModule({
    imports: [
        CommonModule,
        FormsModule,
    ],
    providers: [
        DeviceIdentityService,
        SyncMergerService,
        SyncEngineService,
        SyncService,
        BackupService,
        { provide: ToolbarButtonProvider, useClass: SyncAndBackupToolbarButtonProvider, multi: true },
        { provide: HotkeyProvider, useClass: SyncAndBackupHotkeyProvider, multi: true },
        { provide: ConfigProvider, useClass: SyncAndBackupConfigProvider, multi: true },
        { provide: SettingsTabProvider, useClass: SyncAndBackupSettingsTabProvider, multi: true },
    ],
    declarations: [
        SyncAndBackupSettingsTabComponent,
    ],
    entryComponents: [
        SyncAndBackupSettingsTabComponent,
    ],
})
export default class SyncAndBackupModule {
    constructor(private syncEngine: SyncEngineService) {
        console.log('[tabby-sync-and-backup] Plugin initialized successfully in Tabby!')
        this.syncEngine.init()
    }
}

export { DeviceIdentityService } from './services/device-identity.service'
export { SyncMergerService } from './services/sync-merger.service'
export { SyncEngineService } from './services/sync-engine.service'
export { SyncService } from './services/sync.service'
export * from './models/sync.model'
