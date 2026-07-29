/**
 * BagPage.ts - 背包/装备域页面模块
 *
 * 从 MainScene 抽离：背包格子构建、背包弹窗打开、物品操作（使用/装备/卸下/丢弃）、
 * 装备栏格子构建与点击、装备栏面板打开。
 * 入口 openBagPanel / openEquipPanel 被 MainScene（onHomeCellClick / onBottomAction）委托调用。
 *
 * ITEM_TYPE_LABEL / STATE_LABEL 原为主场景模块级常量（仅物品详情展示用），随 onItemClick 一并迁至此。
 */

import { Node } from 'cc';
import { BasePage } from './BasePage';
import { GridPage, GridCellData } from '../../data/types';
import { ActionItem } from '../../actions/ActionItem';
import { ITEM_DATA, EQUIP_TYPE_DATA, BIG_BOX_BASE_SIZE, BAG_BASE_SIZE } from '../../data/data';
import { GameEvents } from '../../core/EventBus';
import { DialogOption } from '../DialogPanel';
import { QuantityPanel } from '../QuantityPanel';

/** 物品类型 → 中文显示名（物品详情弹窗中"类型"字段） */
const ITEM_TYPE_LABEL: Record<string, string> = {
    tool: '工具',
    food: '食物',
    cooked: '熟食',
    met: '材料',
    mat: '材料',
    material: '材料',
    quest: '任务道具',
    bullet: '弹药',
    equip: '装备',
    weapon: '武器',
    head: '头部装备',
    body: '身体装备',
    foot: '足部装备',
    poizon: '毒药',
    securityBox: '保险箱',
    makeSpeed: '制造加速',
    collectDec: '采集减耗',
    trapGet: '陷阱收获',
    trapChance: '陷阱几率',
    lockUpdate: '开锁升级',
    cookerUpdate: '烹饪升级',
    unknownBonus: '未知加成',
    durableUpdate: '耐久升级',
    magicDurableUpdate: '魔法耐久',
    bagSizeBonus: '背包扩容',
    trapSizeBonus: '陷阱扩容',
    farmSizeBonus: '农田扩容',
    alcoSizeBonus: '酿酒扩容',
    bigBoxSizeBonus: '大箱扩容',
    mapBonus: '地图加成',
    beaconMax: '信标上限',
    wellBonus: '水井加成',
    showerPlace: '淋浴场所',
    sleepPlace: '睡眠场所',
    art: '艺术品',
    special: '特殊',
};

/** 状态键 → 中文显示名（物品"效果"字段，如 full/moist/san/temp/hp） */
const STATE_LABEL: Record<string, string> = {
    hp: '生命',
    full: '饱腹',
    moist: '水分',
    san: '精神',
    temp: '体温',
    mp: '魔力',
    str: '力量',
    def: '防御',
    agi: '敏捷',
    luck: '幸运',
};

export class BagPage extends BasePage {
    /** 构建指定箱子格子列表（bag=背包 / bigBox=大箱子；供 push 与 rebuild 共用） */
    private buildBoxCells(boxType: 'bag' | 'bigBox' = 'bag'): GridCellData[] {
        const box = this.gm.boxSaveData[boxType] || {};
        const equippedIds = boxType === 'bag'
            ? new Set(Object.values(this.gm.currentEquip).filter(Boolean) as string[])
            : new Set<string>();
        const cells: GridCellData[] = Object.keys(box).map(itemId => {
            const baseName = ITEM_DATA[itemId]?.name || itemId;
            const isEquipped = equippedIds.has(itemId);
            const item = ITEM_DATA[itemId];
            // 工具/武器类展示耐久度条（未初始化视为满耐久）
            let durability: { cur: number; max: number } | undefined;
            if (item && item.durable !== undefined) {
                durability = { cur: this.gm.durableSaveData[itemId] || item.durable, max: item.durable };
            }
            return {
                id: itemId,
                name: isEquipped ? `${baseName}\n[已装备]` : baseName,
                count: box[itemId],
                state: 'normal' as const,
                data: itemId,
                durability,
            };
        });
        // 空箱子/背包不渲染占位 cell，内容区自然留白
        return cells;
    }

    /**
     * 打开背包弹窗（模态，独立于导航栈，不污染面包屑「主页 > xxx」）
     * 标题与格子用回调传入，装备/使用/丢弃后 refresh() 原地重建。
     */
    public openBagPanel(): void {
        this.setMsg('');
        this.bagPanel.show(
            () => `背包 (${Object.keys(this.gm.boxSaveData['bag'] || {}).length}/${this.gm.boxSize['bag'] || BAG_BASE_SIZE})`,
            () => this.buildBoxCells('bag'),
            (id) => this.onItemClick(id, 'bag'),
        );
    }

    /** 物品点击 → DialogPanel 弹出操作选项（boxType 决定在背包还是大箱子中操作） */
    private onItemClick(itemId: string, boxType: 'bag' | 'bigBox' = 'bag'): void {
        const itemData = ITEM_DATA[itemId];
        if (!itemData) return;

        const type = (itemData as any).type as string;
        const upgrade = (itemData as any).upgrade as string | undefined;
        const canUse = !!(itemData as any).effect || type === 'food' || type === 'cooked'
            || type === 'bigBoxSizeBonus' || type === 'bagSizeBonus'
            || !!upgrade;   // 指南类/精华类技能升级道具
        const canEquip = !!(itemData as any).equipType || type === 'equip' || type === 'weapon'
            || type === 'head' || type === 'body' || type === 'foot' || type === 'neck';
        const isEquipped = Object.values(this.gm.currentEquip).includes(itemId);
        const count = this.gm.boxSaveData[boxType]?.[itemId] || 0;

        // 构建物品信息文本
        const infoLines: string[] = [itemData.name];
        if (itemData.desc) infoLines.push(itemData.desc);
        infoLines.push(`类型: ${ITEM_TYPE_LABEL[type] || type || '未知'}`);
        if (itemData.attack) infoLines.push(`攻击: ${itemData.attack}`);
        if (itemData.def) infoLines.push(`防御: ${itemData.def}`);
        if (itemData.heal) infoLines.push(`回复HP: ${itemData.heal}`);
        if ((itemData as any).effect) {
            const eff = (itemData as any).effect as Record<string, number>;
            for (const k in eff) {
                const sign = eff[k] > 0 ? '+' : '';
                infoLines.push(`效果·${STATE_LABEL[k] || k}: ${sign}${eff[k]}`);
            }
        }

        // 操作选项
        const options: DialogOption[] = [];
        // 信息行（disabled 展示）
        for (const line of infoLines) {
            options.push({ label: line, data: null, disabled: true });
        }

        if (isEquipped) {
            // 已装备：仅提供状态标识与卸下，避免同类型重复装备
            options.push({ label: '状态：已装备', data: null, disabled: true });
            options.push({ label: '卸下', data: { action: 'unequip' } });
        } else {
            if (canUse) options.push({ label: '使用', data: { action: 'use' } });
            if (canEquip) options.push({ label: '装备', data: { action: 'equip' } });
            // 存入大箱子：仅在家、且当前位于背包（bigBox 走 BigBoxPage 独立路径「取出」）
            if (!this.ctx.outdoorPage?.isOutdoors && boxType === 'bag') {
                options.push({ label: '存入大箱子', data: { action: 'store', boxType } });
            }
            options.push({ label: '丢弃', data: { action: 'drop' } });
        }

        this.dialogPanel?.show(
            `${itemData.name} ×${count}`,
            options,
            (data) => {
                if (!data) return;
                // 存入大箱子 / 取出到背包：先选数量，避免一次只转 1 个
                if (data.action === 'store') {
                    this.openQuantity(itemId, 'bag', 'bigBox', `存入【${itemData.name}】到大箱子`);
                } else if (data.action === 'takeOut') {
                    this.openQuantity(itemId, 'bigBox', 'bag', `取出【${itemData.name}】到背包`);
                } else {
                    this.onItemAction(data.action, itemId, boxType);
                }
            },
            () => {}
        );
    }

    /** 数量选择后转移（store/takeOut 共用）：弹出 QuantityPanel 让用户选 N 个 */
    private openQuantity(itemId: string, from: 'bag' | 'bigBox', to: 'bag' | 'bigBox', title: string): void {
        const have = this.gm.boxSaveData[from]?.[itemId] || 0;
        if (have < 1) { this.setMsg('没有该物品'); return; }

        // 大箱子容量限制：仅当目标为新种类（大箱子尚无该物品）时受限
        let capLimit = have;
        if (to === 'bigBox') {
            const bigBox = this.gm.boxSaveData['bigBox'] || {};
            if (!bigBox[itemId]) {
                const cap = this.gm.boxSize['bigBox'] || BIG_BOX_BASE_SIZE;
                const used = Object.keys(bigBox).length;
                capLimit = Math.min(have, Math.max(0, cap - used));
            }
        }
        if (capLimit < 1) { this.setMsg('大箱子已满，请先扩容'); return; }

        const panel = this.ensureQtyPanel();
        panel.show(title, capLimit, (qty) => {
            const r = this.transfer(itemId, from, to, qty);
            this.setMsg(r.message);
            // 操作完成后：弹窗原地刷新（数量/空态），并广播 UI_REFRESH
            this.bagPanel?.refresh();
            this.eventBus.emit(GameEvents.UI_REFRESH);
        });
    }

    /** 懒创建数量选择弹窗（挂在 modalLayer，盖住底栏） */
    private ensureQtyPanel(): QuantityPanel {
        if (!this._qtyPanel) {
            const node = new Node('QuantityPanel');
            this.ctx.modalLayer!.addChild(node);
            this._qtyPanel = node.addComponent(QuantityPanel);
        }
        return this._qtyPanel;
    }
    private _qtyPanel: QuantityPanel | null = null;

    /** 物品具体操作执行（弹窗内回调，执行后刷新当前页面） */
    private onItemAction(action: string | null | undefined, itemId: string, boxType: 'bag' | 'bigBox' = 'bag'): void {
        switch (action) {
            case 'use': {
                const r = ActionItem.instance.use(itemId);
                this.setMsg(r.message);
                break;
            }
            case 'equip': {
                const r = ActionItem.instance.equip(itemId);
                this.setMsg(r.message);
                break;
            }
            case 'unequip': {
                // 反查该物品所在槽位后卸下
                let slot: string | null = null;
                for (const k in this.gm.currentEquip) {
                    if (this.gm.currentEquip[k] === itemId) { slot = k; break; }
                }
                if (slot) {
                    const r = ActionItem.instance.unequip(slot);
                    this.setMsg(r.message);
                }
                break;
            }
            case 'drop': {
                const r = ActionItem.instance.drop(itemId);
                this.setMsg(r.message);
                break;
            }
        }
        // 操作完成后：弹窗原地刷新（数量/空态/[已装备]标记），并广播 UI_REFRESH
        this.bagPanel?.refresh();
        this.eventBus.emit(GameEvents.UI_REFRESH);
    }

    /** 在背包与大箱子之间转移物品（受大箱子容量限制，支持批量 qty） */
    private transfer(itemId: string, from: 'bag' | 'bigBox', to: 'bag' | 'bigBox', qty = 1): { success: boolean; message: string } {
        const src = this.gm.boxSaveData[from] || {};
        const have = src[itemId] || 0;
        if (have < qty) return { success: false, message: '数量不足' };
        if (to === 'bigBox') {
            // 仅当大箱子尚无该物品（新种类）时受容量限制；已有则只累加数量
            if (!(this.gm.boxSaveData['bigBox'] || {})[itemId]) {
                const cap = this.gm.boxSize['bigBox'] || BIG_BOX_BASE_SIZE;
                const used = Object.keys(this.gm.boxSaveData['bigBox'] || {}).length;
                if (used >= cap) return { success: false, message: '大箱子已满，请先扩容' };
            }
        }
        this.gm.changeItem({ [itemId]: -qty }, from);
        this.gm.changeItem({ [itemId]: qty }, to);
        this.eventBus.emit(GameEvents.UI_REFRESH);
        return { success: true, message: `已转移 ${qty} 个` };
    }

    // ===== 装备栏 =====
    /** 构建装备栏格子（各槽位当前装备 + 耐久） */
    private buildEquipCells(): GridCellData[] {
        const slots = ['body', 'hand', 'foot', 'head', 'neck'] as const;

        // 武器攻击汇总（含轮回加成）
        const handId = this.gm.currentEquip['hand'];
        let atkInfo = '徒手（攻击 5）';
        if (handId) {
            const w = ITEM_DATA[handId];
            const base = (w?.damage ?? w?.attack ?? 0) + (w?.reiToDmg ? w.reiToDmg * this.gm.maouLevel : 0);
            atkInfo = `武器攻击：${base}`;
        }

        const cells: GridCellData[] = [
            { id: 'summary', name: atkInfo, state: 'disabled', type: 'list', noTruncate: true },
        ];

        for (const slot of slots) {
            const itemId = this.gm.currentEquip[slot];
            const item = itemId ? ITEM_DATA[itemId] : null;
            const maxDur = item?.durable;
            const dur = itemId ? (this.gm.durableSaveData[itemId] ?? maxDur) : undefined;
            const durStr = (item && maxDur !== undefined) ? ` [耐久 ${dur}/${maxDur}]` : '';
            const name = item ? item.name : '（空）';
            cells.push({
                id: `equip_${slot}`,
                name: `${EQUIP_TYPE_DATA[slot]}：${name}${durStr}`,
                state: item ? 'normal' : 'disabled',
                type: 'list', noTruncate: true,
                data: slot,
            });
        }

        return cells;
    }

    /** 装备栏格子点击：已装备的槽位弹窗可卸下 */
    private onEquipCellClick(cell: GridCellData): void {
        if (!cell.id.startsWith('equip_')) return;
        const slot = cell.data as string;
        const itemId = this.gm.currentEquip[slot];
        if (!itemId) return;
        const item = ITEM_DATA[itemId];

        const options: DialogOption[] = [
            { label: item?.name || '', data: null, disabled: true },
        ];
        if (item?.desc) options.push({ label: item.desc, data: null, disabled: true });
        options.push({ label: '卸下', data: { action: 'unequip', slot } });
        options.push({ label: '返回', data: null });

        this.dialogPanel?.show(
            item?.name || '装备',
            options,
            (data) => {
                if (data && data.action === 'unequip') {
                    const r = ActionItem.instance.unequip(slot);
                    this.setMsg(r.message);
                    this.navigator.replace({
                        title: '装备',
                        breadcrumb: '装备',
                        columns: 1,
                        cells: this.buildEquipCells(),
                        onCellClick: (index, c) => this.onEquipCellClick(c),
                    });
                }
            },
            () => {}
        );
    }

    /** 打开装备栏 */
    public openEquipPanel(): void {
        this.setMsg('');
        this.navigator.push({
            title: '装备',
            breadcrumb: '装备',
            columns: 1,
            cells: this.buildEquipCells(),
            onCellClick: (index, cell) => this.onEquipCellClick(cell),
        });
    }
}
