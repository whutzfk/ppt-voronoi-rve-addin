# PowerPoint Voronoi RVE Generator

这是一个 Office.js PowerPoint 加载项原型，用于在 PowerPoint 任务窗格中输入 RVE 参数并插入 2D Voronoi RVE 图。

## 参数入口

- RVE宽度和高度，单位 `um`
- 泡孔数量
- 约束方式：输入孔隙率或输入壁厚
- 壁厚，单位 `um`，仅在选择“输入壁厚”时作为主动输入
- 目标孔隙率，仅在选择“输入孔隙率”时作为主动输入
- 发泡倍率，仅在选择“输入孔隙率”时与孔隙率双向换算
- 结构均匀度：`随机`、`均匀`、`不均匀`
- 目标变异系数：模式切换时自动填入建议值，也可手动修改
- 随机种子
- 背景、胞壁、胞壁边线、孔隙、孔隙边线、种子点颜色

默认参数为 `100 um x 100 um`、`80` 个泡孔、孔隙率约束 `0.75`、发泡倍率 `4.00`、随机结构、目标变异系数 `0.60`、随机种子 `42`。

## 生成逻辑

加载项在浏览器端用 `d3-delaunay` 生成边界裁剪的 2D Voronoi 单元。结构均匀度控制种子点分布：`随机` 保持普通随机撒点；`均匀` 对随机点做 Lloyd 质心松弛，使泡孔中心距离更接近；`不均匀` 使用聚簇随机点，使局部泡孔密集、局部稀疏。目标变异系数作为点分布控制参数，生成后界面会显示实际最近邻距离变异系数用于对比。每个单元按质心向内缩放，得到孔洞区域；2D 面积孔隙率按 `phi_2d = K^2` 与几何缩放因子关联。发泡倍率与孔隙率按 `孔隙率 = 1 - 1 / 发泡倍率` 双向换算。壁厚和孔隙率通过“约束方式”二选一输入，另一个参数自动计算，避免同时输入造成矛盾。点击 `下载SVG` 可保存可编辑矢量图，点击 `下载PNG` 可保存位图；点击 `插入PPT` 后，SVG 会转换成 PNG 并插入当前幻灯片。

## 本地运行

```powershell
cd D:\00_APPFiles\Codex\research\ppt-voronoi-rve-addin
npm run dev
```

浏览器预览：

```text
http://localhost:3000/src/taskpane.html
```

PowerPoint 侧载时使用：

```text
D:\00_APPFiles\Codex\research\ppt-voronoi-rve-addin\manifest.xml
```

注意：浏览器预览页只能验证参数、SVG 预览和计算结果；`插入PPT` 必须在 PowerPoint 侧载该 manifest 后，从 PowerPoint 的加载项任务窗格中点击才会写入当前幻灯片。

## 说明

当前版本输出 2D RVE 图像；3D Rhino/Python 导出仍建议使用原 `voronoi-biomimetic-rve` 技能脚本生成。
