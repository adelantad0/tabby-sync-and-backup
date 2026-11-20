import { Injectable } from '@angular/core'
import { ConfigService, NotificationsService } from 'tabby-core'
import * as fs from 'fs'
import * as path from 'path'

export interface BackupSnapshotItem {
    id: string
    filename: string
    timestamp: number
    formattedDate: string
    sizeKb: number
    trigger: 'Manual' | 'Pre-Sync' | 'Startup'
    location: 'local' | 'remote'
    fullPath?: string
    remoteUrl?: string
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
function parseBackupFilename(filename: string): { timestamp: number; trigger: 'Manual' | 'Pre-Sync' | 'Startup' } {
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
        let trigger: 'Manual' | 'Pre-Sync' | 'Startup' = 'Manual'
        if (slug === 'presync') trigger = 'Pre-Sync'
        if (slug === 'startup') trigger = 'Startup'
        return { timestamp: date.getTime(), trigger }
    }
    return { timestamp: Date.now(), trigger: 'Manual' }
}

@Injectable({ providedIn: 'root' })
export class BackupService {
    constructor(
        private config: ConfigService,
        private notifications: NotificationsService,
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

        for (const file of files) {
            if (file.startsWith('tabby-backup-') && file.endsWith('.yaml')) {
                const fullPath = path.join(dir, file)
                try {
                    const stats = fs.statSync(fullPath)
                    const parsed = parseBackupFilename(file)
                    const ts = parsed.timestamp || stats.mtimeMs
                    snapshots.push({
                        id: file,
                        filename: file,
                        timestamp: ts,
                        formattedDate: formatTimestamp(new Date(ts)),
                        sizeKb: Math.round((stats.size / 1024) * 10) / 10,
                        trigger: parsed.trigger,
                        location: 'local',
                        fullPath,
                    })
                } catch (e) {
                    console.error(`[tabby-sync-and-backup] Could not stat backup file ${file}:`, e)
                }
            }
        }

        // Sort newest first
        snapshots.sort((a, b) => b.timestamp - a.timestamp)
        return snapshots
    }

    async createLocalBackup(trigger: 'Manual' | 'Pre-Sync' | 'Startup' = 'Manual'): Promise<BackupSnapshotItem> {
        const dir = this.ensureLocalBackupsDir()
        const now = new Date()
        const filename = generateBackupFilename(now, trigger)
        const fullPath = path.join(dir, filename)

        // Read active raw configuration
        const rawContent = this.config.readRaw()
        fs.writeFileSync(fullPath, rawContent, 'utf8')

        const stats = fs.statSync(fullPath)
        const snapshot: BackupSnapshotItem = {
            id: filename,
            filename,
            timestamp: now.getTime(),
            formattedDate: formatTimestamp(now),
            sizeKb: Math.round((stats.size / 1024) * 10) / 10,
            trigger,
            location: 'local',
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

    async restoreLocalBackup(filename: string): Promise<void> {
        const dir = this.ensureLocalBackupsDir()
        const fullPath = path.join(dir, filename)

        if (!fs.existsSync(fullPath)) {
            throw new Error(`Snapshot file not found: ${filename}`)
        }

        // Create safety pre-restore backup first
        try {
            await this.createLocalBackup('Pre-Sync')
        } catch (e) {
            console.warn('[tabby-sync-and-backup] Safety backup failed before restore:', e)
        }

        const rawContent = fs.readFileSync(fullPath, 'utf8')
        await this.config.writeRaw(rawContent)
        await this.config.load()
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

    async listRemoteBackups(): Promise<BackupSnapshotItem[]> {
        const provider = this.config.store?.syncAndBackup?.syncProvider || 'webdav'

        if (provider === 'local') {
            return this.listRemoteLocalBackups()
        }
        if (provider === 'webdav') {
            return this.listRemoteWebDAVBackups()
        }

        return []
    }

    async createRemoteBackup(trigger: 'Manual' | 'Pre-Sync' | 'Startup' = 'Manual'): Promise<BackupSnapshotItem> {
        const rawContent = this.config.readRaw()
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

        // Apply remote retention rotation
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

    async restoreRemoteBackup(item: BackupSnapshotItem): Promise<void> {
        const provider = this.config.store?.syncAndBackup?.syncProvider || 'webdav'
        let content = ''

        if (provider === 'local') {
            const syncPath = this.config.store?.syncAndBackup?.localSyncPath
            if (!syncPath) throw new Error('Local sync directory path is not configured')
            const remoteFile = path.join(syncPath, 'backups', item.filename)
            if (!fs.existsSync(remoteFile)) throw new Error(`Remote file does not exist: ${remoteFile}`)
            content = fs.readFileSync(remoteFile, 'utf8')
        } else if (provider === 'webdav') {
            content = await this.downloadWebDAVFile(item.filename)
        }

        // Create safety pre-restore backup first
        try {
            await this.createLocalBackup('Pre-Sync')
        } catch (e) {
            console.warn('[tabby-sync-and-backup] Safety backup failed before remote restore:', e)
        }

        await this.config.writeRaw(content)
        await this.config.load()
    }

    async deleteRemoteBackup(filename: string): Promise<void> {
        const provider = this.config.store?.syncAndBackup?.syncProvider || 'webdav'

        if (provider === 'local') {
            const syncPath = this.config.store?.syncAndBackup?.localSyncPath
            if (syncPath) {
                const remoteFile = path.join(syncPath, 'backups', filename)
                if (fs.existsSync(remoteFile)) {
                    fs.unlinkSync(remoteFile)
                }
            }
        } else if (provider === 'webdav') {
            await this.deleteWebDAVFile(filename)
        }
    }

    async rotateRemoteBackups(maxToKeep: number): Promise<void> {
        try {
            const remoteSnapshots = await this.listRemoteBackups()
            if (remoteSnapshots.length > maxToKeep) {
                const excess = remoteSnapshots.slice(maxToKeep)
                for (const item of excess) {
                    try {
                        await this.deleteRemoteBackup(item.filename)
                        console.log(`[tabby-sync-and-backup] Rotated remote backup: ${item.filename}`)
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

    private getRemoteLocalBackupsDir(): string {
        const syncPath = this.config.store?.syncAndBackup?.localSyncPath
        if (!syncPath) throw new Error('Local sync path is not specified in settings')
        const remoteBackupsDir = path.join(syncPath, 'backups')
        if (!fs.existsSync(remoteBackupsDir)) {
            fs.mkdirSync(remoteBackupsDir, { recursive: true })
        }
        return remoteBackupsDir
    }

    private async listRemoteLocalBackups(): Promise<BackupSnapshotItem[]> {
        const syncPath = this.config.store?.syncAndBackup?.localSyncPath
        if (!syncPath || !fs.existsSync(syncPath)) return []

        const remoteDir = path.join(syncPath, 'backups')
        if (!fs.existsSync(remoteDir)) return []

        const files = fs.readdirSync(remoteDir)
        const snapshots: BackupSnapshotItem[] = []

        for (const file of files) {
            if (file.startsWith('tabby-backup-') && file.endsWith('.yaml')) {
                const fullPath = path.join(remoteDir, file)
                try {
                    const stats = fs.statSync(fullPath)
                    const parsed = parseBackupFilename(file)
                    const ts = parsed.timestamp || stats.mtimeMs
                    snapshots.push({
                        id: file,
                        filename: file,
                        timestamp: ts,
                        formattedDate: formatTimestamp(new Date(ts)),
                        sizeKb: Math.round((stats.size / 1024) * 10) / 10,
                        trigger: parsed.trigger,
                        location: 'remote',
                        fullPath,
                    })
                } catch (e) {
                    console.error(`[tabby-sync-and-backup] Could not stat remote file ${file}:`, e)
                }
            }
        }

        snapshots.sort((a, b) => b.timestamp - a.timestamp)
        return snapshots
    }

    private async saveRemoteLocalFile(
        filename: string,
        content: string,
        now: Date,
        trigger: 'Manual' | 'Pre-Sync' | 'Startup',
    ): Promise<BackupSnapshotItem> {
        const remoteDir = this.getRemoteLocalBackupsDir()
        const fullPath = path.join(remoteDir, filename)
        fs.writeFileSync(fullPath, content, 'utf8')
        const stats = fs.statSync(fullPath)

        return {
            id: filename,
            filename,
            timestamp: now.getTime(),
            formattedDate: formatTimestamp(now),
            sizeKb: Math.round((stats.size / 1024) * 10) / 10,
            trigger,
            location: 'remote',
            fullPath,
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
            // MKCOL returns 405 if collection already exists, which is fine
        }
    }

    private async listRemoteWebDAVBackups(): Promise<BackupSnapshotItem[]> {
        const baseUrl = this.getWebDAVBackupsUrl()
        await this.ensureWebDAVBackupsCollection()

        const response = await fetch(baseUrl, {
            method: 'PROPFIND',
            headers: {
                ...this.getWebDAVAuthHeader(),
                Depth: '1',
                'Content-Type': 'application/xml',
            },
        })

        if (!response.ok) {
            if (response.status === 404) return []
            throw new Error(`WebDAV PROPFIND failed: HTTP ${response.status}`)
        }

        const xmlText = await response.text()
        const parser = new DOMParser()
        const doc = parser.parseFromString(xmlText, 'text/xml')
        const responseNodes = doc.querySelectorAll('response')
        const snapshots: BackupSnapshotItem[] = []

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

                snapshots.push({
                    id: rawFilename,
                    filename: rawFilename,
                    timestamp: ts,
                    formattedDate: formatTimestamp(new Date(ts)),
                    sizeKb: Math.round((sizeBytes / 1024) * 10) / 10,
                    trigger: parsed.trigger,
                    location: 'remote',
                    remoteUrl: `${baseUrl}${rawFilename}`,
                })
            }
        })

        snapshots.sort((a, b) => b.timestamp - a.timestamp)
        return snapshots
    }

    private async uploadWebDAVFile(
        filename: string,
        content: string,
        now: Date,
        trigger: 'Manual' | 'Pre-Sync' | 'Startup',
    ): Promise<BackupSnapshotItem> {
        await this.ensureWebDAVBackupsCollection()
        const fileUrl = `${this.getWebDAVBackupsUrl()}${filename}`

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

        return {
            id: filename,
            filename,
            timestamp: now.getTime(),
            formattedDate: formatTimestamp(now),
            sizeKb: Math.round((new Blob([content]).size / 1024) * 10) / 10,
            trigger,
            location: 'remote',
            remoteUrl: fileUrl,
        }
    }

    private async downloadWebDAVFile(filename: string): Promise<string> {
        const fileUrl = `${this.getWebDAVBackupsUrl()}${filename}`
        const response = await fetch(fileUrl, {
            method: 'GET',
            headers: this.getWebDAVAuthHeader(),
        })

        if (!response.ok) {
            throw new Error(`WebDAV GET failed: HTTP ${response.status}`)
        }

        return response.text()
    }

    private async deleteWebDAVFile(filename: string): Promise<void> {
        const fileUrl = `${this.getWebDAVBackupsUrl()}${filename}`
        const response = await fetch(fileUrl, {
            method: 'DELETE',
            headers: this.getWebDAVAuthHeader(),
        })

        if (!response.ok && response.status !== 204 && response.status !== 404) {
            throw new Error(`WebDAV DELETE failed: HTTP ${response.status}`)
        }
    }
}
