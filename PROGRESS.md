# 开发进度总结（截至 2026-08-04）

> 基于代码库只读勘察（72 个 TS 文件 / 约 20.4k 行，assets/scripts/）。

## 一、总体规模
- **72 个 TS 文件 / 约 20.4k 行**。
- 数据表体量：`data_item`(3046) / `data`(1299) / `data_mst`(1124) / `data_studio`(938) / `data_place`(880) / `data_event`(536) / `data_dungeon`(485) / `types`(317)。
- 14 个页面、13 个业务 Action、8 个 UI 组件，**全部为具体实现、无占位/无 TODO**（之前误记 13 页，实际含 `BigBoxPage` 共 14 个）。

## 二、系统完整度（~95%）
- 架构扎实：`MainScene` 显式建立 6 层 UI（Content→StatusBar→BottomBar→Modal→Progress→Toast）；全局单例 `GameManager/EventBus/SaveManager/TimeSystem/GridNavigator/ActionExecutor` 规范管理。
- 解耦到位：`BasePage`（基类，统一升级按钮助手）+ `PageContext`（注入共享服务与弹窗引用），页面不直接 `new` 弹窗。
- 14 个页面全部落地：烹饪/制造/种植/陷阱/酿造/外出/地牢/技能/事件/建造/菜单/休息/背包/大宝箱。
- 13 个 Action 全部完整：含交互式回合制战斗、完整地牢状态机（前缀/陷阱/探索度/钥匙/绳索）、建造升级、交易（纯易货估值 `TRADE_MUL=0.75`，gold 作 give 受 sold 上限、无每日免费领）、装备 equip/unequip、事件触发等，无 stub。

## 三、功能点覆盖度（~85%）
六大支撑功能点全覆盖且可用：
- 事件链前置解锁（未完成前置则隐藏后续）
- 大宝箱（按实际数量计容 + 容量升级）
- 对话系统（高度自适应）
- 进度条异步解算（`ActionExecutor` 真实时长动画，动画结束才解算）
- 存档（格式校验 + 60s 自动存档 + 旧档兼容，云存档默认关）
- EventBus 事件总线

核心玩法循环（生产→成长→探索→战斗→仓储→经济）已闭合。

**逻辑缺陷 / 不一致（依据「打磨期设计裁决」§0 逐行核实，已校准）：**

> 以下结论以代码实测为准，修正了本文件早期「两套战斗解算不一致 / 地图怪不递减」的过时记录（详见 `design/gdd/打磨期设计裁决.md` §0）。

1. 战斗解算**公式层已统一**：交互式 `ActionCombat` 与事件式 `ActionDungeon.battle()` 共用 `applyPrefix / calcPlayerAtk / calcDamageReduce / decay*` 同一套函数，不存在「难度与后果不同」的公式级偏差。真正的残余不一致在**交互层**：事件战斗走 `ActionDungeon.battle()` 自动解算（无技能 / 无逃跑 / 无玩家抉择），与地图、地牢交互式 `BattlePanel` 规则不一。→ 待修项 **D1（老板已定 Option A：事件改走交互式 BattlePanel）**，属 P0 未收口，**非公式缺陷**。
2. 地图怪数量不递减：**已收口（D2，T-ENG-01 已修）**。`ActionMap.consumeHuntedMonster` 在胜利时扣减 `mst.amount`，`OutdoorPage` 经 `ActionCombat` 的 `onWin` 一次性回调注入胜利扣减，与采集 `gather` 枯竭模型一致（原 `ActionMap.hunt` 死代码已移除）。

## 四、界面完整度（~90%）
- 纯代码组件库 8 件齐全（UINode/UIShape/UILabel/UIButton/UISpacer/UIVStack/UIHStack/UIGrid）+ barrel 导出完整；`UILabel` 支持 `wrap` 自动换行 + `measuredHeight` 真实高度测量。
- 背包 UI 经多轮打磨：加宽→字号放大→对齐主页字号→自动换行不缩放 + 行高随内容撑开，长文本不再截断。
- 分层 Modal（遮罩用 Graphics 不用 Sprite）、StatusBar/BottomBar/Toast/ProgressOverlay 均完整。
- 此前担心的 `BagPanel/DialogPanel` 覆写 `show` 触发 TS2416 经核查**不成立**（方法双变比较允许不同签名），可正常编译。

## 五、交互/性能优化（~65%）
已做好：
- EventBus 监听在 `onDestroy` 统一 `off`（3 个组件 + MainScene 6 个监听，稳定引用防泄漏），无监听器泄漏。
- 单例生命周期规范（`Toast/SaveIndicator/ProgressOverlay` 销毁时置空）。
- 低端机 `frameRate=30` 降帧；cell 页脚/升级按钮复用同一节点避免反复 `new`；自动存档 60s。

待优化：
- 无对象池：列表刷新时全量 `destroy` + `instantiate` 重建，长列表有 GC/瞬时卡顿风险。
- 无事件节流：`UI_REFRESH` 高频触发全量 `renderPage`。
- `GridCell.ts` 无 `onDestroy`，长按 `setTimeout` 未在销毁时清理（低危）。

## 六、工程/交付状态
- 构建脚本已加固（`stdin <nul` / `ping` 真实等待 / 异步轮询产物 / `fix-build-config` 始终执行），端到端验证通过；`DEPLOY.md` 已落地。
- 微信端 `libVersion=3.16.2`、`build/wechatgame` 含最新背包修复；gh-pages 线上已是最新。
- `separateEngine` 保持 false，等「上架通知」再切 true + 授权 CocosCreator 插件。

## 已知缺陷（待修，按影响排序；已按「打磨期设计裁决」§0 校准）

> 已核实：原 #1「两套战斗解算不一致」公式层已统一（D4 ✅），仅 D1 交互层待修；原 #2「地图怪数量不递减」已由 D2 / T-ENG-01 收口。二者不再记为「未修缺陷」。

1. 事件战斗交互层一致性（D1，P0 未收口）：公式已统一，但事件战斗 `ActionDungeon.battle()` 仍自动解算（无技能 / 逃跑 / 抉择），与地图、地牢交互式 BattlePanel 规则不一；老板已定 **Option A**（事件改走交互式 BattlePanel）。
2. 【已收口】地图怪数量不递减（D2 / T-ENG-01 已修：`consumeHuntedMonster` + `OutdoorPage.onWin` 胜利扣减，与 `gather` 枯竭一致）——移出待修。
3. GridCell 无对象池 / 无 UI_REFRESH 节流（长列表重建开销）
4. GridCell 缺 `onDestroy` 清 setTimeout；`ActionItem.ts:3` 过时注释
