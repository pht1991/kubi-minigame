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

    /**
     * 各业务域 Page 实例引用（用于少数跨域导航，如建筑详情打开农田/陷阱/酿酒管理页）。
     * 类型用 any 以避免 PageContext ↔ 具体 Page 类的循环 import；
     * 由 MainScene 在创建所有 Page 后回填，各 Page 经 this.ctx.xxxPage 访问。
     */
    cookPage?: any;
    craftPage?: any;
    farmPage?: any;
    trapPage?: any;
    brewPage?: any;
    outdoorPage?: any;
    dungeonPage?: any;
    skillPage?: any;
    eventPage?: any;
    menuPage?: any;
    buildPage?: any;
    bagPage?: any;
    restPage?: any;
    /** 刷新底栏「出门/回家」按钮（MainScene 实现，OutdoorPage 设户外状态后回调） */
    refreshGoButton: () => void;
}
