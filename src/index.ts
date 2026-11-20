import { NgModule, Injectable } from '@angular/core'
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
    ) {
        super()
    }

    provide(): ToolbarButton[] {
        return [
            {
                icon: syncIcon,
                title: 'Sync & Backup',
                weight: 5, // Positioned on the right toolbar section
                click: () => {
                    console.log('[tabby-sync-and-backup] Button clicked')
                    this.notifications.info('Tabby Sync & Backup is ready!')
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
    constructor(private notifications: NotificationsService) {
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
            this.notifications.info('Sync & Backup: Synchronizing...')
            return true
        }
        if (id === 'sync-and-backup:create-backup') {
            console.log('[tabby-sync-and-backup] Backup hotkey triggered')
            this.notifications.info('Sync & Backup: Backup created!')
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
            syncIntervalMinutes: 30,
            syncProvider: 'webdav', // 'webdav' | 'local'
            webdavUrl: '',
            webdavUsername: '',
            webdavPassword: '',
            webdavPath: '/tabby-config.yaml',
            localSyncPath: '',
            lastSyncedAt: null,

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
    providers: [
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
    constructor() {
        console.log('[tabby-sync-and-backup] Plugin initialized successfully in Tabby!')
    }
}
