---
layout: home

hero:
  name: "Tabby Sync & Backup"
  text: "Seamless synchronization & automatic backups for Tabby Terminal"
  tagline: "Effortlessly sync your profiles, SSH connections, vaults, and themes across all your workstations with authenticated End-to-End Encryption."
  image:
    src: /logo.svg
    alt: Tabby Sync & Backup Logo
  actions:
    - theme: brand
      text: Get Started →
      link: /guide/getting-started
    - theme: alt
      text: How Security Works 🛡️
      link: /guide/security
    - theme: alt
      text: View on GitHub ↗
      link: https://github.com/adelantad0/tabby-sync-and-backup

features:
  - icon: 🔄
    title: Conflict-Free Multi-Master Sync
    details: Innovative Device-Per-File architecture with Lamport logical clocks and SHA-256 validation. Eliminates cloud concurrency collisions across multiple devices.
  - icon: 🔐
    title: Authenticated E2EE Encryption
    details: Military-grade AES-256-GCM authenticated encryption with PBKDF2 (10,000 rounds). Your secrets, passwords, and private keys never leave your machine unencrypted.
  - icon: 🛡️
    title: Automated Pre-Sync Snapshots
    details: Never lose a configuration again. A local snapshot is created automatically before any merge or upon app startup, with one-click instant recovery.
  - icon: ☁️
    title: Freedom of Storage Providers
    details: Works with any WebDAV cloud (Nextcloud, ownCloud, Yandex.Disk) or local synced folders (iCloud Drive, Dropbox, Syncthing).
  - icon: ⚙️
    title: Granular Selective Sync
    details: Choose exactly what you want to synchronize — profiles, terminal colors, vaults, or folders — while preserving local OS-specific paths and hotkeys.
  - icon: 🌐
    title: Built-in Native Localization
    details: Full first-class support for English, Russian (Русский), and Simplified Chinese (简体中文). Seamlessly matches your Tabby language.
---

<div class="security-callout">
  <h4>🛡️ 100% Private & Open Source</h4>
  <p>
    No third-party tracking servers, no telemetry, and no centralized databases. All your data stays between your machines and your chosen personal storage, secured with authenticated client-side encryption.
  </p>
</div>
