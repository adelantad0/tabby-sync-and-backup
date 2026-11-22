# Tabby Sync & Backup

[English](README.md) | [Русский](README.ru-RU.md) | [简体中文](README.zh-CN.md)

专为 [Tabby Terminal](https://github.com/Eugeny/tabby) 打造的配置同步与自动备份双合一解决方案。

## 概述

`tabby-sync-and-backup` 帮助您在多台设备间无缝同步 Tabby 的终端连接配置方案 (Profiles)、配色方案与全局设置，同时在本地维护多版本快照，有效防止配置意外丢失。

## 核心特性

- **多设备同步引擎**：采用独立设备状态文件架构（`devices/<deviceId>.json`），配合 Lamport 逻辑时钟、SHA-256 内容哈希以及 30 天墓碑删除标记机制，彻底杜绝云盘与网络同步冲突（iCloud、Dropbox、Syncthing、WebDAV）。
- **端到端加密 (E2EE)**：基于 PBKDF2（10,000 次迭代）与 AES-256-GCM 认证加密技术，所有云端同步载荷与备份文件均经严格加密，零明文泄露风险。
- **密钥纪元轮换 (Key Epoch)**：多设备密码轮换追踪与安全锁定保护，当主加密密码不一致时自动锁定同步，防止配置相互覆盖。
- **零数据丢失冲突合并**：离线并行编辑自动分叉为安全副本（`配置方案 (来自设备 <Device> 的冲突)`），完整保留所有连接参数与细节。
- **自动 Pre-Sync 备份**：每次配置合并前强制自动创建本地安全快照。
- **存储连接实时探测**：实时测量 WebDAV 服务器及本地文件夹的响应延迟并验证读写可用性。
- **选择性同步**：可自由选择同步连接方案、分组目录、密码凭证库或配色主题，同时严格保留各操作系统本地的终端 Shell 路径与快捷键设置。
- **完整多语言支持 (i18n)**：原生支持英语、俄语 (Русский) 与简体中文 (zh-CN)，随 Tabby 系统语言自动切换。

## 设置与功能选项卡

在 Tabby 的 **设置 -> 同步与备份** 中，插件提供了清晰的功能分区：
1. **🔄 同步**：选择存储提供商（WebDAV、本地共享目录）、配置同步计划、显式保存设置面板以及手动同步触发。
2. **🛡️ 备份**：双重快照管理（Tabby 本地目录与云端 `/backups`）、自动保留策略轮换、启动备份与一键快速恢复。
3. **🔐 安全**：AES-256-GCM 加密管理、主密码验证、备份加密状态标识（`明文`、`加密正常`、`不同密钥`）、密码修改批量重新加密以及 Tabby Vault 状态。
4. **ℹ️ 关于**：版本信息、在线检查更新、一键复制诊断信息及版本发布历史。

## 安装指南

### 通过 Tabby 插件管理器安装
1. 打开 Tabby **设置**（`Cmd + ,` 或 `Ctrl + ,`）。
2. 点击 **插件** (Plugins)。
3. 在搜索框中输入 `tabby-sync-and-backup`。
4. 点击 **安装** (Install)，完成后重启 Tabby。

### 手动安装
在 Tabby 用户插件目录下执行：
```bash
npm install tabby-sync-and-backup
```

## 可用命令

可通过 Tabby **命令面板**（`Cmd + Shift + P` 或 `Ctrl + Shift + P`）调用以下命令：
- `Sync & Backup: 同步设置`
- `Sync & Backup: 创建本地备份`

快捷键可在 **设置 -> 快捷键** 中自定义绑定。

## 本地开发调试

```bash
# 克隆仓库
git clone https://github.com/adelantad0/tabby-sync-and-backup.git
cd tabby-sync-and-backup

# 安装依赖并构建
npm install
npm run build

# 监听开发模式
npm run watch
```

在 Tabby 中软链接调试：
```bash
# macOS 示例
mkdir -p "$HOME/Library/Application Support/tabby/plugins/node_modules"
ln -sfn "$(pwd)" "$HOME/Library/Application Support/tabby/plugins/node_modules/tabby-sync-and-backup"
```

## 许可证

MIT
