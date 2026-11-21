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
    contentHash: string
    encryptedPayload?: string
    updatedAt: string
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
