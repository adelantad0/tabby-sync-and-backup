# Backups & Recovery

Even with reliable synchronization, accidents happen: a server gets deleted, a theme gets corrupted, or a computer crashes.

The **Backups** module is your safety net.

---

## 1. Automated Snapshots

Tabby Sync & Backup can create backups automatically based on two policies:

1. **Pre-Sync Snapshots (Mandatory)**:  
   Before any remote configuration changes are merged into your Tabby settings, the plugin creates an immediate local snapshot of your current state. If a remote sync ever does something unexpected, you can revert with one click.
2. **Startup Snapshots**:  
   Optionally creates a snapshot every time Tabby is launched, keeping an audit trail of your changes over time.

---

## 2. Retention Policy & Auto-Cleanup

To prevent snapshots from consuming unlimited disk space or cloud quota:

* You can configure **Maximum Snapshots to Keep** (default: `20`).
* Older snapshots are automatically rotated out using FIFO (First-In, First-Out), preserving only the newest ones.

---

## 3. How to Restore a Backup (One-Click)

1. Open Tabby **Settings -> Sync & Backup -> Backups**.
2. Browse the list of snapshots. Each snapshot displays:
   * Creation timestamp.
   * Number of profiles, themes, and vaults included.
   * Encryption status badge (`Encrypted (OK)`).
3. Click the **Restore** button next to the desired snapshot.
4. Tabby will reload with your exact restored configuration.

---

## 4. Disaster Recovery: Migrating to a New Computer

If you just bought a new laptop or reinstalled your operating system:

1. Install **Tabby** and install `tabby-sync-and-backup`.
2. Go to **Settings -> Sync & Backup -> Security** and enter your existing **Master Password**.
3. Go to **Sync**, choose your storage folder or WebDAV server, and click **Save Settings**.
4. Click **Sync Now**.
5. Within 5 seconds, all your SSH connections, folders, and appearance preferences will appear on your new machine!
