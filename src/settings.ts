import { Injectable } from '@angular/core'
import { SettingsTabProvider } from 'tabby-settings'
import { TranslateService } from 'tabby-core'
import { SyncAndBackupSettingsTabComponent } from './components/syncAndBackupSettingsTab.component'
import { registerTranslations } from './i18n'

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

    constructor(private translate: TranslateService) {
        super()
        registerTranslations(this.translate)
        this.title = this.translate.instant('SYNC_BACKUP.TAB_TITLE')
    }

    getComponentType(): any {
        return SyncAndBackupSettingsTabComponent
    }
}
