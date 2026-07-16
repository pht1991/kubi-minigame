# 超苦逼冒险者 - 微信小游戏版

> 基于 Cocos Creator 3.8 LTS 的网格化文字冒险游戏 | 移植自 [TheCedar/KuBi](https://github.com/TheCedar/KuBi)

## 项目状态

**阶段一：项目搭建 + 数据迁移** ✅ 已完成

## 快速开始

### 环境要求
- Cocos Creator 3.8 LTS（需在编辑器中打开项目）
- 微信开发者工具（用于小游戏预览/调试）

### 打开项目
1. 打开 Cocos Creator 3.8
2. 选择「打开其他项目」→ 定位到本目录
3. 编辑器会自动识别项目结构
4. 需要在编辑器中创建场景和预制体（见下方「编辑器待办」）

## 目录结构

```
kubi-minigame/
├── docs/                           # 设计文档
│   ├── 超苦逼冒险者_微信小游戏移植方案.md
│   └── 超苦逼冒险者_开发计划_网格版.md
├── outputs/                        # 产出物（构建产物/截图等）
├── assets/
│   ├── scenes/                     # 场景文件（需在编辑器创建）
│   ├── prefabs/                    # 预制体（需在编辑器创建）
│   │   ├── GridPanel/
│   │   ├── GridCell/
│   │   ├── Dialog/
│   │   └── StatusBar/
│   ├── resources/                  # 动态加载资源
│   └── scripts/                    # TypeScript 脚本
│       ├── core/                   # 核心框架
│       │   ├── EventBus.ts         # 事件系统
│       │   ├── GameManager.ts      # 全局状态管理
│       │   ├── SaveManager.ts      # 存档管理
│       │   ├── GridNavigator.ts    # 网格导航栈
│       │   └── utils.ts            # 工具函数库
│       ├── data/                   # 数据层（从原项目迁移）
│       │   ├── data.ts             # 基础配置/建筑/技能/贸易/状态等
│       │   ├── data_item.ts        # 物品数据
│       │   ├── data_studio.ts      # 制造/炼金/魔法/科技配方
│       │   ├── data_event.ts       # 事件数据
│       │   ├── data_mst.ts         # 怪物数据
│       │   ├── data_place.ts       # 地点数据
│       │   ├── data_dungeon.ts     # 地牢数据
│       │   ├── types.ts            # TypeScript 类型定义
│       │   └── index.ts            # 统一导出
│       ├── systems/                # 游戏系统
│       │   └── TimeSystem.ts       # 时间系统（日夜/季节/衰减）
│       └── ui/                     # UI 组件
│           ├── GridComponent.ts    # 通用网格容器
│           ├── GridCell.ts         # 网格格子组件
│           ├── StatusBar.ts        # 顶部状态栏
│           └── MainScene.ts        # 主场景控制器
├── settings/                       # Cocos 项目设置
├── package.json
└── tsconfig.json
```

## 已完成内容

### 数据层迁移（8300+ 行）
- ✅ 7 个数据文件从 JS 迁移到 TypeScript（var → export const）
- ✅ 类型定义文件（types.ts）覆盖所有核心数据结构
- ✅ 工具函数库（utils.ts）去除 DOM 依赖
- ✅ 统一导出（index.ts）

### 核心框架
- ✅ EventBus - 事件系统（替代 React Context 的状态更新机制）
- ✅ GameManager - 全局状态管理（玩家状态/物品/建筑/技能/存档序列化）
- ✅ SaveManager - 存档管理（wx.setStorageSync + localStorage fallback + 自动存档）
- ✅ GridNavigator - 网格导航栈（push/pop/replace + 面包屑）
- ✅ TimeSystem - 时间系统（日夜交替/季节循环/状态衰减）

### 网格 UI 组件
- ✅ GridCell - 格子组件（图标/名称/数量角标/状态边框/长按检测/点击动画）
- ✅ GridComponent - 网格容器（动态生成格子/ScrollView/触摸事件/入场动画）
- ✅ StatusBar - 状态栏（6 维状态 + 时间 + 进度条）
- ✅ MainScene - 主场景控制器（一级网格 + 12 个功能入口跳转）

## 编辑器待办

以下需要在 Cocos Creator 编辑器中完成：

1. **创建 MainScene 场景**
   - 添加 StatusBar 节点（顶部）+ GridComponent 节点（主体）
   - 绑定 MainScene 脚本到场景根节点

2. **创建预制体**
   - GridCell 预制体：Label(name) + Label(count) + Sprite(border) + Node(badge)
   - Dialog 预制体：详情弹窗

3. **绑定组件引用**
   - GridComponent 中绑定 cellPrefab / contentNode / scrollView / titleLabel 等
   - StatusBar 中绑定各 Label 和进度条节点

4. **配置微信小游戏构建**
   - 填入 AppID
   - 设置包名和版本号

## 技术架构

```
UI 层 (Cocos 预制体)  ←  GridComponent / GridCell / StatusBar
    ↕ 事件绑定
导航层               ←  GridNavigator (网格栈)
    ↕ 调用
逻辑层 (TS)          ←  GameManager / TimeSystem
    ↕ 数据读写
数据层 (TS)          ←  data_*.ts (从原项目迁移)
    ↕ 存储
存储层               ←  SaveManager → wx.setStorageSync
```

## 下一阶段：核心系统移植

- [ ] 生存系统完整实现（温度影响/死亡处理）
- [ ] 物品系统完善（装备/耐久度/分类）
- [ ] 制造系统（配方匹配/材料消耗/产出）
- [ ] 烹饪系统（双食材选择/配方匹配）
- [ ] 建筑系统（建造/升级/等级查询）
- [ ] 战斗系统（技能加成/冷却/回合制）
- [ ] 事件系统（触发条件/任务链）
- [ ] 贸易系统（商人刷新/交易）
- [ ] 地牢系统（楼层推进/专属事件）
