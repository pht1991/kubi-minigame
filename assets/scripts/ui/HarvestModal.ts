/**
 * HarvestModal.ts - 采集/拾荒「收获」选择弹窗
 *
 * 继承 ModalPanel。进度条结束后由 ActionMap 经 HARVEST_READY 事件触发，
 * 展示本次全部收获（物品 + 数量），让玩家自行取舍：
 *   - 点击某个材料 = 尝试放入背包（按背包「种类格」容量判断）
 *       · 已是背包已有种类（堆叠）或背包有空格 → 自动放入，该材料从列表消失
 *       · 背包已满无空格 → Toast 提示「背包已满，无法拾取 X」，材料留在列表
 *   - 底部「全部拾取」= 系统按上述同一逻辑自动逐个放入，满则跳过并提示未拾取项
 *   - 底部「背包」= 打开背包界面，玩家自行维护已放入的物品
 *   - 底部「完成」= 关闭弹窗；若有遗留未拾取项，Toast 提示（留在原地）
 *
 * 行用 ModalRow 公共组件，列表用 ModalScrollList（固定 panelH，不随内容 resize）。
 */

import { ModalPanel } from './ModalPanel';
import { C, Btn } from './theme';
import { UIHStack, UIButton, ModalRow, ModalScrollList } from './widgets';
import { Toast } from './Toast';
import { GameManager } from '../core/GameManager';
import { EventBus, GameEvents } from '../core/EventBus';
import { ITEM_DATA } from '../data/data';

const ROW_GAP = 10;

export class HarvestModal extends ModalPanel {
    protected panelW = 680;
    protected panelH = 880;
    protected showMask = true;
    protected maskClose = false;   // 必须点「完成」关闭，防止误触丢失收获
    protected showClose = false;

    /** 本次收获（尚未拾取）：物品ID → 数量。拾取成功后从该表删除，列表即消失 */
    private _loot: Record<string, number> = {};

    /** 点击「背包」按钮时回调（由 MainScene 注入，打开背包界面） */
    public onOpenBag?: () => void;

    private _list!: ModalScrollList;

    protected render(): void {
        this.clearContent();
        const cap = this._gm().boxSize['bag'] || 12;
        const used = Object.keys(this._gm().boxSaveData['bag'] || {}).length;

        // 顶部提示（背包容量）
        this.mkText(
            this._content!, 0, -8, this.panelW - 80, 40,
            `点击材料放入背包（背包 ${used}/${cap}）`, 20, C.sub,
            { anchorY: 1, align: 'center' },
        );

        // 收获列表（可滚动；行用 ModalRow，setRows 自动装载 + 自适应 content 高度）
        const listW = this.panelW - 56;
        const ids = Object.keys(this._loot);
        const rows: ModalRow[] = [];
        if (ids.length === 0) {
            rows.push(new ModalRow({
                width: listW, name: '已全部拾取，可点「背包」整理物品',
                align: 'center', bg: C.optionBg, stroke: C.optionStroke,
            }));
        } else {
            for (const id of ids) {
                const name = ITEM_DATA[id]?.name || id;
                const qty = this._loot[id];
                rows.push(new ModalRow({
                    width: listW, name, align: 'left',
                    meta: `×${qty}`, metaColor: C.sub,
                    subText: '点击拾取', subColor: C.accent2, subSize: 18,
                    bg: C.optionBg, stroke: C.optionStroke, radius: 12,
                    onTap: () => this.take(id),
                }));
            }
        }
        // 列表每次 render 在 clearContent 之后重建（避免操作已销毁节点）
        this._list = this.createScrollList({
            parent: this._content!, x: 0, y: -56,
            width: listW, viewH: 540, gap: ROW_GAP,
            autoResizePanel: false, repositionScroll: false, align: 'center',
        });
        const listH = this._list.setRows(rows);

        // 手动 resizePanel：list 收缩到内容高（listH=actualViewH）后面板也要跟着收缩，
        // 否则固定 panelH=880 + 3 行材料 → 底部 ~300px 死区
        // 面板内容 = 标题(90) + 提示(40) + 列表(listH) + 按钮区(86) + 底部padding(30)
        const targetH = 90 + 40 + listH + 86 + 30;
        this.resizePanel(Math.max(420, Math.min(880, targetH)));

        // 底部按钮：背包(左) / 全部拾取(中) / 完成(右)——HStack 自动排布（y 跟随列表实际高度）
        const btnW = (listW - 2 * 12) / 3;
        const btnRow = new UIHStack().gap(12)
            .add(new UIButton('背包', Btn.neutral, () => this.onOpenBag?.(), btnW, 60))
            .add(new UIButton('全部拾取', Btn.primary, () => this.takeAll(), btnW, 60))
            .add(new UIButton('完成', Btn.confirm, () => this.finish(), btnW, 60));
        btnRow.mount(this._content!);
        btnRow.pos(0, -(listH + 56 + 30), 0);
    }

    /** 尝试把某物品放入背包：已有种类(堆叠)或背包有空格即可；否则失败 */
    private tryTake(id: string, qty: number): boolean {
        const bag = this._gm().boxSaveData['bag'] || {};
        if (bag[id] !== undefined) { this._gm().changeItem({ [id]: qty }); return true; }
        if (this._gm().bagFreeGrids() > 0) { this._gm().changeItem({ [id]: qty }); return true; }
        return false;
    }

    /** 点击材料：放入背包，成功后从收获列表移除（消失） */
    private take(id: string): void {
        const qty = this._loot[id];
        if (qty === undefined) return;
        if (this.tryTake(id, qty)) {
            delete this._loot[id];   // 已拾取 → 从列表消失
            this._eventBus().emit(GameEvents.UI_REFRESH);
            // 延迟到下一帧重建，避免在 touch 事件处理中销毁 ScrollView 节点导致行闪烁
            this.scheduleOnce(() => this.render(), 0);
        } else {
            Toast.instance?.show(`背包已满，无法拾取 ${ITEM_DATA[id]?.name || id}`);
        }
    }

    /** 全部拾取：按玩家逐个点击的同一逻辑自动放入；满则跳过剩余并提示 */
    private takeAll(): void {
        const skipped: string[] = [];
        for (const id of Object.keys(this._loot)) {
            const qty = this._loot[id];
            if (this.tryTake(id, qty)) delete this._loot[id];
            else skipped.push(ITEM_DATA[id]?.name || id);
        }
        if (skipped.length) {
            Toast.instance?.show(`背包已满，以下未拾取：${skipped.join('、')}`);
        }
        this._eventBus().emit(GameEvents.UI_REFRESH);
        this.scheduleOnce(() => this.render(), 0);
    }

    /** 完成：关闭弹窗；遗留未拾取项提示（留在原地） */
    private finish(): void {
        const left = Object.keys(this._loot)
            .map(id => `${ITEM_DATA[id]?.name || id}${this._loot[id] > 1 ? this._loot[id] : ''}`);
        if (left.length) Toast.instance?.show(`未拾取（已留在原地）：${left.join('、')}`);
        this._eventBus().emit(GameEvents.UI_REFRESH);
        this.hide();
    }

    /** 显示收获弹窗（标题 + 完整 loot） */
    public showHarvest(title: string, loot: Record<string, number>): void {
        this._loot = loot || {};
        this.show(title);
    }

    // 便捷取单例依赖
    private _gm(): GameManager { return GameManager.instance; }
    private _eventBus(): EventBus { return EventBus.instance; }
}
