import { Injectable } from '@angular/core'
import { SettingsTabProvider } from 'tabby-settings'
import { SyncAndBackupSettingsTabComponent } from './components/syncAndBackupSettingsTab.component'

/**
 * Settings Tab Provider for Tabby Sync & Backup
 * Registers a tab in the left settings navigation of Tabby
 */
@Injectable()
export class SyncAndBackupSettingsTabProvider extends SettingsTabProvider {
    id = 'sync-and-backup'
    icon = 'cloud'
    title = 'Sync & Backup'
    weight = 10

    getComponentType(): any {
        return SyncAndBackupSettingsTabComponent
    }
}
