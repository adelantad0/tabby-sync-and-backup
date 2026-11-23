import { Injectable } from '@angular/core'
import { ConfigService, NotificationsService } from 'tabby-core'
import * as fs from 'fs'
import * as path from 'path'
import { CryptoService, EncryptionStatus } from './crypto.service'
import { DeviceIdentityService } from './device-identity.service'

export type BackupTrigger = 'Manual' | 'Pre-Sync' | 'Startup' | 'Pre-Restore'

export interface BackupSnapshotItem {
    id: string
    filename: string
    timestamp: number
    formattedDate: string
    sizeKb: number
    trigger: BackupTrigger
    location: 'local' | 'remote'
    encryptionStatus: EncryptionStatus
    fullPath?: string
    remoteUrl?: string
    deviceId?: string
    deviceName?: string
}

export interface RemoteBackupDeviceItem {
    deviceId: string
    deviceName: string
    count: number
    isCurrent?: boolean
}

/**
 * Cross-platform helper to resolve Tabby configuration directory
 */
export function getTabbyConfigDir(): string {
    const home = process.env.HOME || process.env.USERPROFILE || ''
    if (process.platform === 'darwin') {
        return path.join(home, 'Library', 'Application Support', 'tabby')
    }
    if (process.platform === 'win32') {
        return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'tabby')
    }
    const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, '.config')
    return path.join(xdgConfig, 'tabby')
}

/**
 * Format a Date object into human-readable YYYY-MM-DD HH:mm:ss
 */
function formatTimestamp(d: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/**
 * Generate a standard backup filename
 */
function generateBackupFilename(d: Date, trigger: string): string {
    const pad = (n: number) => n.toString().padStart(2, '0')
    const dateStr = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
    const triggerSlug = trigger.toLowerCase().replace(/[^a-z0-9]/g, '')
    return `tabby-backup-${dateStr}-${triggerSlug}.yaml`
}

/**
 * Parse date and trigger from a standard backup filename
 */
function parseBackupFilename(filename: string): { timestamp: number; trigger: BackupTrigger } {
    const match = filename.match(/^tabby-backup-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-([a-z0-9]+)\.yaml$/)
    if (match) {
        const [, year, month, day, hour, min, sec, slug] = match
        const date = new Date(
            parseInt(year, 10),
            parseInt(month, 10) - 1,
            parseInt(day, 10),
            parseInt(hour, 10),
            parseInt(min, 10),
            parseInt(sec, 10),
        )
        let trigger: BackupTrigger = 'Manual'
        if (slug === 'presync') trigger = 'Pre-Sync'
        if (slug === 'startup') trigger = 'Startup'
        if (slug === 'prerestore') trigger = 'Pre-Restore'
        return { timestamp: date.getTime(), trigger }
    }
    return { timestamp: Date.now(), trigger: 'Manual' }
}

@Injectable({ providedIn: 'root' })
export class BackupService {
    constructor(
        private config: ConfigService,
        private notifications: NotificationsService,
        private deviceIdentity: DeviceIdentityService,
    ) {}

    // ==========================================
    // 1. LOCAL BACKUP ENGINE
    // ==========================================

    getLocalBackupsDir(): string {
        return path.join(getTabbyConfigDir(), 'backups')
    }

    ensureLocalBackupsDir(): string {
        const dir = this.getLocalBackupsDir()
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
        }
        return dir
    }

    async listLocalBackups(): Promise<BackupSnapshotItem[]> {
        const dir = this.ensureLocalBackupsDir()
        const files = fs.readdirSync(dir)
        const snapshots: BackupSnapshotItem[] = []
        const currentPassword = this.config.store?.syncAndBackup?.encryptionPassword || ''

        for (const file of files) {
            if (file.startsWith('tabby-backup-') && file.endsWith('.yaml')) {
                const fullPath = path.join(dir, file)
                try {
                    const stats = fs.statSync(fullPath)
                    const parsed = parseBackupFilename(file)
                    const ts = parsed.timestamp || stats.mtimeMs

                    // Lightweight header inspection to detect encryption & password validity
                    let encStatus: EncryptionStatus = 'unencrypted'
                    try {
                        const fd = fs.openSync(fullPath, 'r')
                        const buf = Buffer.alloc(2048)
                        const bytesRead = fs.readSync(fd, buf, 0, 2048, 0)
                        fs.closeSync(fd)
                        const sample = buf.toString('utf8', 0, bytesRead)
                        encStatus = CryptoService.checkPassword(sample, currentPassword)
                    } catch (e) {
                        console.warn(`[tabby-sync-and-backup] Header check failed for ${file}:`, e)
                    }

                    snapshots.push({
                        id: file,
                        filename: file,
                        timestamp: ts,
                        formattedDate: formatTimestamp(new Date(ts)),
                        sizeKb: Math.round((stats.size / 1024) * 10) / 10,
                        trigger: parsed.trigger,
                        location: 'local',
                        encryptionStatus: encStatus,
                        fullPath,
                    })
                } catch (e) {
                    console.error(`[tabby-sync-and-backup] Could not stat backup file ${file}:`, e)
                }
            }
        }

        snapshots.sort((a, b) => b.timestamp - a.timestamp)
        return snapshots
    }

    /**
     * Sanitize raw configuration YAML before saving backup or restoring.
     * Cleans accidental null bytes while preserving Tabby's native structure.
     */
    sanitizeConfigYaml(rawYaml: string): string {
        if (!rawYaml || typeof rawYaml !== 'string') return ''
        // Clean any accidental null bytes
        return rawYaml.replace(/\0/g, '')
    }

    async createLocalBackup(
        trigger: BackupTrigger = 'Manual',
        overridePassword?: string,
    ): Promise<BackupSnapshotItem> {
        const dir = this.ensureLocalBackupsDir()
        const now = new Date()
        const filename = generateBackupFilename(now, trigger)
        const fullPath = path.join(dir, filename)

        // Read active raw configuration and sanitize
        let payload = this.sanitizeConfigYaml(this.config.readRaw())
        const isEncrypted = !!this.config.store?.syncAndBackup?.encryptionEnabled
        const password = overridePassword || this.config.store?.syncAndBackup?.encryptionPassword

        let encStatus: EncryptionStatus = 'unencrypted'

        if (isEncrypted && password) {
            payload = CryptoService.encrypt(payload, password)
            encStatus = 'encrypted_matches'
        }

        fs.writeFileSync(fullPath, payload, 'utf8')
        const stats = fs.statSync(fullPath)

        const snapshot: BackupSnapshotItem = {
            id: filename,
            filename,
            timestamp: now.getTime(),
            formattedDate: formatTimestamp(now),
            sizeKb: Math.round((stats.size / 1024) * 10) / 10,
            trigger,
            location: 'local',
            encryptionStatus: encStatus,
            fullPath,
        }

        // Apply local retention rotation
        const maxToKeep = this.config.store?.syncAndBackup?.maxBackupsToKeep || 10
        await this.rotateLocalBackups(maxToKeep)

        // Update last backup timestamp
        if (this.config.store?.syncAndBackup) {
            this.config.store.syncAndBackup.lastBackupAt = now.getTime()
            await this.config.save()
        }

        return snapshot
    }

    async restoreLocalBackup(filename: string, customPassword?: string): Promise<void> {
        const dir = this.ensureLocalBackupsDir()
        const fullPath = path.join(dir, filename)

        if (!fs.existsSync(fullPath)) {
            throw new Error(`Snapshot file not found: ${filename}`)
        }

        const rawFileContent = fs.readFileSync(fullPath, 'utf8')
        let targetConfigYaml = rawFileContent

        if (CryptoService.isEncrypted(rawFileContent)) {
            const passwordToUse = customPassword || this.config.store?.syncAndBackup?.encryptionPassword
            if (!passwordToUse) {
                throw new Error('PASSWORD_REQUIRED')
            }
            try {
                targetConfigYaml = CryptoService.decrypt(rawFileContent, passwordToUse)
            } catch (err: any) {
                throw new Error('INVALID_PASSWORD')
            }
        }

        // Sanitize target YAML to prevent rogue root-level encrypted: true from bricking Tabby startup
        targetConfigYaml = this.sanitizeConfigYaml(targetConfigYaml)

        // 1. Capture current plugin configuration so restoring an older Tabby snapshot
        // never erases the user's master encryption password or sync targets.
        const currentPluginConfig = this.config.store?.syncAndBackup
            ? JSON.parse(JSON.stringify(this.config.store.syncAndBackup))
            : null

        // 2. Create safety pre-restore backup first
        try {
            await this.createLocalBackup('Pre-Restore')
        } catch (e) {
            console.warn('[tabby-sync-and-backup] Safety backup failed before restore:', e)
        }

        // 3. Write target config and reload Tabby config store
        await this.config.writeRaw(targetConfigYaml)
        await this.config.load()

        // 4. Preserve current syncAndBackup configuration so encryption keys & credentials persist.
        // If config was previously wiped, re-inject customPassword so future syncs/restores don't fail.
        if (!this.config.store.syncAndBackup) {
            this.config.store.syncAndBackup = {}
        }
        if (currentPluginConfig) {
            Object.assign(this.config.store.syncAndBackup, currentPluginConfig)
        }
        if (customPassword) {
            this.config.store.syncAndBackup.encryptionPassword = customPassword
            this.config.store.syncAndBackup.encryptionEnabled = true
        }
        await this.config.save()
    }

    async deleteLocalBackup(filename: string): Promise<void> {
        const dir = this.ensureLocalBackupsDir()
        const fullPath = path.join(dir, filename)
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath)
        }
    }

    async rotateLocalBackups(maxToKeep: number): Promise<void> {
        const snapshots = await this.listLocalBackups()
        if (snapshots.length > maxToKeep) {
            const excess = snapshots.slice(maxToKeep)
            for (const item of excess) {
                try {
                    await this.deleteLocalBackup(item.filename)
                    console.log(`[tabby-sync-and-backup] Rotated local backup: ${item.filename}`)
                } catch (e) {
                    console.error(`[tabby-sync-and-backup] Failed to rotate local backup ${item.filename}:`, e)
                }
            }
        }
    }

    /**
     * Batch re-encrypt all local encrypted backups when master password changes
     */
    async reEncryptAllLocalBackups(oldPass: string, newPass: string): Promise<{ successCount: number; failCount: number }> {
        const dir = this.ensureLocalBackupsDir()
        const files = fs.readdirSync(dir)
        let successCount = 0
        let failCount = 0

        for (const file of files) {
            if (file.startsWith('tabby-backup-') && file.endsWith('.yaml')) {
                const fullPath = path.join(dir, file)
                try {
                    const content = fs.readFileSync(fullPath, 'utf8')
                    if (CryptoService.isEncrypted(content)) {
                        const updated = CryptoService.reEncrypt(content, oldPass, newPass)
                        fs.writeFileSync(fullPath, updated, 'utf8')
                        successCount++
                    }
                } catch (e) {
                    console.error(`[tabby-sync-and-backup] Could not re-encrypt ${file}:`, e)
                    failCount++
                }
            }
        }

        return { successCount, failCount }
    }

    // ==========================================
    // 2. REMOTE BACKUP ENGINE
    // ==========================================

    getRemoteTargetDescription(): string {
        const provider = this.config.store?.syncAndBackup?.syncProvider || 'webdav'
        if (provider === 'local') {
            const syncPath = this.config.store?.syncAndBackup?.localSyncPath || ''
            return syncPath ? `Local Directory (${path.join(syncPath, 'backups')})` : 'Local Directory (Not configured)'
        }
        if (provider === 'webdav') {
            const url = this.config.store?.syncAndBackup?.webdavUrl || ''
            return url ? `WebDAV (${url}/backups)` : 'WebDAV (Not configured)'
        }
        return 'Not configured'
    }

    async listRemoteBackups(targetDeviceId?: string): Promise<BackupSnapshotItem[]> {
        const provider = this.config.store?.syncAndBackup?.syncProvider || 'webdav'

        if (provider === 'local') {
            return this.listRemoteLocalBackups(targetDeviceId)
        }
        if (provider === 'webdav') {
            return this.listRemoteWebDAVBackups(targetDeviceId)
        }

        return []
    }

    async listRemoteBackupDevices(): Promise<RemoteBackupDeviceItem[]> {
        const provider = this.config.store?.syncAndBackup?.syncProvider || 'webdav'
        const currentDeviceId = this.deviceIdentity.getDeviceId()
        const currentDeviceName = this.deviceIdentity.getDeviceName()
        const nameMap = await this.getClusterDeviceNameMap()

        if (provider === 'local') {
            const syncPath = this.config.store?.syncAndBackup?.localSyncPath
            if (!syncPath || !fs.existsSync(syncPath)) return []
            const backupsDir = path.join(syncPath, 'backups')
            if (!fs.existsSync(backupsDir)) return []

            const entries = fs.readdirSync(backupsDir, { withFileTypes: true })
            const devices: RemoteBackupDeviceItem[] = []
            let legacyCount = 0

            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const devId = entry.name
                    const devDirPath = path.join(backupsDir, devId)
                    const files = fs.readdirSync(devDirPath).filter(f => f.startsWith('tabby-backup-') && f.endsWith('.yaml'))
                    const devName = devId === currentDeviceId ? currentDeviceName : (nameMap[devId] || `Device (${devId.substring(0, 8)})`)
                    devices.push({
                        deviceId: devId,
                        deviceName: devName,
                        count: files.length,
                        isCurrent: devId === currentDeviceId,
                    })
                } else if (entry.isFile() && entry.name.startsWith('tabby-backup-') && entry.name.endsWith('.yaml')) {
                    legacyCount++
                }
            }

            const currentDevEntry = devices.find(d => d.deviceId === currentDeviceId)
            if (!currentDevEntry) {
                devices.unshift({
                    deviceId: currentDeviceId,
                    deviceName: currentDeviceName,
                    count: legacyCount,
                    isCurrent: true,
                })
            } else if (legacyCount > 0 && currentDevEntry.count === 0) {
                currentDevEntry.count = legacyCount
            }

            devices.sort((a, b) => {
                if (a.isCurrent) return -1
                if (b.isCurrent) return 1
                return (a.deviceName || '').localeCompare(b.deviceName || '')
            })

            return devices
        }

        if (provider === 'webdav') {
            return this.listRemoteWebDAVBackupDevices(nameMap)
        }

        return []
    }

    async createRemoteBackup(
        trigger: BackupTrigger = 'Manual',
        overridePassword?: string,
    ): Promise<BackupSnapshotItem> {
        let rawContent = this.config.readRaw()
        const isEncrypted = !!this.config.store?.syncAndBackup?.encryptionEnabled
        const password = overridePassword || this.config.store?.syncAndBackup?.encryptionPassword

        if (isEncrypted && password) {
            rawContent = CryptoService.encrypt(rawContent, password)
        }

        const now = new Date()
        const filename = generateBackupFilename(now, trigger)
        const provider = this.config.store?.syncAndBackup?.syncProvider || 'webdav'

        let snapshot: BackupSnapshotItem

        if (provider === 'local') {
            snapshot = await this.saveRemoteLocalFile(filename, rawContent, now, trigger)
        } else if (provider === 'webdav') {
            snapshot = await this.uploadWebDAVFile(filename, rawContent, now, trigger)
        } else {
            throw new Error(`Unsupported remote backup provider: ${provider}`)
        }

        // Apply remote retention rotation ONLY for current device
        const maxToKeep = this.config.store?.syncAndBackup?.maxBackupsToKeep || 10
        await this.rotateRemoteBackups(maxToKeep)

        return snapshot
    }

    async uploadLocalSnapshotToRemote(item: BackupSnapshotItem): Promise<void> {
        const localDir = this.ensureLocalBackupsDir()
        const fullPath = path.join(localDir, item.filename)
        if (!fs.existsSync(fullPath)) {
            throw new Error(`Local file not found: ${item.filename}`)
        }
        const content = fs.readFileSync(fullPath, 'utf8')
        const provider = this.config.store?.syncAndBackup?.syncProvider || 'webdav'

        if (provider === 'local') {
            await this.saveRemoteLocalFile(item.filename, content, new Date(item.timestamp), item.trigger)
        } else if (provider === 'webdav') {
            await this.uploadWebDAVFile(item.filename, content, new Date(item.timestamp), item.trigger)
        }

        const maxToKeep = this.config.store?.syncAndBackup?.maxBackupsToKeep || 10
        await this.rotateRemoteBackups(maxToKeep)
    }

    async restoreRemoteBackup(item: BackupSnapshotItem, customPassword?: string): Promise<void> {
        const provider = this.config.store?.syncAndBackup?.syncProvider || 'webdav'
        let content = ''

        if (provider === 'local') {
            const syncPath = this.config.store?.syncAndBackup?.localSyncPath
            if (!syncPath) throw new Error('Local sync directory path is not configured')
            let remoteFile = item.fullPath
            if (!remoteFile || !fs.existsSync(remoteFile)) {
                const devId = item.deviceId || this.deviceIdentity.getDeviceId()
                remoteFile = path.join(syncPath, 'backups', devId, item.filename)
                if (!fs.existsSync(remoteFile)) {
                    remoteFile = path.join(syncPath, 'backups', item.filename)
                }
            }
            if (!fs.existsSync(remoteFile)) throw new Error(`Remote file does not exist: ${remoteFile}`)
            content = fs.readFileSync(remoteFile, 'utf8')
        } else if (provider === 'webdav') {
            if (item.remoteUrl) {
                content = await this.downloadWebDAVFileByUrl(item.remoteUrl)
            } else {
                content = await this.downloadWebDAVFile(item.filename, item.deviceId)
            }
        }

        let targetConfigYaml = content
        if (CryptoService.isEncrypted(content)) {
            const passwordToUse = customPassword || this.config.store?.syncAndBackup?.encryptionPassword
            if (!passwordToUse) {
                throw new Error('PASSWORD_REQUIRED')
            }
            try {
                targetConfigYaml = CryptoService.decrypt(content, passwordToUse)
            } catch {
                throw new Error('INVALID_PASSWORD')
            }
        }

        // Sanitize target YAML to prevent rogue root-level encrypted: true from bricking Tabby startup
        targetConfigYaml = this.sanitizeConfigYaml(targetConfigYaml)

        // 1. Capture current plugin configuration so restoring an older Tabby snapshot
        // never erases the user's master encryption password or sync targets.
        const currentPluginConfig = this.config.store?.syncAndBackup
            ? JSON.parse(JSON.stringify(this.config.store.syncAndBackup))
            : null

        // 2. Create safety pre-restore backup first
        try {
            await this.createLocalBackup('Pre-Restore')
        } catch (e) {
            console.warn('[tabby-sync-and-backup] Safety backup failed before remote restore:', e)
        }

        // 3. Write target config and reload Tabby config store
        await this.config.writeRaw(targetConfigYaml)
        await this.config.load()

        // 4. Preserve current syncAndBackup configuration so encryption keys & credentials persist.
        // If config was previously wiped, re-inject customPassword so future syncs/restores don't fail.
        if (!this.config.store.syncAndBackup) {
            this.config.store.syncAndBackup = {}
        }
        if (currentPluginConfig) {
            Object.assign(this.config.store.syncAndBackup, currentPluginConfig)
        }
        if (customPassword) {
            this.config.store.syncAndBackup.encryptionPassword = customPassword
            this.config.store.syncAndBackup.encryptionEnabled = true
        }
        await this.config.save()
    }

    async deleteRemoteBackup(itemOrFilename: BackupSnapshotItem | string, deviceId?: string): Promise<void> {
        const provider = this.config.store?.syncAndBackup?.syncProvider || 'webdav'
        const filename = typeof itemOrFilename === 'string' ? itemOrFilename : itemOrFilename.filename
        const fullPath = typeof itemOrFilename !== 'string' ? itemOrFilename.fullPath : undefined
        const remoteUrl = typeof itemOrFilename !== 'string' ? itemOrFilename.remoteUrl : undefined
        const targetDeviceId = (typeof itemOrFilename !== 'string' ? itemOrFilename.deviceId : deviceId) || this.deviceIdentity.getDeviceId()

        if (provider === 'local') {
            const syncPath = this.config.store?.syncAndBackup?.localSyncPath
            if (syncPath) {
                if (fullPath && fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath)
                    return
                }
                const deviceFile = path.join(syncPath, 'backups', targetDeviceId, filename)
                if (fs.existsSync(deviceFile)) {
                    fs.unlinkSync(deviceFile)
                    return
                }
                const legacyFile = path.join(syncPath, 'backups', filename)
                if (fs.existsSync(legacyFile)) {
                    fs.unlinkSync(legacyFile)
                    return
                }
            }
        } else if (provider === 'webdav') {
            if (remoteUrl) {
                await this.deleteWebDAVFileByUrl(remoteUrl)
            } else {
                await this.deleteWebDAVFile(filename, targetDeviceId)
            }
        }
    }

    async rotateRemoteBackups(maxToKeep: number): Promise<void> {
        try {
            const currentDeviceId = this.deviceIdentity.getDeviceId()
            // Only rotate snapshots belonging to THIS device
            const myRemoteSnapshots = await this.listRemoteBackups(currentDeviceId)
            if (myRemoteSnapshots.length > maxToKeep) {
                const excess = myRemoteSnapshots.slice(maxToKeep)
                for (const item of excess) {
                    try {
                        await this.deleteRemoteBackup(item)
                        console.log(`[tabby-sync-and-backup] Rotated remote backup for device ${currentDeviceId}: ${item.filename}`)
                    } catch (e) {
                        console.error(`[tabby-sync-and-backup] Failed to rotate remote backup ${item.filename}:`, e)
                    }
                }
            }
        } catch (err) {
            console.error('[tabby-sync-and-backup] Remote rotation failed:', err)
        }
    }

    // --- Private Remote Local Helpers ---

    private async getClusterDeviceNameMap(): Promise<Record<string, string>> {
        const nameMap: Record<string, string> = {}
        try {
            const provider = this.config.store?.syncAndBackup?.syncProvider || 'webdav'
            if (provider === 'local') {
                const syncPath = this.config.store?.syncAndBackup?.localSyncPath
                if (syncPath) {
                    const clusterFile = path.join(syncPath, 'sync', 'cluster.json')
                    if (fs.existsSync(clusterFile)) {
                        const parsed = JSON.parse(fs.readFileSync(clusterFile, 'utf8'))
                        if (parsed && parsed.members) {
                            for (const [id, member] of Object.entries<any>(parsed.members)) {
                                if (member?.deviceName) {
                                    nameMap[id] = member.deviceName
                                }
                            }
                        }
                    }
                }
            } else if (provider === 'webdav') {
                let baseUrl = (this.config.store?.syncAndBackup?.webdavUrl || '').trim()
                if (baseUrl) {
                    if (!baseUrl.endsWith('/')) baseUrl += '/'
                    const targetUrl = `${baseUrl}sync/cluster.json`
                    const res = await fetch(targetUrl, {
                        method: 'GET',
                        headers: this.getWebDAVAuthHeader(),
                    })
                    if (res.ok) {
                        const parsed = JSON.parse(await res.text())
                        if (parsed && parsed.members) {
                            for (const [id, member] of Object.entries<any>(parsed.members)) {
                                if (member?.deviceName) {
                                    nameMap[id] = member.deviceName
                                }
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[tabby-sync-and-backup] Could not fetch cluster device names for backups:', e)
        }
        return nameMap
    }

    private getRemoteLocalBackupsDir(deviceId?: string): string {
        const syncPath = this.config.store?.syncAndBackup?.localSyncPath
        if (!syncPath) throw new Error('Local sync path is not specified in settings')
        const devId = deviceId || this.deviceIdentity.getDeviceId()
        const remoteBackupsDir = path.join(syncPath, 'backups', devId)
        if (!fs.existsSync(remoteBackupsDir)) {
            fs.mkdirSync(remoteBackupsDir, { recursive: true })
        }
        return remoteBackupsDir
    }

    private async listRemoteLocalBackups(targetDeviceId?: string): Promise<BackupSnapshotItem[]> {
        const syncPath = this.config.store?.syncAndBackup?.localSyncPath
        if (!syncPath || !fs.existsSync(syncPath)) return []

        const backupsBaseDir = path.join(syncPath, 'backups')
        if (!fs.existsSync(backupsBaseDir)) return []

        const currentDeviceId = this.deviceIdentity.getDeviceId()
        const currentDeviceName = this.deviceIdentity.getDeviceName()
        const nameMap = await this.getClusterDeviceNameMap()
        const currentPassword = this.config.store?.syncAndBackup?.encryptionPassword || ''
        const snapshots: BackupSnapshotItem[] = []

        const scanDirectoryForBackups = (dir: string, devId: string, devName: string) => {
            if (!fs.existsSync(dir)) return
            try {
                const files = fs.readdirSync(dir)
                for (const file of files) {
                    if (file.startsWith('tabby-backup-') && file.endsWith('.yaml')) {
                        const fullPath = path.join(dir, file)
                        try {
                            const stats = fs.statSync(fullPath)
                            const parsed = parseBackupFilename(file)
                            const ts = parsed.timestamp || stats.mtimeMs

                            let encStatus: EncryptionStatus = 'unencrypted'
                            try {
                                const fd = fs.openSync(fullPath, 'r')
                                const buf = Buffer.alloc(1024)
                                const bytesRead = fs.readSync(fd, buf, 0, 1024, 0)
                                fs.closeSync(fd)
                                const sample = buf.toString('utf8', 0, bytesRead)
                                encStatus = CryptoService.checkPassword(sample, currentPassword)
                            } catch (e) {
                                console.warn(`[tabby-sync-and-backup] Header check failed for remote ${file}:`, e)
                            }

                            snapshots.push({
                                id: `${devId}_${file}`,
                                filename: file,
                                timestamp: ts,
                                formattedDate: formatTimestamp(new Date(ts)),
                                sizeKb: Math.round((stats.size / 1024) * 10) / 10,
                                trigger: parsed.trigger,
                                location: 'remote',
                                encryptionStatus: encStatus,
                                fullPath,
                                deviceId: devId,
                                deviceName: devName,
                            })
                        } catch (e) {
                            console.error(`[tabby-sync-and-backup] Could not stat remote file ${file}:`, e)
                        }
                    }
                }
            } catch (err) {
                console.warn(`[tabby-sync-and-backup] Could not scan directory ${dir}:`, err)
            }
        }

        const devToScan = targetDeviceId || currentDeviceId

        if (devToScan === 'all') {
            const entries = fs.readdirSync(backupsBaseDir, { withFileTypes: true })
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const devId = entry.name
                    const devName = devId === currentDeviceId ? currentDeviceName : (nameMap[devId] || `Device (${devId.substring(0, 8)})`)
                    scanDirectoryForBackups(path.join(backupsBaseDir, devId), devId, devName)
                }
            }
            // Also include legacy flat backups
            scanDirectoryForBackups(backupsBaseDir, 'legacy', 'Legacy Backups')
        } else {
            const deviceDir = path.join(backupsBaseDir, devToScan)
            const devName = devToScan === currentDeviceId ? currentDeviceName : (nameMap[devToScan] || `Device (${devToScan.substring(0, 8)})`)
            scanDirectoryForBackups(deviceDir, devToScan, devName)

            // If current device has no backups in subfolder, check legacy flat backups
            if (devToScan === currentDeviceId && snapshots.length === 0) {
                scanDirectoryForBackups(backupsBaseDir, currentDeviceId, currentDeviceName)
            }
        }

        snapshots.sort((a, b) => b.timestamp - a.timestamp)
        return snapshots
    }

    private async saveRemoteLocalFile(
        filename: string,
        content: string,
        now: Date,
        trigger: BackupTrigger,
    ): Promise<BackupSnapshotItem> {
        const deviceId = this.deviceIdentity.getDeviceId()
        const deviceName = this.deviceIdentity.getDeviceName()
        const remoteDir = this.getRemoteLocalBackupsDir(deviceId)
        const fullPath = path.join(remoteDir, filename)
        fs.writeFileSync(fullPath, content, 'utf8')
        const stats = fs.statSync(fullPath)
        const currentPassword = this.config.store?.syncAndBackup?.encryptionPassword || ''
        const encStatus = CryptoService.checkPassword(content, currentPassword)

        return {
            id: `${deviceId}_${filename}`,
            filename,
            timestamp: now.getTime(),
            formattedDate: formatTimestamp(now),
            sizeKb: Math.round((stats.size / 1024) * 10) / 10,
            trigger,
            location: 'remote',
            encryptionStatus: encStatus,
            fullPath,
            deviceId,
            deviceName,
        }
    }

    // --- Private WebDAV Helpers ---

    private getWebDAVAuthHeader(): Record<string, string> {
        const username = this.config.store?.syncAndBackup?.webdavUsername || ''
        const password = this.config.store?.syncAndBackup?.webdavPassword || ''
        const credentials = btoa(`${username}:${password}`)
        return {
            Authorization: `Basic ${credentials}`,
        }
    }

    private getWebDAVBackupsUrl(): string {
        let base = (this.config.store?.syncAndBackup?.webdavUrl || '').trim()
        if (!base) throw new Error('WebDAV Server URL is not configured in Sync settings')
        if (!base.endsWith('/')) base += '/'
        return `${base}backups/`
    }

    private async ensureWebDAVBackupsCollection(): Promise<void> {
        const url = this.getWebDAVBackupsUrl()
        try {
            await fetch(url, {
                method: 'MKCOL',
                headers: this.getWebDAVAuthHeader(),
            })
        } catch {
            // MKCOL returns 405 if collection already exists
        }
    }

    private async ensureWebDAVDeviceCollection(deviceId?: string): Promise<void> {
        await this.ensureWebDAVBackupsCollection()
        const devId = deviceId || this.deviceIdentity.getDeviceId()
        const url = `${this.getWebDAVBackupsUrl()}${devId}/`
        try {
            await fetch(url, {
                method: 'MKCOL',
                headers: this.getWebDAVAuthHeader(),
            })
        } catch {
            // MKCOL returns 405 if collection already exists
        }
    }

    private async listRemoteWebDAVBackups(targetDeviceId?: string): Promise<BackupSnapshotItem[]> {
        const baseUrl = this.getWebDAVBackupsUrl()
        await this.ensureWebDAVBackupsCollection()

        const currentDeviceId = this.deviceIdentity.getDeviceId()
        const currentDeviceName = this.deviceIdentity.getDeviceName()
        const nameMap = await this.getClusterDeviceNameMap()
        const devToScan = targetDeviceId || currentDeviceId
        const snapshots: BackupSnapshotItem[] = []

        const fetchWebDAVDirSnapshots = async (dirUrl: string, devId: string, devName: string): Promise<BackupSnapshotItem[]> => {
            try {
                const response = await fetch(dirUrl, {
                    method: 'PROPFIND',
                    headers: {
                        ...this.getWebDAVAuthHeader(),
                        Depth: '1',
                        'Content-Type': 'application/xml',
                    },
                })
                if (!response.ok) return []
                const xmlText = await response.text()
                const parser = new DOMParser()
                const doc = parser.parseFromString(xmlText, 'text/xml')
                const responseNodes = doc.querySelectorAll('response')
                const items: BackupSnapshotItem[] = []

                responseNodes.forEach(node => {
                    const href = node.querySelector('href')?.textContent || ''
                    const rawFilename = decodeURIComponent(href.split('/').filter(Boolean).pop() || '')

                    if (rawFilename.startsWith('tabby-backup-') && rawFilename.endsWith('.yaml')) {
                        const contentLengthNode = node.querySelector('getcontentlength')
                        const lastModifiedNode = node.querySelector('getlastmodified')
                        const sizeBytes = parseInt(contentLengthNode?.textContent || '0', 10)
                        const parsed = parseBackupFilename(rawFilename)
                        const lastModified = lastModifiedNode?.textContent ? new Date(lastModifiedNode.textContent).getTime() : parsed.timestamp
                        const ts = parsed.timestamp || lastModified

                        let fileUrl = href
                        if (!fileUrl.startsWith('http')) {
                            try {
                                const origin = new URL(this.config.store?.syncAndBackup?.webdavUrl || '').origin
                                fileUrl = `${origin}${href.startsWith('/') ? '' : '/'}${href}`
                            } catch {
                                fileUrl = `${dirUrl}${rawFilename}`
                            }
                        }

                        items.push({
                            id: `${devId}_${rawFilename}`,
                            filename: rawFilename,
                            timestamp: ts,
                            formattedDate: formatTimestamp(new Date(ts)),
                            sizeKb: Math.round((sizeBytes / 1024) * 10) / 10,
                            trigger: parsed.trigger,
                            location: 'remote',
                            encryptionStatus: 'encrypted_unknown',
                            remoteUrl: fileUrl,
                            deviceId: devId,
                            deviceName: devName,
                        })
                    }
                })
                return items
            } catch (e) {
                console.warn(`[tabby-sync-and-backup] WebDAV fetch failed for ${dirUrl}:`, e)
                return []
            }
        }

        if (devToScan === 'all') {
            const devices = await this.listRemoteWebDAVBackupDevices(nameMap)
            for (const d of devices) {
                const devDirUrl = `${baseUrl}${d.deviceId}/`
                const items = await fetchWebDAVDirSnapshots(devDirUrl, d.deviceId, d.deviceName)
                snapshots.push(...items)
            }
            const legacyItems = await fetchWebDAVDirSnapshots(baseUrl, 'legacy', 'Legacy Backups')
            snapshots.push(...legacyItems)
        } else {
            const devDirUrl = `${baseUrl}${devToScan}/`
            const devName = devToScan === currentDeviceId ? currentDeviceName : (nameMap[devToScan] || `Device (${devToScan.substring(0, 8)})`)
            const items = await fetchWebDAVDirSnapshots(devDirUrl, devToScan, devName)
            snapshots.push(...items)

            if (devToScan === currentDeviceId && snapshots.length === 0) {
                const legacyItems = await fetchWebDAVDirSnapshots(baseUrl, currentDeviceId, currentDeviceName)
                snapshots.push(...legacyItems)
            }
        }

        snapshots.sort((a, b) => b.timestamp - a.timestamp)
        return snapshots
    }

    private async listRemoteWebDAVBackupDevices(nameMap: Record<string, string>): Promise<RemoteBackupDeviceItem[]> {
        const baseUrl = this.getWebDAVBackupsUrl()
        await this.ensureWebDAVBackupsCollection()

        const currentDeviceId = this.deviceIdentity.getDeviceId()
        const currentDeviceName = this.deviceIdentity.getDeviceName()
        const devices: RemoteBackupDeviceItem[] = []

        try {
            const response = await fetch(baseUrl, {
                method: 'PROPFIND',
                headers: {
                    ...this.getWebDAVAuthHeader(),
                    Depth: '1',
                    'Content-Type': 'application/xml',
                },
            })
            if (!response.ok) return []
            const xmlText = await response.text()
            const parser = new DOMParser()
            const doc = parser.parseFromString(xmlText, 'text/xml')
            const responseNodes = doc.querySelectorAll('response')

            let legacyCount = 0
            const foundDevIds = new Set<string>()

            responseNodes.forEach(node => {
                const href = node.querySelector('href')?.textContent || ''
                const cleanHref = href.endsWith('/') ? href.slice(0, -1) : href
                const segment = decodeURIComponent(cleanHref.split('/').filter(Boolean).pop() || '')

                const isCollection = !!(node.querySelector('collection') || node.querySelector('resourcetype > collection'))

                if (isCollection && segment && segment !== 'backups') {
                    foundDevIds.add(segment)
                } else if (segment.startsWith('tabby-backup-') && segment.endsWith('.yaml')) {
                    legacyCount++
                }
            })

            foundDevIds.add(currentDeviceId)

            for (const devId of Array.from(foundDevIds)) {
                let count = 0
                try {
                    const devDirUrl = `${baseUrl}${devId}/`
                    const res = await fetch(devDirUrl, {
                        method: 'PROPFIND',
                        headers: {
                            ...this.getWebDAVAuthHeader(),
                            Depth: '1',
                            'Content-Type': 'application/xml',
                        },
                    })
                    if (res.ok) {
                        const xml = await res.text()
                        const devDoc = parser.parseFromString(xml, 'text/xml')
                        devDoc.querySelectorAll('response').forEach(n => {
                            const h = n.querySelector('href')?.textContent || ''
                            const fn = decodeURIComponent(h.split('/').filter(Boolean).pop() || '')
                            if (fn.startsWith('tabby-backup-') && fn.endsWith('.yaml')) {
                                count++
                            }
                        })
                    }
                } catch {
                    // Ignore error for missing collection
                }

                if (devId === currentDeviceId && count === 0 && legacyCount > 0) {
                    count = legacyCount
                }

                const devName = devId === currentDeviceId ? currentDeviceName : (nameMap[devId] || `Device (${devId.substring(0, 8)})`)
                devices.push({
                    deviceId: devId,
                    deviceName: devName,
                    count,
                    isCurrent: devId === currentDeviceId,
                })
            }

            devices.sort((a, b) => {
                if (a.isCurrent) return -1
                if (b.isCurrent) return 1
                return (a.deviceName || '').localeCompare(b.deviceName || '')
            })
        } catch (e) {
            console.warn('[tabby-sync-and-backup] Could not list WebDAV backup devices:', e)
        }

        return devices
    }

    private async uploadWebDAVFile(
        filename: string,
        content: string,
        now: Date,
        trigger: BackupTrigger,
    ): Promise<BackupSnapshotItem> {
        const deviceId = this.deviceIdentity.getDeviceId()
        const deviceName = this.deviceIdentity.getDeviceName()
        await this.ensureWebDAVDeviceCollection(deviceId)
        const fileUrl = `${this.getWebDAVBackupsUrl()}${deviceId}/${filename}`

        const response = await fetch(fileUrl, {
            method: 'PUT',
            headers: {
                ...this.getWebDAVAuthHeader(),
                'Content-Type': 'application/x-yaml',
            },
            body: content,
        })

        if (!response.ok && response.status !== 201 && response.status !== 204) {
            throw new Error(`WebDAV PUT failed: HTTP ${response.status}`)
        }

        const currentPassword = this.config.store?.syncAndBackup?.encryptionPassword || ''
        const encStatus = CryptoService.checkPassword(content, currentPassword)

        return {
            id: `${deviceId}_${filename}`,
            filename,
            timestamp: now.getTime(),
            formattedDate: formatTimestamp(now),
            sizeKb: Math.round((new Blob([content]).size / 1024) * 10) / 10,
            trigger,
            location: 'remote',
            encryptionStatus: encStatus,
            remoteUrl: fileUrl,
            deviceId,
            deviceName,
        }
    }

    private async downloadWebDAVFile(filename: string, deviceId?: string): Promise<string> {
        const devId = deviceId || this.deviceIdentity.getDeviceId()
        const baseUrl = this.getWebDAVBackupsUrl()
        let fileUrl = `${baseUrl}${devId}/${filename}`
        let response = await fetch(fileUrl, {
            method: 'GET',
            headers: this.getWebDAVAuthHeader(),
        })
        if (response.status === 404) {
            fileUrl = `${baseUrl}${filename}`
            response = await fetch(fileUrl, {
                method: 'GET',
                headers: this.getWebDAVAuthHeader(),
            })
        }
        if (!response.ok) {
            throw new Error(`WebDAV GET failed: HTTP ${response.status}`)
        }
        return response.text()
    }

    private async downloadWebDAVFileByUrl(url: string): Promise<string> {
        const response = await fetch(url, {
            method: 'GET',
            headers: this.getWebDAVAuthHeader(),
        })
        if (!response.ok) {
            throw new Error(`WebDAV GET failed: HTTP ${response.status}`)
        }
        return response.text()
    }

    private async deleteWebDAVFile(filename: string, deviceId?: string): Promise<void> {
        const devId = deviceId || this.deviceIdentity.getDeviceId()
        const baseUrl = this.getWebDAVBackupsUrl()
        let fileUrl = `${baseUrl}${devId}/${filename}`
        let response = await fetch(fileUrl, {
            method: 'DELETE',
            headers: this.getWebDAVAuthHeader(),
        })
        if (response.status === 404) {
            fileUrl = `${baseUrl}${filename}`
            response = await fetch(fileUrl, {
                method: 'DELETE',
                headers: this.getWebDAVAuthHeader(),
            })
        }
        if (!response.ok && response.status !== 204 && response.status !== 404) {
            throw new Error(`WebDAV DELETE failed: HTTP ${response.status}`)
        }
    }

    private async deleteWebDAVFileByUrl(url: string): Promise<void> {
        const response = await fetch(url, {
            method: 'DELETE',
            headers: this.getWebDAVAuthHeader(),
        })
        if (!response.ok && response.status !== 204 && response.status !== 404) {
            throw new Error(`WebDAV DELETE failed: HTTP ${response.status}`)
        }
    }
}
