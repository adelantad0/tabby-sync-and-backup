import { Injectable } from '@angular/core'
import { ConfigService, NotificationsService } from 'tabby-core'
import * as fs from 'fs'
import * as path from 'path'

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
