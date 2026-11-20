# Catalog 与蓝色头像

根目录仅保留页面入口 `catalog.html`；本页面的样式、头像、第三方动画库、开发工具和 Rive 样例全部放在 `catalog/`。
原生 HTML + SVG + GSAP / MorphSVGPlugin，线上页面使用仓库内的资源，不依赖 CDN 或构建服务。

## 开发

需要 Node.js 22 或以上。以下命令从仓库根目录执行：

```powershell
npm --prefix catalog ci
npm --prefix catalog run setup:avatar
npm --prefix catalog run check
npm --prefix catalog run dev
```

打开 http://127.0.0.1:4173/catalog.html ，也可沿用现有静态服务器。
GSAP 固定为 3.15.1；更新版本后重新同步 vendor 文件，并一起提交锁文件。
许可证说明保留在发布文件头部和 `vendor/gsap/README.md` 中。

## 文件与调参

- `catalog.css`：页面布局、响应式适配、头像背后的两层蓝色柔光。
- `avatar/avatar-config.js`：造型、材质、运动、表情和随机间隔。
- `avatar/catalog-avatar.js`：形变、表情混合、视线阻尼和生命周期。
- `avatar/blue-avatar.svg`：静态基准造型。
- `scripts/`：静态预览、资源同步、代码检查与 Rive 安装。
- `experiments/rive-avatar/`：同造型的可编辑 RML 静态迁移样例。
- `.tools/`、`.artifacts/`、`node_modules/`：本地工具及产物，不进入 Git。

头像每隔 3.5–6.5 秒随机切换微笑、开心、好奇、眨单眼、惊讶或困倦，避免连续重复。
眨单眼只短暂停留 1.1 秒；切换通过插值平滑过渡，保留呼吸、轮廓形变、眨眼和视线跟随。
头像不提供按钮、点击交互或键盘焦点。系统减少动态效果时静态显示，离开视口或后台标签时自动停止计算。
随机表情用运行中的动画时间计时，返回页面时不会集中补播。

### 脸部曲面与差动

`avatar-config.js` 的 `rig` 定义脸部中轴、眼距、眼睛高度、嘴巴高度，以及同一球冠曲面的半径与深度。
五官从统一锚点经过同一转面、俯仰和透视投影生成位置，远近眼的宽度随投影变化。
眼睛和嘴巴不再分别追随不同的转向角，以避免转向时五官关系被拉散。

轮廓先运动，整个脸部通过阻尼弹簧稍晚跟随转面、漂浮、倾斜与挤压；
五官内部只保留有上限的局部软组织偏移（眼睛 1.2、嘴巴 0.8 SVG 单位），并约束在同一曲面上。
`depth` 控制转面幅度、周期、投影和阻尼，`motion.faceLag` 控制脸部相对轮廓的跟随速度。
自主转面使鼠标不动时也有体积变化；材质高光随朝向轻微偏移。减少动态效果时归位为正面。

```js
window.catalogAvatar.setState('thinking'); // 由业务接管，停止随机表情
window.catalogAvatar.setState('success');
window.catalogAvatar.resumeExpressions(); // 恢复随机表情
window.catalogAvatar.setGaze(0.5, -0.2); // 每轴 -1 到 1，鼠标移动会接管
window.catalogAvatar.destroy(); // 动态卸载页面片段前清理资源
```

原有 `idle / listening / thinking / speaking / success / error` 状态接口保留。
当前尚未接入真实 Agent 或音频；speaking 只是演示节奏。
目前只有文字参考，尚未对原始 10 秒视频做逐帧还原。

## Rive CLI

Windows CLI 1.10.0 安装在 `catalog/.tools/rive`，不修改系统 PATH。
以下命令从仓库根目录执行：

```powershell
powershell -File catalog/scripts/setup-rive.ps1
.\catalog\.tools\rive\rive.exe catalog/experiments/rive-avatar --verify
.\catalog\.tools\rive\rive.exe inspect catalog/experiments/rive-avatar --summary
.\catalog\.tools\rive\rive.exe catalog/experiments/rive-avatar --screenshot --advance=1
```

此样例只验证静态轮廓、渐变、五官的导入和本地编译，网页实际使用 SVG + GSAP。
导入源为 `avatar/blue-avatar.svg`；椭圆投影渐变会被 Rive SVG 导入器近似为圆形渐变。
导出签名 `.riv` 需要 Rive 登录，当前未登录或发布。

## 验证范围

代码检查覆盖页面脚本语法和本地动画资源；临时 JSDOM 环境用真实 GSAP 验证动画及控制逻辑，
已通过六种随机表情、间隔范围、避免连续重复、业务状态接管、移除暂停交互、系统减少动态效果和目录搜索检查。
统一脸部模型另经全部表情、急转反向与 20 fps 模拟检查：投影眼距保持 31.43–40.68 SVG 单位，
嘴巴偏离双眼中点不超过眼距的 4.8%，眼嘴垂直间距至少 17.94 单位。
脸部转面帧经 SVG 渲染检查，7 秒模型预览保存在 `.artifacts/face-rig-preview.mp4`（不含页面 CSS 背光）。
迁移后的页面、样式与动画资源在两个本地预览服务器均返回 HTTP 200。
不覆盖浏览器渲染布局。此前浏览器工具因无法可靠识别 Windows 浏览器 URL 而停止，
网页桌面与手机端的实机视觉验收尚未完成。Rive 静态样例编译及截图检查已通过。

官方资料：[GSAP 安装](https://gsap.com/docs/v3/Installation/) ·
[MorphSVGPlugin](https://gsap.com/docs/v3/Plugins/MorphSVGPlugin/) ·
[Rive CLI](https://rive.app/docs/cli/overview)。
