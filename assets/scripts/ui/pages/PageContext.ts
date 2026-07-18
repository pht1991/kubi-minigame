/**
 * PageContext.ts - 页面模块共享上下文
 *
 * 把 MainScene 对外暴露的能力（单例服务 + 弹窗引用 + 共享反馈回调）收敛到一个接口，
 * 供所有抽离出去的 Page 模块（CookPage/FarmPage/...）使用，避免 Page 与 MainScene 强耦合。
 *
 * 设计要点：
 * - 单例服务（navigator/gm/eventBus/saveMgr/timeSys）直接传实例引用
 * - 4 个弹窗（dialogPanel/bagPanel/tradePanel/battlePanel）在 MainScene.start() 中创建，
 *   非单例，必须显式传入
 * - setMsg 回调封装 MainScene 的「反馈即 Toast + 立即存档」行为，Page 不必关心实现细节
 */

import { GridNavigator } from '../../core/GridNavigator';
import { GameManager } from '../../core/GameManager';
import { EventBus } from '../../core/EventBus';
import { SaveManager } from '../../core/SaveManager';
import { TimeSystem } from '../../systems/TimeSystem';
import { DialogPanel } from '../DialogPanel';
import { BagPanel } from '../BagPanel';
import { TradePanel } from '../TradePanel';
import { BattlePanel } from '../BattlePanel';

export interface PageContext {
    /** 导航栈（push/pop/replace/setRoot） */
    navigator: GridNavigator;
    /** 游戏状态管理（boxSaveData / changeItem / checkHaveResource 等） */
    gm: GameManager;
    /** 事件总线（emit UI_REFRESH / ITEM_CHANGE 等） */
    eventBus: EventBus;
    /** 存档管理（save） */
    saveMgr: SaveManager;
    /** 时间系统 */
    timeSys: TimeSystem;
    /** 操作/选项弹窗 */
    dialogPanel: DialogPanel;
    /** 背包弹窗 */
    bagPanel: BagPanel;
    /** 交易弹窗 */
    tradePanel: TradePanel;
    /** 战斗面板 */
    battlePanel: BattlePanel;
    /** 反馈文案：弹 Toast + 立即存档（等价 MainScene._lastMsg setter） */
    setMsg: (msg: string) => void;
}
