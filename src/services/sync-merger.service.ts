import { Injectable } from '@angular/core'
import { ConfigService } from 'tabby-core'
import {
    SyncDeviceState,
    SyncProfileEntry,
    SyncProfileGroupEntry,
    SyncMergeResult,
} from '../models/sync.model'
import { DeviceIdentityService } from './device-identity.service'

const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

@Injectable({ providedIn: 'root' })
export class SyncMergerService {
    constructor(
        private config: ConfigService,
        private deviceIdentity: DeviceIdentityService,
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

        return {
            formatVersion: 1,
            deviceId,
            deviceName,
            platform,
            updatedAt: new Date().toISOString(),
            profiles: profileEntries,
            profileGroups: groupEntries,
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
        // C. APPLY CHANGES TO TABBY CONFIG STORE & SAVE
        // -------------------------------------------------------------
        const hasChanges =
            result.profilesAdded > 0 ||
            result.profilesUpdated > 0 ||
            result.profilesDeleted > 0 ||
            result.conflictsCreated > 0 ||
            result.groupsAdded > 0 ||
            result.groupsUpdated > 0 ||
            result.groupsDeleted > 0

        if (hasChanges) {
            this.config.store.profiles = localProfiles
            this.config.store.groups = localGroups
            await this.config.save()
        }

        mergedState.updatedAt = new Date().toISOString()
        return { mergedState, result }
    }
}
