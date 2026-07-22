/**
 * HarvestModal.ts - 采集/拾荒「收获」选择弹窗
 *
 * 继承 ModalPanel。进度条结束后由 ActionMap 经 HARVEST_READY 事件触发，
 * 展示本次全部收获（物品 + 数量），让玩家自行取舍：
 *   - 点击某个材料 = 尝试拾取该材料（按背包「种类格」容量判断）
 *       · 已是背包已有种类（堆叠）或背包有空格 → 自动放入
 *       · 背包已满无空格 → Toast 提示「背包已满，无法拾取 X」
 *   - 再次点击已拾取的材料 = 放回（从背包移除，释放格子）
 *   - 底部「全部拾取」= 系统按上述逻辑自动逐个点击，满则跳过并提示未拾取项
 *   - 底部「完成」= 关闭弹窗；若有遗留未拾取项，Toast 提示
 *
 * 与原版「取全部/取部分」语义对齐：玩家主动决定，而非系统替他裁剪丢弃。
 */

import { Node, Label, UITransform, Graphics, NodeEventType, EventTouch } from 'cc';
import { ModalPanel } from './ModalPanel';
import { C, Btn } from './theme';
import { Toast } from './Toast';
import { GameManager } from '../core/GameManager';
import { EventBus, GameEvents } from '../core/EventBus';
import { ITEM_DATA } from '../data/data';

const ROW_H = 88;
const ROW_GAP = 10;

export class HarvestModal extends ModalPanel {
    protected panelW = 680;
    protected panelH = 880;
    protected showMask = true;
    protected maskClose = false;   // 必须点「完成」关闭，防止误触丢失收获
    protected showClose = false;

    /** 本次收获：物品ID → 数量 */
    private _loot: Record<string, number> = {};
    /** 玩家已选择拾取的物品ID 集合 */
    private _taken: Set<string> = new Set();

    /** 点击「背包」按钮时回调（由 MainScene 注入，打开背包界面） */
    public onOpenBag?: () => void;

    protected render(): void {
        this.clearContent();
        const cap = this._gm().boxSize['bag'] || 12;
        const used = Object.keys(this._gm().boxSaveData['bag'] || {}).length;

        // 顶部提示（背包容量）
        this.mkText(
            this._content!, 0, -8, this.panelW - 80, 40,
            `点击材料拾取（背包 ${used}/${cap}）`, 20, C.sub,
            { anchorY: 1, align: 'center' },
        );

        // 收获列表（可滚动）
        const listW = this.panelW - 56;
        const viewH = 540;
        const scroll = this.mkScroll(this._content!, 0, -56, listW, viewH);
        const ids = Object.keys(this._loot);
        const contentH = Math.max(viewH, ids.length * (ROW_H + ROW_GAP));
        const ct = scroll.content.getComponent(UITransform);
        if (ct) ct.setContentSize(listW, contentH);
        ids.forEach((id, i) => this.buildRow(scroll.content, id, -(i * (ROW_H + ROW_GAP)), listW, ROW_H));

        // 底部按钮：背包(左) / 全部拾取(中) / 完成(右)
        const btnW = (listW - 2 * 12) / 3;
        const btnY = -(viewH + 56 + 30);
        const xL = -(listW / 2) + btnW / 2;
        const xM = 0;
        const xR = (listW / 2) - btnW / 2;
        this.mkBtn(this._content!, xL, btnY, btnW, 60, '背包', Btn.neutral, () => this.onOpenBag?.());
        this.mkBtn(this._content!, xM, btnY, btnW, 60, '全部拾取', Btn.primary, () => this.takeAll());
        this.mkBtn(this._content!, xR, btnY, btnW, 60, '完成', Btn.confirm, () => this.finish());
    }

    /** 构建单行（材料 + 数量 + 拾取状态），点击切换拾取 */
    private buildRow(parent: Node, id: string, y: number, w: number, h: number): void {
        const taken = this._taken.has(id);
        const n = new Node('row');
        const nt = n.addComponent(UITransform); nt.setContentSize(w, h); nt.setAnchorPoint(0.5, 1);
        n.setPosition(0, y, 0); n.setParent(parent);
        const g = n.addComponent(Graphics);
        const bg = taken ? C.cellSelectedBg : C.optionBg;
        const border = taken ? C.cellSelectedStroke : C.optionStroke;
        this.mkRect(g, -w / 2, -h, w, h, 12, bg, border, 2);

        const name = ITEM_DATA[id]?.name || id;
        const qty = this._loot[id];
        this.mkInline(n, -w / 2 + 18, -h / 2, w * 0.62, h, name, 24, C.body);
        const qtyLbl = this.mkInline(n, w / 2 - 18, -h / 2, w * 0.3, h, `×${qty}`, 24, C.sub, false);
        qtyLbl.horizontalAlign = Label.HorizontalAlign.RIGHT;
        const tagLbl = this.mkInline(n, w / 2 - 18, -h * 0.74, w * 0.34, 26, taken ? '已拾取' : '点击拾取', 18,
            taken ? C.accent2 : C.sub, false);
        tagLbl.horizontalAlign = Label.HorizontalAlign.RIGHT;

        n.on(NodeEventType.TOUCH_END, (e: EventTouch) => { e.propagationStopped = true; this.toggleTake(id); });
    }

    /** 尝试把某物品放入背包：已有种类(堆叠)或背包有空格即可；否则失败 */
    private tryTake(id: string, qty: number): boolean {
        const bag = this._gm().boxSaveData['bag'] || {};
        if (bag[id] !== undefined) { this._gm().changeItem({ [id]: qty }); return true; }
        if (this._gm().bagFreeGrids() > 0) { this._gm().changeItem({ [id]: qty }); return true; }
        return false;
    }

    /** 点击材料：拾取 / 放回切换 */
    private toggleTake(id: string): void {
        const qty = this._loot[id];
        if (this._taken.has(id)) {
            // 放回：从背包移除该次收获（释放格子）
            this._gm().changeItem({ [id]: -qty });
            this._taken.delete(id);
        } else {
            if (this.tryTake(id, qty)) {
                this._taken.add(id);
            } else {
                Toast.instance?.show(`背包已满，无法拾取 ${ITEM_DATA[id]?.name || id}`);
            }
        }
        this._eventBus().emit(GameEvents.UI_REFRESH);
        // 延迟到下一帧重建，避免在 touch 事件处理中销毁 ScrollView 节点导致行闪烁/消失
        this.scheduleOnce(() => this.render(), 0);
    }

    /** 全部拾取：按玩家逐个点击的同一逻辑自动执行；满则跳过剩余并提示 */
    private takeAll(): void {
        const skipped: string[] = [];
        for (const id in this._loot) {
            if (this._taken.has(id)) continue;
            const qty = this._loot[id];
            if (this.tryTake(id, qty)) this._taken.add(id);
            else skipped.push(ITEM_DATA[id]?.name || id);
        }
        if (skipped.length) {
            Toast.instance?.show(`背包已满，以下未拾取：${skipped.join('、')}`);
        }
        this._eventBus().emit(GameEvents.UI_REFRESH);
        // 延迟到下一帧重建，避免在 touch 事件处理中销毁 ScrollView 节点导致行闪烁/消失
        this.scheduleOnce(() => this.render(), 0);
    }

    /** 完成：关闭弹窗；遗留未拾取项提示 */
    private finish(): void {
        const left = Object.keys(this._loot)
            .filter(id => !this._taken.has(id))
            .map(id => ITEM_DATA[id]?.name || id);
        if (left.length) Toast.instance?.show(`未拾取（已留在原地）：${left.join('、')}`);
        this._eventBus().emit(GameEvents.UI_REFRESH);
        this.hide();
    }

    /** 显示收获弹窗（标题 + 完整 loot） */
    public showHarvest(title: string, loot: Record<string, number>): void {
        this._loot = loot || {};
        this._taken = new Set();
        this.show(title);
    }

    // 便捷取单例依赖
    private _gm(): GameManager { return GameManager.instance; }
    private _eventBus(): EventBus { return EventBus.instance; }
}
