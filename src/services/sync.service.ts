import { Injectable } from '@angular/core'
import { ConfigService, NotificationsService } from 'tabby-core'
import * as fs from 'fs'
import * as path from 'path'
import {
    SyncDeviceState,
    SyncClusterMember,
    SyncClusterRegistry,
    SyncPasswordRequiredError,
    SyncPasswordMismatchError,
} from '../models/sync.model'
import { CryptoService } from './crypto.service'

export interface ConnectionTestResult {
    success: boolean
    message: string
    latencyMs?: number
    serverInfo?: string
    details?: string
}

export interface SyncTargetConfig {
    provider: 'webdav' | 'local'
    webdavUrl?: string
    webdavUsername?: string
    webdavPassword?: string
    webdavPath?: string
    localSyncPath?: string
}

@Injectable({ providedIn: 'root' })
export class SyncService {
    constructor(
        private config: ConfigService,
        private notifications: NotificationsService,
    ) {}

    /**
     * Get active storage target configuration from store
     */
    getActiveTargetConfig(): SyncTargetConfig {
        const cfg = this.config.store?.syncAndBackup || {}
        return {
            provider: cfg.syncProvider || 'webdav',
            webdavUrl: cfg.webdavUrl || '',
            webdavUsername: cfg.webdavUsername || '',
            webdavPassword: cfg.webdavPassword || '',
            webdavPath: cfg.webdavPath || '/tabby-config.yaml',
            localSyncPath: cfg.localSyncPath || '',
        }
    }

    /**
     * Ensure the sync directory structure exists in the storage target
     * Structure: <root>/sync/devices/
     */
    async ensureSyncStructure(target: SyncTargetConfig): Promise<void> {
        if (target.provider === 'local') {
            const root = (target.localSyncPath || '').trim()
            if (!root) throw new Error('Local sync path is not configured')
            const syncDir = path.join(root, 'sync')
            const devicesDir = path.join(syncDir, 'devices')
            if (!fs.existsSync(devicesDir)) {
                fs.mkdirSync(devicesDir, { recursive: true })
            }
            return
        }

        if (target.provider === 'webdav') {
            const baseUrl = this.normalizeUrl(target.webdavUrl || '')
            if (!baseUrl) throw new Error('WebDAV URL is not configured')
            const authHeader = this.getAuthHeader(target.webdavUsername, target.webdavPassword)

            // Create /sync/ collection
            await this.webdavMkcol(baseUrl + 'sync/', authHeader)
            // Create /sync/devices/ collection
            await this.webdavMkcol(baseUrl + 'sync/devices/', authHeader)
            return
        }

        throw new Error(`Unsupported provider: ${target.provider}`)
    }

    /**
     * Publish local device state to devices/<deviceId>.json
     */
    async publishDeviceState(target: SyncTargetConfig, state: SyncDeviceState): Promise<void> {
        await this.ensureSyncStructure(target)

        const cfg = this.config.store?.syncAndBackup || {}
        const encEnabled = !!cfg.encryptionEnabled
        const masterPassword = (cfg.encryptionPassword || '').trim()
        const keyEpoch = cfg.keyEpoch || 1
        const keyUpdatedAt = cfg.keyUpdatedAt || Date.now()

        // Deep copy state to avoid mutating caller object
        const stateToPublish: SyncDeviceState = JSON.parse(JSON.stringify(state))

        if (encEnabled && masterPassword) {
            const payloadToEncrypt = {
                profiles: stateToPublish.profiles || {},
                profileGroups: stateToPublish.profileGroups || {},
                vault: stateToPublish.vault,
                themes: stateToPublish.themes,
            }
            const encryptedPayload = CryptoService.encrypt(JSON.stringify(payloadToEncrypt), masterPassword)

            stateToPublish.isEncrypted = true
            stateToPublish.keyEpoch = keyEpoch
            stateToPublish.keyUpdatedAt = keyUpdatedAt
            stateToPublish.encryptedPayload = encryptedPayload
            stateToPublish.profiles = {}
            stateToPublish.profileGroups = {}
            delete stateToPublish.vault
            delete stateToPublish.themes
        } else {
            stateToPublish.isEncrypted = false
            stateToPublish.keyEpoch = 1
            delete stateToPublish.encryptedPayload
        }

        const payload = JSON.stringify(stateToPublish, null, 2)

        if (target.provider === 'local') {
            const root = (target.localSyncPath || '').trim()
            const devicesDir = path.join(root, 'sync', 'devices')
            const targetFile = path.join(devicesDir, `${state.deviceId}.json`)
            const tempFile = path.join(devicesDir, `.${state.deviceId}.${Date.now()}.tmp`)

            // Atomic file write
            fs.writeFileSync(tempFile, payload, 'utf8')
            fs.renameSync(tempFile, targetFile)
            return
        }

        if (target.provider === 'webdav') {
            const baseUrl = this.normalizeUrl(target.webdavUrl || '')
            const targetUrl = `${baseUrl}sync/devices/${encodeURIComponent(state.deviceId)}.json`
            const authHeader = this.getAuthHeader(target.webdavUsername, target.webdavPassword)

            const res = await fetch(targetUrl, {
                method: 'PUT',
                headers: {
                    ...authHeader,
                    'Content-Type': 'application/json',
                },
                body: payload,
            })

            if (!res.ok && res.status !== 201 && res.status !== 204 && res.status !== 200) {
                throw new Error(`Failed to upload device state to WebDAV (HTTP ${res.status}): ${res.statusText}`)
            }
            return
        }

        throw new Error(`Unsupported provider: ${target.provider}`)
    }

    /**
     * Decrypt remote device state payload if encrypted
     */
    private decryptDeviceState(rawState: SyncDeviceState): SyncDeviceState {
        if (!rawState.isEncrypted || !rawState.encryptedPayload) {
            return rawState
        }

        const cfg = this.config.store?.syncAndBackup || {}
        const localPassword = (cfg.encryptionPassword || '').trim()
        const localEpoch = cfg.keyEpoch || 1
        const remoteEpoch = rawState.keyEpoch || 1
        const deviceName = rawState.deviceName || rawState.deviceId

        if (!localPassword) {
            throw new SyncPasswordRequiredError(deviceName, remoteEpoch)
        }

        try {
            const decryptedJson = CryptoService.decrypt(rawState.encryptedPayload, localPassword)
            const decryptedData = JSON.parse(decryptedJson)
            rawState.profiles = decryptedData.profiles || {}
            rawState.profileGroups = decryptedData.profileGroups || {}
            rawState.vault = decryptedData.vault
            rawState.themes = decryptedData.themes
            return rawState
        } catch (e: any) {
            console.warn(`[tabby-sync-and-backup] Decryption failed for device ${deviceName}:`, e)
            throw new SyncPasswordMismatchError(deviceName, remoteEpoch, localEpoch)
        }
    }

    /**
     * Read all device states in sync/devices/*.json across the cluster
     */
    async fetchClusterDeviceStates(target: SyncTargetConfig): Promise<SyncDeviceState[]> {
        await this.ensureSyncStructure(target)
        const states: SyncDeviceState[] = []

        if (target.provider === 'local') {
            const root = (target.localSyncPath || '').trim()
            const devicesDir = path.join(root, 'sync', 'devices')
            if (!fs.existsSync(devicesDir)) return []

            const files = fs.readdirSync(devicesDir).filter(f => f.endsWith('.json') && !f.startsWith('.'))
            for (const file of files) {
                try {
                    const content = fs.readFileSync(path.join(devicesDir, file), 'utf8')
                    const parsed: SyncDeviceState = JSON.parse(content)
                    if (parsed && parsed.deviceId) {
                        const decrypted = this.decryptDeviceState(parsed)
                        states.push(decrypted)
                    }
                } catch (e) {
                    if (e instanceof SyncPasswordRequiredError || e instanceof SyncPasswordMismatchError) {
                        throw e
                    }
                    console.warn(`[tabby-sync-and-backup] Failed to parse device file ${file}:`, e)
                }
            }
            return states
        }

        if (target.provider === 'webdav') {
            const baseUrl = this.normalizeUrl(target.webdavUrl || '')
            const devicesUrl = `${baseUrl}sync/devices/`
            const authHeader = this.getAuthHeader(target.webdavUsername, target.webdavPassword)

            // PROPFIND Depth: 1 on devices/
            const listRes = await fetch(devicesUrl, {
                method: 'PROPFIND',
                headers: {
                    ...authHeader,
                    Depth: '1',
                    'Content-Type': 'application/xml',
                },
            })

            if (!listRes.ok && listRes.status !== 207) {
                console.warn(`[tabby-sync-and-backup] Could not list WebDAV devices folder (HTTP ${listRes.status})`)
                return []
            }

            const xmlText = await listRes.text()
            const fileHrefs = this.extractJsonFileHrefs(xmlText)

            for (const href of fileHrefs) {
                try {
                    // Normalize absolute vs relative href
                    let fileUrl = href
                    if (!fileUrl.startsWith('http://') && !fileUrl.startsWith('https://')) {
                        const urlObj = new URL(baseUrl)
                        fileUrl = `${urlObj.origin}${href.startsWith('/') ? '' : '/'}${href}`
                    }

                    const fileRes = await fetch(fileUrl, {
                        method: 'GET',
                        headers: authHeader,
                    })

                    if (fileRes.ok) {
                        const text = await fileRes.text()
                        const parsed: SyncDeviceState = JSON.parse(text)
                        if (parsed && parsed.deviceId) {
                            const decrypted = this.decryptDeviceState(parsed)
                            states.push(decrypted)
                        }
                    }
                } catch (e) {
                    if (e instanceof SyncPasswordRequiredError || e instanceof SyncPasswordMismatchError) {
                        throw e
                    }
                    console.warn(`[tabby-sync-and-backup] Failed to fetch device state from ${href}:`, e)
                }
            }
            return states
        }

        return []
    }

    /**
     * Update or register current device in cluster.json
     */
    async updateClusterRegistry(target: SyncTargetConfig, member: SyncClusterMember): Promise<SyncClusterRegistry> {
        await this.ensureSyncStructure(target)
        let registry: SyncClusterRegistry = {
            formatVersion: 1,
            updatedAt: new Date().toISOString(),
            members: {},
        }

        const existing = await this.fetchClusterRegistry(target)
        if (existing && existing.members) {
            registry = existing
        }

        const cfg = this.config.store?.syncAndBackup || {}
        member.isEncrypted = !!cfg.encryptionEnabled && !!cfg.encryptionPassword
        member.keyEpoch = cfg.keyEpoch || 1

        registry.members[member.deviceId] = member
        registry.updatedAt = new Date().toISOString()

        const payload = JSON.stringify(registry, null, 2)

        if (target.provider === 'local') {
            const root = (target.localSyncPath || '').trim()
            const registryFile = path.join(root, 'sync', 'cluster.json')
            const tempFile = path.join(root, 'sync', `.cluster.${Date.now()}.tmp`)
            fs.writeFileSync(tempFile, payload, 'utf8')
            fs.renameSync(tempFile, registryFile)
            return registry
        }

        if (target.provider === 'webdav') {
            const baseUrl = this.normalizeUrl(target.webdavUrl || '')
            const targetUrl = `${baseUrl}sync/cluster.json`
            const authHeader = this.getAuthHeader(target.webdavUsername, target.webdavPassword)

            await fetch(targetUrl, {
                method: 'PUT',
                headers: {
                    ...authHeader,
                    'Content-Type': 'application/json',
                },
                body: payload,
            })
            return registry
        }

        return registry
    }

    /**
     * Read cluster.json registry from storage
     */
    async fetchClusterRegistry(target: SyncTargetConfig): Promise<SyncClusterRegistry | null> {
        try {
            if (target.provider === 'local') {
                const root = (target.localSyncPath || '').trim()
                const registryFile = path.join(root, 'sync', 'cluster.json')
                if (!fs.existsSync(registryFile)) return null
                const content = fs.readFileSync(registryFile, 'utf8')
                return JSON.parse(content)
            }

            if (target.provider === 'webdav') {
                const baseUrl = this.normalizeUrl(target.webdavUrl || '')
                const targetUrl = `${baseUrl}sync/cluster.json`
                const authHeader = this.getAuthHeader(target.webdavUsername, target.webdavPassword)

                const res = await fetch(targetUrl, {
                    method: 'GET',
                    headers: authHeader,
                })
                if (res.ok) {
                    const text = await res.text()
                    return JSON.parse(text)
                }
            }
        } catch (e) {
            console.warn('[tabby-sync-and-backup] Could not read cluster registry:', e)
        }
        return null
    }

    /**
     * Helper: Extract .json file hrefs from WebDAV PROPFIND multistatus XML
     */
    private extractJsonFileHrefs(xml: string): string[] {
        const hrefRegex = /<(?:[a-zA-Z0-9]+:)?href>([^<]+)<\/(?:[a-zA-Z0-9]+:)?href>/gi
        const results: string[] = []
        let match: RegExpExecArray | null

        while ((match = hrefRegex.exec(xml)) !== null) {
            const rawHref = match[1].trim()
            if (rawHref.endsWith('.json') && !rawHref.endsWith('/')) {
                results.push(decodeURIComponent(rawHref))
            }
        }
        return Array.from(new Set(results))
    }

    /**
     * Helper: MKCOL for WebDAV collection creation
     */
    private async webdavMkcol(url: string, authHeader: Record<string, string>): Promise<void> {
        try {
            const res = await fetch(url, {
                method: 'MKCOL',
                headers: authHeader,
            })
            // 201 Created, 405 Method Not Allowed (already exists), 200/204/207 OK
            if (res.ok || res.status === 201 || res.status === 405 || res.status === 200) {
                return
            }
        } catch (e) {
            console.warn(`[tabby-sync-and-backup] MKCOL notice for ${url}:`, e)
        }
    }

    /**
     * Helper: Normalize URL with trailing slash
     */
    private normalizeUrl(url: string): string {
        let u = (url || '').trim()
        if (u && !u.endsWith('/')) {
            u += '/'
        }
        return u
    }

    /**
     * Helper: HTTP Basic Auth Header
     */
    private getAuthHeader(username?: string, password?: string): Record<string, string> {
        const user = username || ''
        const pass = password || ''
        const credentials = Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')
        return {
            Authorization: `Basic ${credentials}`,
        }
    }

    /**
     * Test connection to configured or custom storage target
     */
    async testConnection(target: SyncTargetConfig): Promise<ConnectionTestResult> {
        if (target.provider === 'local') {
            return this.testLocalDirectory(target.localSyncPath)
        }
        if (target.provider === 'webdav') {
            return this.testWebDAV(target.webdavUrl, target.webdavUsername, target.webdavPassword)
        }
        return { success: false, message: `Unknown storage provider: ${target.provider}` }
    }

    /**
     * Test local directory existence, permissions, and writability
     */
    private async testLocalDirectory(dirPath?: string): Promise<ConnectionTestResult> {
        const startTime = Date.now()
        const targetPath = (dirPath || '').trim()

        if (!targetPath) {
            return {
                success: false,
                message: 'Local directory path is required. Please specify or browse for a destination folder.',
            }
        }

        try {
            // Check if directory exists or can be created
            if (!fs.existsSync(targetPath)) {
                try {
                    fs.mkdirSync(targetPath, { recursive: true })
                } catch (mkdirErr: any) {
                    return {
                        success: false,
                        message: `Directory does not exist and could not be created: ${mkdirErr?.message || mkdirErr}`,
                    }
                }
            }

            // Verify it is actually a directory
            const stat = fs.statSync(targetPath)
            if (!stat.isDirectory()) {
                return {
                    success: false,
                    message: `Specified path exists but is a file, not a directory: ${targetPath}`,
                }
            }

            // Test write and read permissions with a temporary probe
            const probeFilename = path.join(targetPath, `.tabby-sync-probe-${Date.now()}.tmp`)
            const probeContent = `tabby-sync-probe-${Date.now()}`
            fs.writeFileSync(probeFilename, probeContent, 'utf8')

            const readBack = fs.readFileSync(probeFilename, 'utf8')
            fs.unlinkSync(probeFilename)

            if (readBack !== probeContent) {
                return {
                    success: false,
                    message: 'Integrity check failed: read content did not match written probe content.',
                }
            }

            const latencyMs = Date.now() - startTime
            return {
                success: true,
                message: 'Local directory is accessible, valid, and writable!',
                latencyMs,
                details: `Verified path: ${targetPath}`,
            }
        } catch (e: any) {
            return {
                success: false,
                message: `Failed to access local directory: ${e?.message || e}`,
            }
        }
    }

    /**
     * Test WebDAV server connectivity, authentication, and HTTP headers
     */
    private async testWebDAV(url?: string, username?: string, password?: string): Promise<ConnectionTestResult> {
        const rawUrl = (url || '').trim()

        if (!rawUrl) {
            return {
                success: false,
                message: 'WebDAV Server URL is required. Enter your full server URL.',
            }
        }

        if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
            return {
                success: false,
                message: 'Invalid WebDAV URL format: URL must begin with http:// or https://',
            }
        }

        let normalizedUrl = rawUrl
        if (!normalizedUrl.endsWith('/')) {
            normalizedUrl += '/'
        }

        const user = username || ''
        const pass = password || ''
        const credentials = Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')
        const authHeader = {
            Authorization: `Basic ${credentials}`,
        }

        const startTime = Date.now()
        const controller = new AbortController()
        const timeoutTimer = setTimeout(() => controller.abort(), 12000)

        try {
            // First attempt: PROPFIND Depth: 0 to inspect WebDAV collection
            let response = await fetch(normalizedUrl, {
                method: 'PROPFIND',
                headers: {
                    ...authHeader,
                    Depth: '0',
                    'Content-Type': 'application/xml',
                },
                signal: controller.signal,
            })

            // Fallback to OPTIONS if PROPFIND is not allowed (HTTP 405 Method Not Allowed)
            if (response.status === 405) {
                response = await fetch(normalizedUrl, {
                    method: 'OPTIONS',
                    headers: authHeader,
                    signal: controller.signal,
                })
            }

            clearTimeout(timeoutTimer)
            const latencyMs = Date.now() - startTime
            const serverHeader = response.headers.get('Server') || 'WebDAV Server'

            if (response.ok || response.status === 207 || response.status === 200 || response.status === 204) {
                return {
                    success: true,
                    message: `Connected to WebDAV server successfully! (${serverHeader})`,
                    latencyMs,
                    serverInfo: serverHeader,
                    details: `Status HTTP ${response.status} ${response.statusText || 'OK'}`,
                }
            }

            if (response.status === 401 || response.status === 403) {
                return {
                    success: false,
                    message: 'Authentication failed: Invalid username or password (HTTP 401/403).',
                    latencyMs,
                    details: 'Please double-check your credentials or use an App Password / Token.',
                }
            }

            if (response.status === 404) {
                return {
                    success: false,
                    message: `WebDAV collection path not found on server (HTTP 404): ${normalizedUrl}`,
                    latencyMs,
                    details: 'Verify that the WebDAV root URL and subfolder path exist on your server.',
                }
            }

            return {
                success: false,
                message: `Server returned HTTP ${response.status}: ${response.statusText}`,
                latencyMs,
            }
        } catch (err: any) {
            clearTimeout(timeoutTimer)
            const latencyMs = Date.now() - startTime

            if (err?.name === 'AbortError') {
                return {
                    success: false,
                    message: 'Connection timed out after 12 seconds. Server did not respond.',
                    latencyMs,
                }
            }

            return {
                success: false,
                message: `Connection failed: ${err?.message || err}`,
                latencyMs,
                details: 'Please check your internet connection, hostname, and firewall settings.',
            }
        }
    }
}
