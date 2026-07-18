/**
 * BasePage.ts - 所有页面模块的抽象基类
 *
 * 提供对 PageContext 中共享能力的便捷访问（protected getter），
 * 各业务域 Page（CookPage/FarmPage/...）继承后只需关注自身页面构建逻辑。
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
import { PageContext } from './PageContext';

export abstract class BasePage {
    protected ctx: PageContext;

    constructor(ctx: PageContext) {
        this.ctx = ctx;
    }

    protected get navigator(): GridNavigator { return this.ctx.navigator; }
    protected get gm(): GameManager { return this.ctx.gm; }
    protected get eventBus(): EventBus { return this.ctx.eventBus; }
    protected get saveMgr(): SaveManager { return this.ctx.saveMgr; }
    protected get timeSys(): TimeSystem { return this.ctx.timeSys; }
    protected get dialogPanel(): DialogPanel { return this.ctx.dialogPanel; }
    protected get bagPanel(): BagPanel { return this.ctx.bagPanel; }
    protected get tradePanel(): TradePanel { return this.ctx.tradePanel; }
    protected get battlePanel(): BattlePanel { return this.ctx.battlePanel; }

    /** 反馈文案：弹 Toast + 立即存档 */
    protected setMsg(msg: string): void { this.ctx.setMsg(msg); }
}
