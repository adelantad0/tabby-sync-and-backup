# Security & Encryption

When synchronizing terminal settings, you are handling sensitive information: server IP addresses, usernames, private SSH keys, and stored passwords.

**Security and privacy are the core pillars of Tabby Sync & Backup.**

---

<div class="security-callout">
  <h4>🔒 Your Data Is End-to-End Encrypted</h4>
  <p>
    No plaintext secrets, passwords, or configuration parameters ever leave your computer. Everything is encrypted locally in memory before it touches your disk or cloud storage.
  </p>
</div>

---

## 1. How Your Data Is Protected

### Authenticated Encryption (AES-256-GCM)
* The plugin uses **AES-256 in Galois/Counter Mode (GCM)**, the gold standard for modern cryptography.
* In addition to secrecy, AES-GCM provides **cryptographic authentication**: if any cloud provider or third party alters even a single bit of your encrypted file, decryption fails immediately, preventing tampering attacks.

### Strong Key Derivation (PBKDF2)
* Your Master Password is transformed into a cryptographic key using **PBKDF2** with **10,000 iterations** and a unique cryptographic salt.
* This protects against brute-force attacks even if an unauthorized party gains access to your cloud storage files.

---

## 2. Tabby Vault Integration

Tabby features an internal **Vault** where passwords and SSH credentials are saved.

* When syncing, Tabby Sync & Backup respects Tabby's Vault architecture.
* You can selectively choose whether to include Vault secrets in the synchronization payload or sync only profiles/themes while keeping secrets strictly offline on each device.

---

## 3. Key Epochs & Password Rotation

What happens if you change your master password on your home laptop, but your office computer still uses the old password?

* The plugin tracks **Key Epochs**.
* If a device detects that the remote storage uses a newer key version, it **safely locks out synchronization** and prompts you to enter the updated password.
* It will **never** overwrite remote data with an outdated key, eliminating catastrophic decryption lockouts.

---

## 4. Encryption Status Badges

In the **Security** tab, you can inspect the exact encryption state of your local and remote backups at a glance:

| Badge | Meaning | Action Needed |
| :--- | :--- | :--- |
| <span style="color:#22c55e;font-weight:600">● Encrypted (OK)</span> | Successfully encrypted with your current master password. | None, everything is fully secured. |
| <span style="color:#eab308;font-weight:600">● Encrypted (Other Key)</span> | Encrypted with a previous password or different key epoch. | Use the "Batch Re-encrypt" button. |
| <span style="color:#ef4444;font-weight:600">● Plaintext</span> | Unencrypted legacy snapshot. | Set a password to encrypt it. |

---

## 5. Security Checklist for Users

1. **Choose a memorable Master Password:** Because of End-to-End Encryption, there is no "Forgot Password" backdoor. Store it in your password manager.
2. **Keep the same password on all devices:** Ensure all machines connected to the same storage use the same master password.
3. **Use private cloud endpoints:** When configuring WebDAV, use an HTTPS endpoint and generate an application-specific password rather than your main account password.
