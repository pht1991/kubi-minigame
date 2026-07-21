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
import { DialogPanel, DialogOption } from '../DialogPanel';
import { BagPanel } from '../BagPanel';
import { TradePanel } from '../TradePanel';
import { BattlePanel } from '../BattlePanel';
import { PageContext } from './PageContext';
import { GridPage } from '../../data/types';
import { BUILDING_UPDATE_DATA, ITEM_DATA } from '../../data/data';
import { ActionBuilding } from '../../actions/ActionBuilding';

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

    /**
     * 公共升级按钮信息助手（标题栏右侧，与所有可升级建筑统一接口）。
     * 给定升级组类型（如 'bigBoxUpdate'），构建 { upgradeInfo, onUpgradeClick } 供 GridPage 展开使用。
     * - 无升级组（BUILDING_UPDATE_DATA 无该键）→ 返回 { upgradeInfo: undefined }（GridComponent 隐藏按钮）
     * - 已满级 → { upgradeInfo: { label: '', state: 'maxed' } }（显示灰色「已满级」标签）
     * - 可升级 → normal / disabled（材料不足）+ 点击弹 DialogPanel 确认（名称 + 描述 + 效果 + 材料需求）
     *
     * @param upType       升级组 key（BUILDING_UPDATE_DATA 的键）
     * @param opts.title   确认弹窗标题
     * @param opts.onUpgraded 升级成功后的刷新回调（通常 navigator.replace 重新构建页面）
     * @param opts.buttonLabel 按钮文字（默认 "升级"）
     * @param opts.effectText   效果描述行（如 "容量 +4"），可选
     */
    protected makeUpgradeInfo(
        upType: string,
        opts: { title: string; onUpgraded: () => void; buttonLabel?: string; effectText?: string }
    ): Partial<Pick<GridPage, 'upgradeInfo' | 'onUpgradeClick'>> {
        const updateGroup = BUILDING_UPDATE_DATA[upType];
        if (!updateGroup) return { upgradeInfo: undefined };

        const level = this.gm.getBuildingLevel(upType);
        const levelKeys = Object.keys(updateGroup);
        const nextLevelId = levelKeys[level];
        if (!nextLevelId) {
            return { upgradeInfo: { label: '', state: 'maxed' } };
        }

        const upData = updateGroup[nextLevelId];
        const nextItem = ITEM_DATA[nextLevelId];
        const canMake = this.gm.checkHaveResource(upData.require || {});
        const reqParts = Object.entries(upData.require || {})
            .map(([k, v]) => `${ITEM_DATA[k]?.name || k}×${v}`)
            .join('  ');
        const nextName = nextItem?.name || `Lv.${level + 1}`;

        return {
            upgradeInfo: {
                label: opts.buttonLabel || '升级',
                state: canMake ? 'normal' : 'disabled',
            },
            onUpgradeClick: () => {
                const options: DialogOption[] = [];
                options.push({ label: nextName, data: null, disabled: true });
                if (nextItem?.desc) options.push({ label: nextItem.desc, data: null, disabled: true });
                if (opts.effectText) options.push({ label: opts.effectText, data: null, disabled: true });
                options.push({ label: `需求: ${reqParts}`, data: null, disabled: true, noTruncate: true });
                if (canMake) {
                    options.push({ label: '[确认升级]', data: { action: 'confirm', targetId: nextLevelId } });
                } else {
                    options.push({ label: '材料不足', data: null, disabled: true });
                }
                options.push({ label: '取消', data: null });
                this.dialogPanel?.show(
                    opts.title,
                    options,
                    (data) => {
                        if (data?.action === 'confirm') {
                            const r = ActionBuilding.instance.upgrade(upType, data.targetId);
                            this.setMsg(r.message);
                            opts.onUpgraded();
                        }
                    },
                    () => {}
                );
            },
        };
    }
}
