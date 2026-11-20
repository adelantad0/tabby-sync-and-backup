import { Component, HostBinding } from '@angular/core'
import { ConfigService } from 'tabby-core'

/**
 * Settings tab component for Tabby Sync & Backup
 */
@Component({
    selector: 'sync-and-backup-settings-tab',
    template: `
        <h3 class="mb-3">Sync &amp; Backup</h3>

        <div class="card mb-3">
            <div class="card-body">
                <h5 class="card-title">Synchronization</h5>
                <p class="card-text text-muted">
                    Sync your Tabby configuration, profiles, and themes across devices.
                </p>
                <div class="form-check form-switch mb-2">
                    <input
                        class="form-check-input"
                        type="checkbox"
                        id="enableAutoSync"
                        [checked]="config.store?.syncAndBackup?.syncEnabled"
                        (change)="toggleAutoSync($event)"
                    />
                    <label class="form-check-label" for="enableAutoSync">
                        Enable automatic background sync
                    </label>
                </div>
            </div>
        </div>

        <div class="card mb-3">
            <div class="card-body">
                <h5 class="card-title">Automated Backups</h5>
                <p class="card-text text-muted">
                    Keep versioned local snapshots of your configuration to prevent data loss.
                </p>
                <div class="form-check form-switch mb-2">
                    <input
                        class="form-check-input"
                        type="checkbox"
                        id="enableBackups"
                        [checked]="config.store?.syncAndBackup?.backupEnabled"
                        (change)="toggleBackups($event)"
                    />
                    <label class="form-check-label" for="enableBackups">
                        Create backup snapshot before every sync
                    </label>
                </div>
            </div>
        </div>
    `,
})
export class SyncAndBackupSettingsTabComponent {
    @HostBinding('class.content-box') true = true

    constructor(public config: ConfigService) {}

    toggleAutoSync(event: Event): void {
        const input = event.target as HTMLInputElement
        if (this.config.store?.syncAndBackup) {
            this.config.store.syncAndBackup.syncEnabled = input.checked
            this.config.save()
        }
    }

    toggleBackups(event: Event): void {
        const input = event.target as HTMLInputElement
        if (this.config.store?.syncAndBackup) {
            this.config.store.syncAndBackup.backupEnabled = input.checked
            this.config.save()
        }
    }
}
