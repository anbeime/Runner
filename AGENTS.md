# BILIBILI 像素方块世界 (Voxel Block World)

## 项目概览
基于 Three.js 的3D像素风格方块世界探索游戏。使用原生 HTML + CSS + ES Module JavaScript 构建，无需构建步骤。支持桌面端（键鼠）和移动端（触控）。世界中心沙质平地上展示 BILIBILI 品牌粉色像素文字立墙。

## 技术栈
- **渲染引擎**: Three.js r160 (通过 CDN importmap 加载)
- **语言**: JavaScript (ES Module)
- **样式**: 原生 CSS
- **服务器**: Python SimpleHTTPServer (端口 5000)

## 文件结构
```
index.html          # 游戏入口页面，包含 importmap、桌面端/移动端 UI 结构
styles/main.css     # 游戏界面样式（HUD、开始画面、触控 UI、响应式布局）
js/noise.js         # Simplex 2D 噪声生成器（地形高度图）
js/voxel.js         # 核心引擎：方块定义、纹理图集、区块管理、世界生成 + BILIBILI文字立墙 + 设备检测
js/animals.js       # 机器人实体系统：ScoutBot（轻型侦察机器人）、HeavyBot（重型机器人）体素模型、AI行为
js/game.js          # 游戏主模块：玩家控制、TouchController、物理系统、游戏循环
```

## 核心模块说明

### noise.js
- `SimplexNoise` 类：基于种子的2D Simplex噪声
- `fbm()` 方法：分形布朗运动，叠加多频率噪声生成自然地形

### voxel.js
- **方块类型**: AIR, GRASS, DIRT, STONE, SAND, WOOD, LEAVES, WATER, BILIBILI_PINK
- **纹理图集**: Canvas 绘制 16x16 像素纹理，共多种纹理，合并为图集贴图
- **Chunk 类**: 16x48x16 方块数据存储 + BufferGeometry 网格生成（仅渲染暴露面），含空区块快速跳过
- **World 类**: 区块管理、地形生成（噪声高度图 + 树木生成）、动态渲染距离区块加载/卸载、**BILIBILI 文字立墙生成**
- **设备检测**: `isMobileDevice()` 检测触屏设备，`getRenderDistance()` 返回适配渲染距离

#### BILIBILI 文字立墙
世界中心沙质平地上用品牌粉色方块搭建 "BILIBILI" 立墙（全大写，8个字母）：
- **方块色**: #FB7299 粉色（BILIBILI_PINK 类型），带微噪纹理
- **字母规格**: 9×9 像素位图，字母间隔 2 格，总宽度 86 格
- **立墙结构**: XY 平面立墙，3 格厚（Z=-1~1），9 格高（Y=19~27），立于沙质地面（Y=18）
- **平地范围**: X 方向 ±50、Z 方向 ±15 的矩形区域，地面统一铺平
- **核心方法**: `LETTERS` 静态对象（B/I/L 位图）、`_getTextBlock()`（XY 平面映射）、`_isInTextZone()`、`generateChunkData()` 中文字区分支
- **玩家出生点**: (0, 22, 35)，面朝立墙（yaw=0，pitch=-0.25 微仰视）

### animals.js
- **ScoutBot 类**: 轻型侦察机器人，银灰色金属机身 + 蓝色发光眼睛 + 天线（红色顶珠），快速移动，群体 AI
- **HeavyBot 类**: 重型机器人，暗灰金属机身 + 橙色发光眼睛 + 天线，慢速移动，独行 AI
- **AnimalManager 类**: 机器人实体管理器，Chunk 级生命周期、AI 状态机、实体网格构建

### game.js
- **Player 类**: 第一人称控制（WASD + 鼠标）、AABB碰撞检测、重力物理、DDA射线检测
- **TouchController 类**: 移动端虚拟摇杆、触屏视角控制、放置/破坏/跳跃按钮
- **BlockHighlight**: 目标方块线框高亮
- **Game 类**: Three.js 初始化、设备自适应、游戏循环、双端事件处理、UI 管理

## 游戏操作

### 桌面端
| 操作 | 功能 |
|------|------|
| W/A/S/D | 前后左右移动 |
| 鼠标移动 | 视角旋转 |
| 空格 | 跳跃 |
| 左键 | 放置方块 |
| 右键 | 破坏方块 |
| 1-6 / 滚轮 | 切换方块类型 |
| ESC | 暂停 |

### 移动端
| 操作 | 功能 |
|------|------|
| 左下摇杆拖动 | 移动 |
| 右侧/双指滑动 | 视角旋转 |
| 「跳」按钮 | 跳跃 |
| 「放」按钮 | 放置方块 |
| 「拆」按钮 | 破坏方块 |
| 底部物品栏 | 切换方块类型 |

## 移动端适配策略
1. **渲染距离**: 桌面端 RENDER_DISTANCE=4，移动端 MOBILE_RENDER_DISTANCE=4（已拉平）
2. **区块高度优化**: CHUNK_HEIGHT 从 64 降至 48（地形最高约 40）
3. **像素比限制**: 桌面端 maxDPR=2，移动端 maxDPR=1.2
4. **空区块快速跳过**: buildMesh 前检测全空气区块，跳过网格构建
5. **加载让步**: 移动端每生成 1 个区块即 yield 主线程（桌面端每 3 个）
6. **低功耗模式**: 移动端 WebGL `powerPreference: 'low-power'`
7. **指针锁定跳过**: 移动端不支持 PointerLock，直接用触控操作

## 性能优化策略
1. **面剔除**: 仅渲染暴露在空气中的方块面
2. **区块系统**: 16x48x16 区块，每区块一个合并网格（单次 draw call）
3. **渲染距离**: 桌面端和移动端均为 4 区块圆形范围
4. **增量加载**: 每帧最多生成 2 个区块，避免帧率骤降
5. **脏标记**: 仅在方块变化时重建区块网格
6. **雾效**: 隐藏区块加载边界
7. **NearestFilter**: 像素风格纹理过滤

## 关键常量
- `CHUNK_SIZE`: 16 (区块XZ尺寸)
- `CHUNK_HEIGHT`: 48 (区块高度，移动端优化)
- `RENDER_DISTANCE`: 4 (桌面端渲染距离，区块数)
- `MOBILE_RENDER_DISTANCE`: 4 (移动端渲染距离，与桌面端一致)
- `SEA_LEVEL`: 20 (海平面高度)
- `TEXT_GROUND_Y`: 18 (沙质平地 Y)
- `TEXT_BASE_Y`: 19 (立墙底部 Y)
- `TEXT_FLAT_RADIUS_X`: 50 (平地 X 方向半径，容纳86宽度文字)
- `TEXT_FLAT_RADIUS_Z`: 15 (平地 Z 方向半径)
- `TOTAL_W`: 86 (BILIBILI文字总宽度：9×8 + 2×7 = 86)
- `TEXT_WALL_Z`: 0 (立墙中心 Z)
