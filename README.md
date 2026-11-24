# Grok Live Pet

Grok Build 的 Windows Live2D 桌宠插件。单击金色双马尾的 Q 版 Grok 娘，她会在原地压扁、拉伸，再轻轻回到原来的形状。Grok Build 的工作状态显示在头顶气泡里。

## 安装

需要 Windows 10 或 11 x64 和 [Grok Build](https://docs.x.ai/build/overview)。在克隆后的项目根目录打开 PowerShell，运行下面两条命令。

```powershell
grok plugin install . --trust
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup.ps1
```

设置脚本会下载并校验固定版本的 Electron，然后打开桌宠。下次启动 Grok Build 会话时，插件会自动启动桌宠。打开 Grok Build 的 `/plugins` 可查看安装状态。桌宠随 Windows 用户会话运行，桌宠本身无需登录。

## 操作

| 操作 | 效果 |
| --- | --- |
| 单击角色 | 以脚底为支点，压扁后弹回来 |
| 拖住移动 | 在当前显示器内移动，也可拖到另一块屏幕 |
| 右键桌宠或系统托盘 | 切换尺寸、调整置顶和鼠标穿透、开关任务气泡 |

默认模型画布高 176 像素，菜单提供 136、176、224、272 像素四档。鼠标穿透开启后，可以从系统托盘恢复交互。

Grok Build 通过 hooks 上报查找、修改、执行、等待确认、完成等状态。多个会话并发时优先显示需要确认的会话，其次显示错误状态。hooks 只在本机按会话哈希记录阶段和时间。

## 实现参考

- 参考 `live2d_renderer.py` 和 `layered_window.py` 的模型渲染与透明窗口分层。此项目用独立的 Cubism 兼容模型包和 Electron 透明窗口渲染。[Alps-Link 大肥鱼桌宠](https://github.com/Alps-Link/deepseek-whale-Desktop-pet/blob/main/live2d_renderer.py) · [透明窗口源码](https://github.com/Alps-Link/deepseek-whale-Desktop-pet/blob/main/layered_window.py)
- 参考 `desktop/main.cjs` 对鼠标命中区域、穿透和多显示器坐标的处理。桌宠的点击轮廓从立绘的 alpha 通道生成。[DeepSeek-chan companion](https://github.com/lcyyun/deepseek-chan-companion/blob/main/desktop/main.cjs)
- 参考 `pet-director.js` 对工作状态与点击互动分别处理的结构。Grok 事件由自己的 Windows hook 投递。[seawhilt 大肥鱼](https://github.com/seawhilt/dafeiyu/blob/main/src/pet/pet-director.js) · [Grok Build Hooks](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/10-hooks.md)

## 模型与源码

- [生成立绘和提示词](assets/source/README.md)包含角色素材来源。内置模型位于 `assets/model/`，入口是 `GrokChibi.model3.json`，包括 `.moc3` 网格、纹理和 14 个可动参数。
- [Mochi2D](https://github.com/waifucave/mochi2d/tree/4378a87535b0b55101615e05892957b311cc2c5a) 提供运行时，锁定提交 `4378a87535b0b55101615e05892957b311cc2c5a`。构建后取 `dist/lib/mochi2d.js` 作为 `third_party/mochi2d.mjs`，其授权和第三方声明与文件同目录。
- 重新导出模型需要 Python 3.12 和 [live2d-autorig-claude](https://github.com/henceketh/live2d-autorig-claude/tree/9c21423559cd4dafebf4c4304f1b2dacdd9f7d31)。运行以下命令可重建模型文件。

```powershell
git clone https://github.com/henceketh/live2d-autorig-claude.git .work/live2d-autorig
git -C .work/live2d-autorig checkout 9c21423559cd4dafebf4c4304f1b2dacdd9f7d31
python -m pip install pillow numpy triangle scikit-image
python tools/build_model.py --upstream .work/live2d-autorig
```

## 卸载

从托盘右键退出桌宠，然后运行 `grok plugin uninstall grok-live-pet`。桌宠运行时和偏好保存在 `%LOCALAPPDATA%\GrokLivePet`，需要清除时可以在资源管理器删除该目录。

项目采用 [MIT 许可证](LICENSE)。Grok Live Pet 是非官方社区插件。
