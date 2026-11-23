# 存储提供商设置

Tabby Sync & Backup 不会把您绑定在任何私有封闭式付费平台，您对加密配置资产存放位置享有 100% 自主权。

---

## 适配存储后端

前往 **设置 -> Sync & Backup -> 同步 (Sync)** 即可选择后端模式：

### 1. 本地目录模式 (推荐配合各类个人云盘使用)

如果您的电脑已经安装并运行 **iCloud Drive**、**坚果云**、**OneDrive**、**Dropbox**、**Google Drive** 或 **Syncthing** 客户端，本地目录是最轻量且快速的选择。

#### 配置步骤：
1. 在存储提供商下拉菜单中选择 **本地目录 (Local Directory)**。
2. 点击 **浏览 (Browse)**，指向同步盘中的专属目录：
   * *iCloud Drive (macOS):* `~/Library/Mobile Documents/com~apple~CloudDocs/TabbySync`
   * *坚果云 / OneDrive:* 对应的同步工作区文件夹。
   * *Syncthing:* 共享同步文件夹。
3. 点击 **测试连接 (Test Connection)** 验证读写性能。
4. 点击 **保存设置 (Save Settings)**。

> [!TIP]
> 依托于 Device-Per-File 独立文件机制，多台设备并联运行时，个人网盘的后台同步绝不会产生文件冲突备份副本。

---

### 2. WebDAV 模式 (Nextcloud、自建私有云、坚果云等)

极客用户、私有化部署及中小团队的理想选择。

#### 配置步骤：
1. 存储提供商选择 **WebDAV**。
2. 填写访问参数：
   * **服务器 URL**：完整的 WebDAV 根路径（例如 `https://dav.jianguoyun.com/dav/tabby/` 或自建 Nextcloud WebDAV 链接）。
   * **用户名**：您的网盘登录账户。
   * **密码**：建议使用网盘管理中心生成的 **应用授权专用密码 / Token**。
3. 点击 **测试连接** 测算往返网络延迟并验证目录写入权限。
4. 点击 **保存设置**。

---

## 选择性同步控制

无须全盘照搬，在 **同步设置** 选项卡中，您可以按需勾选或关闭特定同步项目：

* **同步配置文件与连接**：包含 SSH、Telnet、Serial 和本地终端配置。
* **同步标签分组与文件夹**：保留分组树形收纳结构。
* **同步色彩主题**：包含自定义 ANSI 配色方案及外观偏好。
* **同步保管库凭证 (Vault)**：加密后的密码与专用密钥（按需可选）。

> [!NOTE]
> 各平台特异性路径（如 Windows 的 `powershell.exe` 与 macOS 的 `/bin/zsh`）及本地系统快捷键绑定永远被安全隔离，多系统混用不会造成环境污染。
