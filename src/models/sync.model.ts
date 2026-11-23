/**
 * Tabby Sync & Backup - Data Models for Multi-Device Synchronization
 *
 * Implements Device-Per-File multi-master architecture with Lamport logical
 * revision tracking, SHA-256 content hashing, and tombstone deletion.
 */

/**
 * Sync entry for an individual profile (SSH, Telnet, Serial, etc.)
 */
export interface SyncProfileEntry {
    rev: number
    baseRev: number
    contentHash: string
    deleted: boolean
    deletedAt?: number | null
    data: any
}

/**
 * Sync entry for a profile folder/group
 */
export interface SyncProfileGroupEntry {
    rev: number
    baseRev: number
    contentHash: string
    deleted: boolean
    deletedAt?: number | null
    data: any
}

/**
 * Sync entry for encrypted Tabby Vault secrets
 */
export interface SyncVaultState {
    enabled: boolean
    rev: number
    baseRev?: number
    contentHash: string
    updatedAt: string
    data?: any
}

/**
 * Sync entry for custom color themes
 */
export interface SyncThemeEntry {
    rev: number
    baseRev: number
    contentHash: string
    deleted: boolean
    deletedAt?: number | null
    data: any
}

/**
 * Represents the complete state published by a single device:
 * Located at `devices/<deviceId>.json`
 */
export interface SyncDeviceState {
    formatVersion: number
    deviceId: string
    deviceName: string
    platform: string
    updatedAt: string
    isEncrypted?: boolean
    keyEpoch?: number
    keyUpdatedAt?: number
    encryptedPayload?: string
    profiles: Record<string, SyncProfileEntry>
    profileGroups?: Record<string, SyncProfileGroupEntry>
    vault?: SyncVaultState
    themes?: Record<string, SyncThemeEntry>
}

/**
 * Information about a cluster member stored in `cluster.json`
 */
export interface SyncClusterMember {
    deviceId: string
    deviceName: string
    platform: string
    lastSeenAt: string
    formatVersion: number
    isEncrypted?: boolean
    keyEpoch?: number
}

/**
 * Cluster registry file: `cluster.json`
 */
export interface SyncClusterRegistry {
    formatVersion: number
    updatedAt: string
    members: Record<string, SyncClusterMember>
}

/**
 * Merge outcome summary for reporting and UI feedback
 */
export interface SyncMergeResult {
    profilesAdded: number
    profilesUpdated: number
    profilesDeleted: number
    conflictsCreated: number
    groupsAdded: number
    groupsUpdated: number
    groupsDeleted: number
    vaultUpdated: boolean
    themesUpdated: number
}

/**
 * Thrown when remote device data is encrypted, but no master password is set locally
 */
export class SyncPasswordRequiredError extends Error {
    constructor(
        public peerDeviceName: string,
        public remoteEpoch: number = 1,
    ) {
        super(`Master password required: sync state from "${peerDeviceName}" is encrypted (Key Epoch #${remoteEpoch})`)
        this.name = 'SyncPasswordRequiredError'
    }
}

/**
 * Thrown when local master password cannot decrypt remote peer's state (key changed or incorrect)
 */
export class SyncPasswordMismatchError extends Error {
    constructor(
        public peerDeviceName: string,
        public remoteEpoch: number = 1,
        public localEpoch: number = 1,
    ) {
        super(`Master password mismatch: cannot decrypt sync state from "${peerDeviceName}" (Remote Epoch #${remoteEpoch}, Local Epoch #${localEpoch})`)
        this.name = 'SyncPasswordMismatchError'
    }
}
