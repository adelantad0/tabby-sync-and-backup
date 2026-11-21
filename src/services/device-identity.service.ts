import { Injectable } from '@angular/core'
import { ConfigService } from 'tabby-core'
import * as crypto from 'crypto'
import * as os from 'os'

/**
 * Service responsible for managing device identity (UUID, Name, Platform)
 * and providing deterministic SHA-256 content hashing for sync entities.
 */
@Injectable({ providedIn: 'root' })
export class DeviceIdentityService {
    constructor(private config: ConfigService) {}

    /**
     * Get or create a persistent unique Device ID (UUID v4)
     */
    getDeviceId(): string {
        let deviceId = this.config.store?.syncAndBackup?.deviceId
        if (!deviceId) {
            deviceId = this.generateUuid()
            this.ensureConfigRoot()
            this.config.store.syncAndBackup.deviceId = deviceId
            this.config.save().catch(err => {
                console.error('[tabby-sync-and-backup] Failed to save deviceId:', err)
            })
        }
        return deviceId
    }

    /**
     * Get the configured or auto-detected device name
     */
    getDeviceName(): string {
        const configuredName = this.config.store?.syncAndBackup?.deviceName?.trim()
        if (configuredName) {
            return configuredName
        }

        const defaultName = this.detectDefaultDeviceName()
        this.ensureConfigRoot()
        this.config.store.syncAndBackup.deviceName = defaultName
        this.config.save().catch(err => {
            console.error('[tabby-sync-and-backup] Failed to save deviceName:', err)
        })
        return defaultName
    }

    /**
     * Update the device name and persist to config
     */
    async setDeviceName(name: string): Promise<void> {
        const cleanName = (name || '').trim() || this.detectDefaultDeviceName()
        this.ensureConfigRoot()
        this.config.store.syncAndBackup.deviceName = cleanName
        await this.config.save()
    }

    /**
     * Detect current operating system platform
     */
    getPlatform(): string {
        return process.platform || os.platform() || 'unknown'
    }

    /**
     * Generate a friendly default name for this device
     */
    detectDefaultDeviceName(): string {
        try {
            const host = os.hostname() || 'Tabby'
            let platformLabel = 'PC'
            if (process.platform === 'darwin') platformLabel = 'Mac'
            else if (process.platform === 'win32') platformLabel = 'Windows'
            else if (process.platform === 'linux') platformLabel = 'Linux'

            return `${host} (${platformLabel})`
        } catch {
            return `Device-${this.getDeviceId().substring(0, 6)}`
        }
    }

    /**
     * Deterministic SHA-256 content hashing of any JS object or primitive.
     * Recursively sorts object keys so that key order does not affect the hash.
     */
    hashContent(data: any): string {
        const canonicalJson = this.canonicalStringify(data)
        return crypto.createHash('sha256').update(canonicalJson, 'utf8').digest('hex')
    }

    /**
     * Generate RFC4122 v4 UUID
     */
    private generateUuid(): string {
        if (typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID()
        }
        // Fallback UUID v4 generator using crypto.randomBytes
        const bytes = crypto.randomBytes(16)
        bytes[6] = (bytes[6] & 0x0f) | 0x40 // Version 4
        bytes[8] = (bytes[8] & 0x3f) | 0x80 // Variant 10xx
        const hex = bytes.toString('hex')
        return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20, 32)}`
    }

    /**
     * Recursively sort object keys and serialize to JSON
     */
    private canonicalStringify(obj: any): string {
        if (obj === null || obj === undefined || typeof obj !== 'object') {
            return JSON.stringify(obj)
        }

        if (Array.isArray(obj)) {
            return '[' + obj.map(item => this.canonicalStringify(item)).join(',') + ']'
        }

        const sortedKeys = Object.keys(obj).sort()
        const keyValPairs = sortedKeys.map(key => {
            return JSON.stringify(key) + ':' + this.canonicalStringify(obj[key])
        })
        return '{' + keyValPairs.join(',') + '}'
    }

    private ensureConfigRoot(): void {
        if (!this.config.store) {
            this.config.store = {}
        }
        if (!this.config.store.syncAndBackup) {
            this.config.store.syncAndBackup = {}
        }
    }
}
