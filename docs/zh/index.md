---
layout: home

hero:
  name: "Tabby Sync & Backup"
  text: "Tabby Terminal 的全自动同步与备份工具"
  tagline: "在所有设备间安全同步您的 SSH 配置文件、密码保管库和主题外观，享受端到端 (E2EE) 军工级安全加密。"
  image:
    src: /logo.svg
    alt: Tabby Sync & Backup 图标
  actions:
    - theme: brand
      text: 快速开始 →
      link: /zh/guide/getting-started
    - theme: alt
      text: 安全与加密保证 🛡️
      link: /zh/guide/security
    - theme: alt
      text: GitHub 源码 ↗
      link: https://github.com/adelantad0/tabby-sync-and-backup

features:
  - icon: 🔄
    title: 无冲突多设备同步引擎
    details: 采用独创的 Device-Per-File 独立设备文件架构，结合兰伯特逻辑时钟与 SHA-256 校验，彻底消除多端云盘并发写入冲突。
  - icon: 🔐
    title: 真正的端到端加密 (E2EE)
    details: 基于 AES-256-GCM 认证加密及 PBKDF2（10,000 次哈希强化），敏感凭证与服务器私钥绝不以明文形式上传云端。
  - icon: 🛡️
    title: 同步前强制快照保护
    details: 杜绝意外丢失。在任何合并生效前或应用启动时均可自动备份本地配置，支持一键秒级还原回退。
  - icon: ☁️
    title: 广泛的存储后端支持
    details: 完美适配标准 WebDAV（Nextcloud、坚果云、自建私有云）或本地同步盘路径（iCloud Drive、Dropbox、Syncthing）。
  - icon: ⚙️
    title: 细粒度选择性同步
    details: 自由决定同步内容——仅同步服务器配置、外观主题还是凭据，各操作系统特定的本地路径与热键各自独立保留。
  - icon: 🌐
    title: 原生中文支持与国际化
    details: 深度支持简体中文、英文及俄文界面，自动检测并匹配您的 Tabby 语言偏好设置。
---

<div class="security-callout">
  <h4>🛡️ 100% 隐私保护与全开源设计</h4>
  <p>
    无第三方遥测追踪，无中央集权数据库。所有数据仅在您的个人设备与受信任的存储之间流动，在客户端完成完全加密。
  </p>
</div>
