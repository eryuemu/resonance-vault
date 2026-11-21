# 本地桌面版开发与打包

桌面版用 Electron 自带的 Chromium 运行 React 界面。网页和桌面使用相同的书架、翻书转场、展台、播放器和字体。首次打开可以选择音乐文件夹，之后使用 `Ctrl+O` 或按 `Alt` 打开「音乐库」菜单继续添加。

Linux 检测到 NVIDIA 驱动且当前 Wayland 会话提供 XWayland 时，默认通过 XWayland 打开窗口。Chromium 仍使用 GPU 合成并执行完整转场。启动时传入 `--ozone-platform` 可指定图形后端。

需要 Node.js 22 或更高版本以及 Rust stable。Windows 构建需要 MSVC 工具链。Linux 构建 `.deb` 时需要 `fakeroot` 和 `dpkg-dev`。

| 命令 | 用途 |
| --- | --- |
| `npm ci` | 安装项目依赖和 Electron |
| `npm run dev` | 网页开发预览，读取 `src/data/vaultData.ts` |
| `npm run desktop:dev` | 构建并打开桌面版 |
| `npm run desktop:start` | 直接打开上一次构建的本地桌面版 |
| `npm run test:library` | 运行音乐库扫描、去重和索引恢复测试 |
| `npm run desktop:build` | 为当前系统打包，产物位于 `release/` |

[Desktop packages 工作流](../.github/workflows/desktop.yml) 在 Linux 和 Windows 上分别运行测试并构建 x64 安装包。可以手动触发工作流，也可以推送版本标签触发。安装包可从工作流的制品页面下载。

桌面版保留已有的 `library.json` 格式和位置。Linux 默认在 `~/.local/share/io.github.eryuemu.resonancevault/`，Windows 默认在 `%APPDATA%\io.github.eryuemu.resonancevault\`。运行扫描时通过 Rust 读取音频标签和封面尺寸，并原子更新索引。音频和视频保留在原位置，媒体由应用内部协议从已收录的文件读取。桌面构建不会复制 `public/albums` 与开发预览藏品。
