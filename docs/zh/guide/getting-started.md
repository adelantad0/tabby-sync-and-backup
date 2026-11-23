# 快速开始

欢迎使用 **Tabby Sync & Backup**！本篇指南将协助您在 2 分钟内完成插件安装与首次同步配置。

---

## 1. 安装插件

您可以通过 Tabby 内置的插件中心一键安装，或通过命令行手动安装。

### 方式 A：通过 Tabby 插件中心安装（推荐）

1. 打开 **Tabby**。
2. 进入 **设置**（macOS 快捷键 `Cmd + ,`，Windows/Linux 快捷键 `Ctrl + ,`）。
3. 在左侧菜单点击 **插件 (Plugins)**。
4. 在搜索栏输入 `tabby-sync-and-backup`。
5. 点击 **安装 (Install)**。
6. 根据提示重启 Tabby。

### 方式 B：通过 npm 手动安装

切换至 Tabby 用户插件目录并执行：

```bash
npm install tabby-sync-and-backup
```

* **macOS:** `~/Library/Application Support/tabby/plugins`
* **Windows:** `%APPDATA%\tabby\plugins`
* **Linux:** `~/.config/tabby/plugins`

---

## 2. 找到配置面板

安装重启后，Tabby 设置页将新增一个独立专区：

1. 打开 **设置** (`Cmd + ,` 或 `Ctrl + ,`)。
2. 在侧边栏找到 **Sync & Backup**。

面板分为五个核心功能标签：
* **🔄 同步 (Sync)**：配置云端提供商及手动同步。
* **🛡️ 备份 (Backups)**：浏览本地与云端备份快照，一键还原。
* **🔐 安全 (Security)**：配置主加密密码与保管库状态。
* **📜 更新日志 (Changelog)**：插件版本变更说明。
* **ℹ️ 关于 (About)**：当前版本、更新检测与反馈渠道。

---

## 3. 初始设置流程（3 步走）

1. 进入 **安全 (Security)** 标签页。
2. 设置一个高强度的 **主密码 (Master Password)**，即刻激活端到端加密。
3. 切换至 **同步 (Sync)** 标签页：
   * 选择您习惯的存储类型（如 *本地目录* 配合 iCloud/坚果云，或 *WebDAV*）。
   * 填入路径或服务器 URL，点击 **测试连接 (Test Connection)**。
4. 点击 **保存设置 (Save Settings)**。
5. 点击 **立即同步 (Sync Now)**，首次快照即刻上传完毕！

---

## 快捷命令清单

无需每次打开设置，您可以通过 Tabby 的 **命令面板**（快捷键 `Cmd + Shift + P` / `Ctrl + Shift + P`）随时触发：

* `Sync & Backup: Synchronize Settings` — 立即执行双向增量同步。
* `Sync & Backup: Create Local Backup` — 立即生成当前配置的本地快照。

> [!TIP]
> 您可在 **设置 -> 热键 (Hotkeys)** 中为上述操作自定义专属快捷键组合。
