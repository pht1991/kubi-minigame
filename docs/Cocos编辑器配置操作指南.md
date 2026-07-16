# Cocos Creator 编辑器配置操作指南

> 本指南引导你在 Cocos Creator 3.8 中完成场景搭建、预制体创建和组件绑定，使阶段一代码可运行验证。

---

## 前置准备

### 1. 安装 Cocos Creator 3.8 LTS

1. 下载 [Cocos Dashboard](https://www.cocos.com/creator)
2. 在 Dashboard 的「编辑器」页安装 **Cocos Creator 3.8.x** LTS 版本
3. 安装时勾选「微信小游戏」构建支持

### 2. 打开项目

1. Cocos Dashboard → 「项目」页 → 「添加」
2. 选择 `D:\Projects\demos\front_end\kubi-minigame`
3. 用 3.8 版本打开

> 首次打开会自动编译 TypeScript 脚本，等待底部状态栏显示「编译完成」。

### 3. 配置设计分辨率

1. 顶部菜单 → 「项目」→「项目设置」→「通用设置」
2. 设计分辨率设为 **750 × 1334**（竖屏）
3. 适配模式选 **fit Width**（文字游戏优先宽度铺满）

---

## 第一步：创建主场景

### 1.1 新建场景文件

1. 在左侧「资源管理器」中，右键 `assets/scenes` 文件夹
2. 选择「新建」→「Scene」
3. 命名为 `MainScene`

### 1.2 场景节点层级结构

打开 MainScene，在「层级管理器」中按以下结构创建节点：

```
Canvas                          ← 自动生成
├── StatusBar                   ← 顶部状态栏
│   ├── Bg (Sprite)             ← 背景半透明黑底
│   ├── TimeLabel (Label)       ← 时间显示
│   ├── HP_Label (Label)        ← 生命
│   ├── Full_Label (Label)      ← 满腹
│   ├── Moist_Label (Label)     ← 水分
│   ├── PS_Label (Label)        ← 体力
│   ├── San_Label (Label)       ← 精神
│   ├── Temp_Label (Label)      ← 体温
│   ├── HP_Bar (Node + Sprite)  ← 生命进度条
│   ├── Full_Bar (Node + Sprite)
│   ├── Moist_Bar (Node + Sprite)
│   ├── PS_Bar (Node + Sprite)
│   └── San_Bar (Node + Sprite)
├── GridContainer               ← 网格主容器
│   ├── TitleLabel (Label)      ← 页面标题
│   ├── BreadcrumbLabel (Label) ← 面包屑导航
│   ├── BackButton (Node)       ← 返回按钮
│   │   └── Bg (Sprite + Label)
│   └── ScrollView (ScrollView) ← 网格滚动区域
│       └── view
│           └── content (Node)  ← 格子容器
└── GameManager                 ← 主控制器空节点
```

### 1.3 创建节点的操作方法

**创建普通节点**：层级管理器右键 →「创建」→「空节点」

**创建 Label**：右键 →「创建」→「UI → Label」

**创建 Sprite**：右键 →「创建」→「UI → Sprite」

**创建 ScrollView**：右键 →「创建」→「UI → ScrollView」

### 1.4 节点属性配置

#### StatusBar 节点
- 位置：顶部，Y 偏移约 +580（750×1334 下顶部位置）
- 尺寸：宽 750，高 120

#### 各状态 Label
- 字号：22
- 排列：水平排列在 StatusBar 内，可两行
- 第一行：TimeLabel（居中，字号 24）
- 第二行：HP_Label | Full_Label | Moist_Label | Temp_Label
- 第三行：PS_Label | San_Label

#### 进度条节点（以 HP_Bar 为例）
- 创建一个空节点 `HP_Bar`，宽 100 高 8
- 内部放一个 Sprite 子节点 `Fill`，左侧锚点（Anchor X=0）
- 用 Sprite 的 Scale X 模拟进度（StatusBar.ts 中通过 setScale 控制）

#### GridContainer 节点
- 位置：居中，Y 偏移约 -20
- 尺寸：宽 750，高 1100

#### TitleLabel
- 字号：28，加粗
- 位置：GridContainer 顶部

#### BreadcrumbLabel
- 字号：18，颜色灰色
- 位置：TitleLabel 下方

#### BackButton
- 尺寸：80×40
- 位置：左上角
- 内含 Label 显示「← 返回」

#### ScrollView
- 位置：GridContainer 中下部
- 尺寸：宽 700，高 900
- ScrollView 组件设置：水平滚动关闭，垂直滚动开启
- content 节点的 UITransform：锚点顶部居中（Anchor Y=1, Top）

---

## 第二步：创建 GridCell 预制体

### 2.1 创建格子节点

1. 层级管理器右键 →「创建」→「空节点」
2. 命名为 `GridCell`
3. 添加 UITransform 组件，尺寸 **160 × 160**

### 2.2 添加子节点

在 GridCell 下创建以下子节点：

```
GridCell
├── Border (Sprite)       ← 格子边框背景
├── Icon (Sprite)         ← 物品图标（可选）
├── NameLabel (Label)     ← 名称文字
├── CountLabel (Label)    ← 数量角标
├── Badge (Node)          ← 新内容红点
│   └── Bg (Sprite)       ← 红点圆形
└── CooldownMask (Node)   ← 冷却遮罩
    └── Bg (Sprite)       ← 半透明灰色
```

### 2.3 子节点属性

| 节点 | 尺寸 | 位置 | 其他 |
|------|------|------|------|
| Border | 160×160 | 居中 (0,0) | Sprite 颜色 #FFFFFF，透明度 30 |
| Icon | 80×80 | 上方 (0,30) | - |
| NameLabel | 140×30 | 下方 (0,-50) | 字号 20，居中对齐 |
| CountLabel | 40×20 | 右上 (60,60) | 字号 16，右对齐 |
| Badge | 16×16 | 右上 (65,65) | Sprite 颜色红色 |
| CooldownMask | 160×160 | 居中 (0,0) | 默认隐藏 |

### 2.4 挂载脚本并保存为预制体

1. 选中 GridCell 节点
2. 在右侧「属性检查器」底部 →「添加组件」→「自定义脚本」→ 选择 `GridCell`
3. 将以下 @property 槽位绑定到对应子节点：

| 脚本属性 | 拖入节点 |
|----------|----------|
| nameLabel | NameLabel |
| countLabel | CountLabel |
| iconSprite | Icon |
| borderSprite | Border |
| badgeNode | Badge |
| cooldownMask | CooldownMask |

4. 将 GridCell 节点从层级管理器**拖入**资源管理器的 `assets/prefabs/GridCell` 文件夹
5. 命名为 `GridCell`（生成 GridCell.prefab）
6. 删除场景中的 GridCell 节点（预制体已保存）

---

## 第三步：绑定场景组件

### 3.1 StatusBar 组件绑定

1. 选中场景中的 `StatusBar` 节点
2. 属性检查器 → 添加组件 → 自定义脚本 → 选择 `StatusBar`
3. 绑定以下引用：

| 脚本属性 | 拖入节点 |
|----------|----------|
| timeLabel | TimeLabel |
| hpLabel | HP_Label |
| fullLabel | Full_Label |
| moistLabel | Moist_Label |
| psLabel | PS_Label |
| sanLabel | San_Label |
| tempLabel | Temp_Label |
| hpBar | HP_Bar |
| fullBar | Full_Bar |
| moistBar | Moist_Bar |
| psBar | PS_Bar |
| sanBar | San_Bar |

### 3.2 GridComponent 组件绑定

1. 选中场景中的 `GridContainer` 节点
2. 属性检查器 → 添加组件 → 自定义脚本 → 选择 `GridComponent`
3. 绑定以下引用：

| 脚本属性 | 拖入节点 | 说明 |
|----------|----------|------|
| titleLabel | TitleLabel | - |
| breadcrumbLabel | BreadcrumbLabel | - |
| cellPrefab | GridCell.prefab | 从资源管理器拖入预制体 |
| contentNode | content | ScrollView 下的 content 节点 |
| backButton | BackButton | - |
| scrollView | ScrollView | ScrollView 节点本身 |

4. 下方数值属性保持默认：
   - columns = 4
   - cellSpacing = 8
   - cellWidth = 160
   - cellHeight = 160

### 3.3 MainScene 组件绑定

1. 选中场景中的 `GameManager` 节点（空节点）
2. 属性检查器 → 添加组件 → 自定义脚本 → 选择 `MainScene`
3. 绑定以下引用：

| 脚本属性 | 拖入节点 |
|----------|----------|
| statusBarNode | StatusBar |

---

## 第四步：运行测试

### 4.1 设置启动场景

1. 顶部菜单 →「项目」→「项目设置」→「场景设置」
2. 启动场景选择 `MainScene`

### 4.2 预览运行

1. 点击编辑器顶部的 ▶ 播放按钮
2. 浏览器预览窗口应显示：
   - 顶部状态栏：春第1日 早晨 + 初始状态值
   - 4×3 网格：状态/背包/制造/烹饪/建筑/地图/贸易/技能/地牢/任务/菜单/战斗
   - 战斗格灰显（disabled 状态）

### 4.3 验证清单

- [ ] 一级网格 12 个格子正常显示
- [ ] 点击「背包」→ 进入背包二级网格，显示 斧头×1 / 水×2 / 面包×2
- [ ] 点击格子有缩放动画反馈
- [ ] 左上角返回按钮可返回主页
- [ ] 面包屑显示「主页 > 背包」
- [ ] 点击「菜单」→ 存档 → 控制台输出「已保存」
- [ ] 点击「制造」→ 显示工作台网格（未建造的灰显）
- [ ] 状态栏数值正确（HP 100/100 等）

### 4.4 常见问题排查

| 问题 | 原因 | 解决 |
|------|------|------|
| 格子不显示 | cellPrefab 未绑定 | 检查 GridComponent 的 cellPrefab 槽位 |
| 格子重叠 | content 锚点不对 | content 节点 UITransform Anchor 设为 (0.5, 1) |
| 点击无反应 | 触摸事件未生效 | 检查 GridCell 节点是否有 UITransform |
| 状态栏空白 | Label 未绑定 | 检查 StatusBar 组件的 @property 绑定 |
| 编译报错 | TS 语法错误 | 查看编辑器底部控制台，修复后重新编译 |
| ScrollView 不滚动 | content 尺寸不够 | content 高度需大于 ScrollView 视口高度 |

---

## 第五步：配置微信小游戏构建

### 5.1 填入 AppID

1. 顶部菜单 →「项目」→「构建发布」
2. 平台选择「微信小游戏」
3. 填入微信小游戏 AppID（在 [mp.weixin.qq.com](https://mp.weixin.qq.com) 注册获取）
4. 游戏名称：超苦逼冒险者
5. 设备方向：竖屏

### 5.2 构建发布

1. 点击「构建」按钮
2. 构建完成后点击「打开」定位到构建产物
3. 构建产物在 `build/wechatgame/` 目录下

### 5.3 微信开发者工具调试

1. 打开微信开发者工具
2. 导入项目 → 选择 `build/wechatgame/` 目录
3. 填入 AppID
4. 在模拟器中预览游戏

---

## 节点绑定速查表

汇总所有需要绑定的引用，方便对照检查：

### GridCell 预制体（6 项）
| # | 组件 | 属性 | 节点 |
|---|------|------|------|
| 1 | GridCell | nameLabel | NameLabel |
| 2 | GridCell | countLabel | CountLabel |
| 3 | GridCell | iconSprite | Icon |
| 4 | GridCell | borderSprite | Border |
| 5 | GridCell | badgeNode | Badge |
| 6 | GridCell | cooldownMask | CooldownMask |

### StatusBar 节点（12 项）
| # | 组件 | 属性 | 节点 |
|---|------|------|------|
| 1 | StatusBar | timeLabel | TimeLabel |
| 2 | StatusBar | hpLabel | HP_Label |
| 3 | StatusBar | fullLabel | Full_Label |
| 4 | StatusBar | moistLabel | Moist_Label |
| 5 | StatusBar | psLabel | PS_Label |
| 6 | StatusBar | sanLabel | San_Label |
| 7 | StatusBar | tempLabel | Temp_Label |
| 8 | StatusBar | hpBar | HP_Bar |
| 9 | StatusBar | fullBar | Full_Bar |
| 10 | StatusBar | moistBar | Moist_Bar |
| 11 | StatusBar | psBar | PS_Bar |
| 12 | StatusBar | sanBar | San_Bar |

### GridContainer 节点（6 项 + 4 数值）
| # | 组件 | 属性 | 节点/值 |
|---|------|------|---------|
| 1 | GridComponent | titleLabel | TitleLabel |
| 2 | GridComponent | breadcrumbLabel | BreadcrumbLabel |
| 3 | GridComponent | cellPrefab | GridCell.prefab |
| 4 | GridComponent | contentNode | content |
| 5 | GridComponent | backButton | BackButton |
| 6 | GridComponent | scrollView | ScrollView |
| 7 | GridComponent | columns | 4 |
| 8 | GridComponent | cellSpacing | 8 |
| 9 | GridComponent | cellWidth | 160 |
| 10 | GridComponent | cellHeight | 160 |

### GameManager 节点（1 项）
| # | 组件 | 属性 | 节点 |
|---|------|------|------|
| 1 | MainScene | statusBarNode | StatusBar |

**总计 25 项绑定**，全部完成后即可运行。
