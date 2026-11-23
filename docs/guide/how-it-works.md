# How Synchronization Works

Most synchronization tools fail when two computers edit configurations at the same time, leading to corrupted files or lost connection profiles. 

**Tabby Sync & Backup** uses a robust, decentralized design to guarantee **Zero Data Loss**.

---

## The Core Concept: Device-Per-File

Instead of having all your machines write to a single shared `config.json` file, Tabby Sync & Backup assigns a unique device identifier to each machine (`deviceId`).

```
Your Storage (WebDAV / Cloud Folder)
└── sync/
    ├── devices/
    │   ├── macbook-pro.json     # Encrypted payload from Device A
    │   ├── office-desktop.json  # Encrypted payload from Device B
    │   └── thinkpad-linux.json  # Encrypted payload from Device C
    └── meta/
        └── clock.json           # Logical clock state
```

### Why this design is superior:
1. **No Cloud Race Conditions**: When iCloud, Dropbox, or WebDAV syncs files in the background, machines never overwrite each other's device state.
2. **Offline-First**: You can work completely offline for weeks. When you reconnect, the plugin reads all remote device files and merges them safely.
3. **Lamport Logical Clocks**: Changes are ordered deterministically using logical clocks rather than unreliable system wall clocks.

---

## Synchronization vs. Backup: The Big Difference

| Feature | Synchronization (Sync) | Backups (Snapshots) |
| :--- | :--- | :--- |
| **Goal** | Keep profiles identical across multiple devices | Save a historical point in time |
| **Deletion Behavior** | Propagates deletions across devices | Never deletes old profile data |
| **When it runs** | Periodically or upon request | Automatically before every sync & at startup |
| **Recovery Use Case** | Moving between work and home PC | Rolling back an accidental deletion |

---

## Conflict Resolution: Zero-Data-Loss

What happens if you rename an SSH profile on your laptop while editing the same profile on your desktop?

* **Conventional sync tools**: One edit silently overwrites and destroys the other.
* **Tabby Sync & Backup**: The plugin detects divergent SHA-256 hashes. Instead of guessing, it keeps the newest modification and automatically creates a safe duplicate:
  ```text
  [Production Server] (modified on MacBook)
  [Production Server (Conflict from Office-Desktop)]
  ```
  Both configurations are 100% preserved so you never lose connection credentials, custom environment variables, or port forwarding rules.

---

## Automatic 30-Day Tombstone Cleanup

When you deliberately delete a profile on one machine, a *tombstone record* marks it as deleted so other devices know to remove it. Tombstones are automatically purged after 30 days, keeping your storage clean and compact.
