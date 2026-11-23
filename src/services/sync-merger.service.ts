import { Injectable, Optional } from '@angular/core'
import { ConfigService, VaultService } from 'tabby-core'
import {
    SyncDeviceState,
    SyncProfileEntry,
    SyncProfileGroupEntry,
    SyncVaultState,
    SyncMergeResult,
} from '../models/sync.model'
import { DeviceIdentityService } from './device-identity.service'

const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

@Injectable({ providedIn: 'root' })
export class SyncMergerService {
    constructor(
        private config: ConfigService,
        private deviceIdentity: DeviceIdentityService,
        @Optional() private vault?: VaultService,
    ) {}

    /**
     * Build the local device's current SyncDeviceState from Tabby config.store
     */
    buildLocalDeviceState(previousState?: SyncDeviceState | null): SyncDeviceState {
        const deviceId = this.deviceIdentity.getDeviceId()
        const deviceName = this.deviceIdentity.getDeviceName()
        const platform = this.deviceIdentity.getPlatform()

        const currentProfiles: any[] = (this.config.store.profiles || []).filter((p: any) => !p.isBuiltin)
        const currentGroups: any[] = (this.config.store.groups || this.config.store.profileGroups || [])

        const profileEntries: Record<string, SyncProfileEntry> = {}
        const groupEntries: Record<string, SyncProfileGroupEntry> = {}

        const prevProfiles = previousState?.profiles || {}
        const prevGroups = previousState?.profileGroups || {}

        // 1. Process current local profiles
        for (const profile of currentProfiles) {
            if (!profile || !profile.id) continue
            const contentHash = this.deviceIdentity.hashContent(profile)
            const prev = prevProfiles[profile.id]

            if (!prev) {
                // New local profile
                profileEntries[profile.id] = {
                    rev: 1,
                    baseRev: 0,
                    contentHash,
                    deleted: false,
                    data: profile,
                }
            } else if (prev.deleted) {
                // Resurrected / re-created locally after previous deletion
                profileEntries[profile.id] = {
                    rev: (prev.rev || 0) + 1,
                    baseRev: prev.rev || 0,
                    contentHash,
                    deleted: false,
                    data: profile,
                }
            } else if (prev.contentHash === contentHash) {
                // Unchanged
                profileEntries[profile.id] = {
                    rev: prev.rev || 1,
                    baseRev: prev.baseRev || 0,
                    contentHash,
                    deleted: false,
                    data: profile,
                }
            } else {
                // Edited locally
                profileEntries[profile.id] = {
                    rev: (prev.rev || 1) + 1,
                    baseRev: prev.rev || 1,
                    contentHash,
                    deleted: false,
                    data: profile,
                }
            }
        }

        // 2. Process tombstones for locally deleted profiles
        for (const [id, prev] of Object.entries(prevProfiles)) {
            if (profileEntries[id]) continue // Still exists

            const isExpired = prev.deletedAt && (Date.now() - prev.deletedAt > TOMBSTONE_TTL_MS)
            if (isExpired) continue // Garbage collected

            if (prev.deleted) {
                // Keep existing tombstone
                profileEntries[id] = {
                    ...prev,
                }
            } else {
                // Newly deleted locally
                profileEntries[id] = {
                    rev: (prev.rev || 1) + 1,
                    baseRev: prev.rev || 1,
                    contentHash: '',
                    deleted: true,
                    deletedAt: Date.now(),
                    data: null,
                }
            }
        }

        // 3. Process current local profile groups
        for (const group of currentGroups) {
            if (!group) continue
            if (!group.id && group.name) {
                group.id = group.name
            }
            if (!group.id) continue
            const contentHash = this.deviceIdentity.hashContent(group)
            const prev = prevGroups[group.id]

            if (!prev) {
                groupEntries[group.id] = {
                    rev: 1,
                    baseRev: 0,
                    contentHash,
                    deleted: false,
                    data: group,
                }
            } else if (prev.deleted) {
                groupEntries[group.id] = {
                    rev: (prev.rev || 0) + 1,
                    baseRev: prev.rev || 0,
                    contentHash,
                    deleted: false,
                    data: group,
                }
            } else if (prev.contentHash === contentHash) {
                groupEntries[group.id] = {
                    rev: prev.rev || 1,
                    baseRev: prev.baseRev || 0,
                    contentHash,
                    deleted: false,
                    data: group,
                }
            } else {
                groupEntries[group.id] = {
                    rev: (prev.rev || 1) + 1,
                    baseRev: prev.rev || 1,
                    contentHash,
                    deleted: false,
                    data: group,
                }
            }
        }

        // 4. Process tombstones for locally deleted groups
        for (const [id, prev] of Object.entries(prevGroups)) {
            if (groupEntries[id]) continue
            const isExpired = prev.deletedAt && (Date.now() - prev.deletedAt > TOMBSTONE_TTL_MS)
            if (isExpired) continue

            if (prev.deleted) {
                groupEntries[id] = { ...prev }
            } else {
                groupEntries[id] = {
                    rev: (prev.rev || 1) + 1,
                    baseRev: prev.rev || 1,
                    contentHash: '',
                    deleted: true,
                    deletedAt: Date.now(),
                    data: null,
                }
            }
        }

        // 5. Process Tabby Vault state
        let vaultState: SyncVaultState | undefined = undefined
        const isVaultSyncEnabled = !!this.config.store?.syncAndBackup?.syncVault
        if (isVaultSyncEnabled) {
            const rawVault = this.config.store.vault
            const hasLocalVault = !!(
                rawVault &&
                typeof rawVault === 'object' &&
                rawVault.contents &&
                rawVault.iv &&
                rawVault.keySalt
            )

            const prevVault = previousState?.vault

            if (hasLocalVault) {
                const vaultHash = this.deviceIdentity.hashContent({
                    version: rawVault.version,
                    contents: rawVault.contents,
                    keySalt: rawVault.keySalt,
                    iv: rawVault.iv,
                })

                let vaultRev = 1
                let vaultBaseRev = 0
                let vaultUpdatedAt = new Date().toISOString()

                if (!prevVault) {
                    vaultRev = 1
                    vaultBaseRev = 0
                    vaultUpdatedAt = new Date().toISOString()
                } else if (prevVault.contentHash === vaultHash && prevVault.enabled) {
                    vaultRev = prevVault.rev || 1
                    vaultBaseRev = prevVault.baseRev || 0
                    vaultUpdatedAt = prevVault.updatedAt || new Date().toISOString()
                } else {
                    vaultRev = (prevVault.rev || 1) + 1
                    vaultBaseRev = prevVault.rev || 1
                    vaultUpdatedAt = new Date().toISOString()
                }

                vaultState = {
                    enabled: true,
                    rev: vaultRev,
                    baseRev: vaultBaseRev,
                    contentHash: vaultHash,
                    updatedAt: vaultUpdatedAt,
                    data: {
                        version: rawVault.version || 1,
                        contents: rawVault.contents,
                        keySalt: rawVault.keySalt,
                        iv: rawVault.iv,
                    },
                }
            } else if (prevVault && prevVault.enabled) {
                // Was previously enabled, now disabled or erased locally
                vaultState = {
                    enabled: false,
                    rev: (prevVault.rev || 1) + 1,
                    baseRev: prevVault.rev || 1,
                    contentHash: '',
                    updatedAt: new Date().toISOString(),
                    data: null,
                }
            }
        }

        return {
            formatVersion: 1,
            deviceId,
            deviceName,
            platform,
            updatedAt: new Date().toISOString(),
            profiles: profileEntries,
            profileGroups: groupEntries,
            vault: vaultState,
        }
    }

    /**
     * Merge remote cluster states into local state and update Tabby config.store.
     * Guarantees zero data loss via Lamport revisions and safe conflict forks.
     */
    async mergeClusterStates(
        localState: SyncDeviceState,
        remoteStates: SyncDeviceState[],
    ): Promise<{ mergedState: SyncDeviceState; result: SyncMergeResult }> {
        const result: SyncMergeResult = {
            profilesAdded: 0,
            profilesUpdated: 0,
            profilesDeleted: 0,
            conflictsCreated: 0,
            groupsAdded: 0,
            groupsUpdated: 0,
            groupsDeleted: 0,
            vaultUpdated: false,
            themesUpdated: 0,
        }

        // Working copy of merged state
        const mergedState: SyncDeviceState = JSON.parse(JSON.stringify(localState))
        const localProfiles: any[] = [...(this.config.store.profiles || [])]
        const localGroups: any[] = [...(this.config.store.groups || this.config.store.profileGroups || [])]

        // Filter out self device state
        const peerStates = remoteStates.filter(s => s && s.deviceId && s.deviceId !== localState.deviceId)

        // -------------------------------------------------------------
        // A. MERGE PROFILES
        // -------------------------------------------------------------
        for (const peerState of peerStates) {
            for (const [profileId, remoteEntry] of Object.entries(peerState.profiles || {})) {
                const localIndex = localProfiles.findIndex(p => p && p.id === profileId)
                const localEntry = mergedState.profiles[profileId]

                if (remoteEntry.deleted) {
                    // Remote says: DELETED
                    if (localIndex !== -1) {
                        const localRev = localEntry?.rev || 0
                        if (remoteEntry.rev >= localRev) {
                            // Remote deletion is authoritative or concurrent
                            localProfiles.splice(localIndex, 1)
                            mergedState.profiles[profileId] = {
                                rev: remoteEntry.rev,
                                baseRev: remoteEntry.baseRev,
                                contentHash: '',
                                deleted: true,
                                deletedAt: remoteEntry.deletedAt || Date.now(),
                                data: null,
                            }
                            result.profilesDeleted++
                        }
                        // If localRev > remoteEntry.rev: local edit after deletion, keep local
                    } else {
                        // Already not present locally, record tombstone if newer
                        if (!localEntry || remoteEntry.rev > localEntry.rev) {
                            mergedState.profiles[profileId] = {
                                rev: remoteEntry.rev,
                                baseRev: remoteEntry.baseRev,
                                contentHash: '',
                                deleted: true,
                                deletedAt: remoteEntry.deletedAt || Date.now(),
                                data: null,
                            }
                        }
                    }
                } else {
                    // Remote says: ACTIVE
                    if (localIndex === -1) {
                        // Profile does NOT exist locally
                        if (localEntry && localEntry.deleted && localEntry.rev >= remoteEntry.rev) {
                            // Local deletion is authoritative, ignore older remote active
                            continue
                        }

                        // Add new profile from remote
                        localProfiles.push(remoteEntry.data)
                        mergedState.profiles[profileId] = { ...remoteEntry }
                        result.profilesAdded++
                    } else {
                        // Profile DOES exist locally
                        const currentLocalProfile = localProfiles[localIndex]
                        const localHash = localEntry?.contentHash || this.deviceIdentity.hashContent(currentLocalProfile)

                        if (localHash === remoteEntry.contentHash) {
                            // Identical content, fast forward rev
                            if (localEntry) {
                                localEntry.rev = Math.max(localEntry.rev, remoteEntry.rev)
                            }
                        } else {
                            // Content differs! Compare Lamport revisions
                            const localRev = localEntry?.rev || 1
                            const localBase = localEntry?.baseRev || 0
                            const remoteRev = remoteEntry.rev
                            const remoteBase = remoteEntry.baseRev

                            if (remoteRev > localRev && remoteBase >= localRev) {
                                // Fast-forward: remote is strictly newer ancestor
                                localProfiles[localIndex] = remoteEntry.data
                                mergedState.profiles[profileId] = { ...remoteEntry }
                                result.profilesUpdated++
                            } else if (localRev > remoteRev && localBase >= remoteRev) {
                                // Fast-forward: local is strictly newer ancestor, keep local
                            } else {
                                // CONFLICT: parallel offline edits!
                                const conflictSuffix = `Conflict from ${peerState.deviceName || 'Remote'}`
                                const conflictId = `${profileId}-conflict-${peerState.deviceId.substring(0, 8)}`

                                const existingConflict = localProfiles.find(p => p && p.id === conflictId)
                                if (!existingConflict) {
                                    const conflictProfile = JSON.parse(JSON.stringify(remoteEntry.data))
                                    conflictProfile.id = conflictId
                                    conflictProfile.name = `${conflictProfile.name || 'Profile'} (${conflictSuffix})`

                                    localProfiles.push(conflictProfile)
                                    mergedState.profiles[conflictId] = {
                                        rev: 1,
                                        baseRev: 0,
                                        contentHash: this.deviceIdentity.hashContent(conflictProfile),
                                        deleted: false,
                                        data: conflictProfile,
                                    }
                                    result.conflictsCreated++
                                }
                            }
                        }
                    }
                }
            }
        }

        // -------------------------------------------------------------
        // B. MERGE PROFILE GROUPS
        // -------------------------------------------------------------
        for (const peerState of peerStates) {
            for (const [groupId, remoteEntry] of Object.entries(peerState.profileGroups || {})) {
                const localIndex = localGroups.findIndex(g => g && g.id === groupId)
                const localEntry = mergedState.profileGroups?.[groupId]

                if (!mergedState.profileGroups) {
                    mergedState.profileGroups = {}
                }

                if (remoteEntry.deleted) {
                    if (localIndex !== -1) {
                        const localRev = localEntry?.rev || 0
                        if (remoteEntry.rev >= localRev) {
                            localGroups.splice(localIndex, 1)
                            mergedState.profileGroups[groupId] = {
                                rev: remoteEntry.rev,
                                baseRev: remoteEntry.baseRev,
                                contentHash: '',
                                deleted: true,
                                deletedAt: remoteEntry.deletedAt || Date.now(),
                                data: null,
                            }
                            result.groupsDeleted++
                        }
                    }
                } else {
                    if (localIndex === -1) {
                        if (localEntry && localEntry.deleted && localEntry.rev >= remoteEntry.rev) {
                            continue
                        }
                        localGroups.push(remoteEntry.data)
                        mergedState.profileGroups[groupId] = { ...remoteEntry }
                        result.groupsAdded++
                    } else {
                        const localHash = localEntry?.contentHash || this.deviceIdentity.hashContent(localGroups[localIndex])
                        if (localHash === remoteEntry.contentHash) {
                            if (localEntry) {
                                localEntry.rev = Math.max(localEntry.rev, remoteEntry.rev)
                            }
                        } else if (remoteEntry.rev > (localEntry?.rev || 0)) {
                            localGroups[localIndex] = remoteEntry.data
                            mergedState.profileGroups[groupId] = { ...remoteEntry }
                            result.groupsUpdated++
                        }
                    }
                }
            }
        }

        // -------------------------------------------------------------
        // C. MERGE VAULT (with Anti-Clobbering / Zero-Wipe Protection)
        // -------------------------------------------------------------
        const isVaultSyncEnabled = !!this.config.store?.syncAndBackup?.syncVault
        if (isVaultSyncEnabled) {
            const currentLocalVault = this.config.store.vault
            const hasLocalVault = !!(
                currentLocalVault &&
                typeof currentLocalVault === 'object' &&
                currentLocalVault.contents &&
                currentLocalVault.iv &&
                currentLocalVault.keySalt
            )

            for (const peerState of peerStates) {
                const remoteVault = peerState.vault
                if (!remoteVault) continue

                // CIRCUIT BREAKER 1: If remote vault is disabled/empty/null, but local has a valid vault,
                // NEVER CLOBBER local vault! Skip to prevent wiping out data.
                if (!remoteVault.enabled || !remoteVault.data) {
                    if (hasLocalVault) {
                        console.warn(
                            `[tabby-sync-and-backup] Peer "${peerState.deviceName || peerState.deviceId}" has no active vault. Preserving local vault from clobbering.`
                        )
                    }
                    continue
                }

                // CIRCUIT BREAKER 2: Integrity & sanity check on remote vault structure
                const remoteData = remoteVault.data
                const isValidRemoteStructure = !!(
                    remoteData &&
                    typeof remoteData === 'object' &&
                    typeof remoteData.contents === 'string' &&
                    remoteData.contents.trim().length > 0 &&
                    typeof remoteData.iv === 'string' &&
                    remoteData.iv.trim().length > 0 &&
                    typeof remoteData.keySalt === 'string' &&
                    remoteData.keySalt.trim().length > 0
                )

                if (!isValidRemoteStructure) {
                    console.warn(
                        `[tabby-sync-and-backup] Peer "${peerState.deviceName || peerState.deviceId}" published malformed vault data. Rejecting remote vault.`
                    )
                    continue
                }

                const localVaultEntry = mergedState.vault
                const localHash = localVaultEntry?.contentHash || (hasLocalVault ? this.deviceIdentity.hashContent({
                    version: currentLocalVault.version,
                    contents: currentLocalVault.contents,
                    keySalt: currentLocalVault.keySalt,
                    iv: currentLocalVault.iv,
                }) : '')

                if (localHash === remoteVault.contentHash) {
                    // Identical contents, fast-forward rev
                    if (localVaultEntry) {
                        localVaultEntry.rev = Math.max(localVaultEntry.rev || 1, remoteVault.rev || 1)
                    }
                } else if (!hasLocalVault) {
                    // Local machine had no vault, adopt remote vault safely!
                    console.log(`[tabby-sync-and-backup] Adopting vault from peer "${peerState.deviceName || peerState.deviceId}" (rev ${remoteVault.rev})`)
                    this.config.store.vault = {
                        version: remoteData.version || 1,
                        contents: remoteData.contents,
                        keySalt: remoteData.keySalt,
                        iv: remoteData.iv,
                    }
                    try {
                        this.vault?.setStore(this.config.store.vault)
                    } catch (e) {
                        console.warn('[tabby-sync-and-backup] Could not update runtime vault store:', e)
                    }
                    mergedState.vault = { ...remoteVault }
                    result.vaultUpdated = true
                } else {
                    // Both have vault data, compare Lamport revisions
                    const localRev = localVaultEntry?.rev || 1
                    const remoteRev = remoteVault.rev || 1

                    const localBase = localVaultEntry?.baseRev || 0
                    const remoteBase = remoteVault.baseRev || 0

                    if (remoteRev > localRev && remoteBase >= localRev) {
                        // Fast-forward: remote is strictly newer ancestor
                        console.log(
                            `[tabby-sync-and-backup] Remote vault from "${peerState.deviceName || peerState.deviceId}" is newer ancestor (rev ${remoteRev} > ${localRev}). Updating local vault.`
                        )
                        this.config.store.vault = {
                            version: remoteData.version || 1,
                            contents: remoteData.contents,
                            keySalt: remoteData.keySalt,
                            iv: remoteData.iv,
                        }
                        try {
                            this.vault?.setStore(this.config.store.vault)
                        } catch (e) {
                            console.warn('[tabby-sync-and-backup] Could not update runtime vault store:', e)
                        }
                        mergedState.vault = { ...remoteVault }
                        result.vaultUpdated = true
                    } else if (localRev > remoteRev && localBase >= remoteRev) {
                        // Fast-forward: local is strictly newer ancestor, keep local
                        console.log(
                            `[tabby-sync-and-backup] Local vault is newer ancestor than peer "${peerState.deviceName || peerState.deviceId}" (local rev ${localRev} > remote rev ${remoteRev}). Keeping local.`
                        )
                    } else {
                        // Concurrent conflict (independent initial vaults or parallel offline edits)
                        console.warn(
                            `[tabby-sync-and-backup] Vault conflict detected with peer "${peerState.deviceName || peerState.deviceId}". Local rev ${localRev}, Remote rev ${remoteRev}.`
                        )
                        result.vaultConflict = {
                            localDeviceName: localState.deviceName,
                            remoteDeviceId: peerState.deviceId,
                            remoteDeviceName: peerState.deviceName || peerState.deviceId,
                            localUpdatedAt: localVaultEntry?.updatedAt,
                            remoteUpdatedAt: remoteVault.updatedAt,
                            remoteVault,
                        }
                    }
                }
            }
        }

        // -------------------------------------------------------------
        // D. APPLY CHANGES TO TABBY CONFIG STORE & SAVE
        // -------------------------------------------------------------
        const hasChanges =
            result.profilesAdded > 0 ||
            result.profilesUpdated > 0 ||
            result.profilesDeleted > 0 ||
            result.conflictsCreated > 0 ||
            result.groupsAdded > 0 ||
            result.groupsUpdated > 0 ||
            result.groupsDeleted > 0 ||
            result.vaultUpdated

        if (hasChanges) {
            this.config.store.profiles = localProfiles
            this.config.store.groups = localGroups
            await this.config.save()
        }

        mergedState.updatedAt = new Date().toISOString()
        return { mergedState, result }
    }
}
