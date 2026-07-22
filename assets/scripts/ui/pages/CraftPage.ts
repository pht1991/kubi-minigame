/**
 * CraftPage.ts - 制造域页面模块
 *
 * 从 MainScene 抽离：制造系统（多工作台配方制造）。
 * 入口方法 openCraftGrid 被 MainScene 的 onHomeCellClick / facilityRoutes 委托调用。
 */

import { BasePage } from './BasePage';
import { GridPage, GridCellData } from '../../data/types';
import { ActionCraft } from '../../actions/ActionCraft';
import { GameEvents } from '../../core/EventBus';
import {
    ITEM_DATA,
    BUILDING_DATA,
    MAKE_DATA,
    ALCHEMY_DATA,
    MAGIC_DATA,
    SCIENCE_DATA,
    ALCO_DATA,
} from '../../data/data';
import { QuantityPanel } from '../QuantityPanel';

export class CraftPage extends BasePage {
    /** 制造工作台列表页 cells */
    private buildCraftCells(): GridCellData[] {
        const cells: GridCellData[] = [];
        const workbenches = ['makeTable', 'alchemyTable', 'magicTable', 'scienceTable'];
        for (const wb of workbenches) {
            const built = this.gm.buildingSaveData[wb];
            cells.push({
                id: wb,
                name: BUILDING_DATA[wb]?.name || wb,
                state: built ? 'normal' : 'disabled',
                data: wb,
            });
        }
        return cells;
    }

    /** 公开入口：打开制造（指定工作台且已建设则直达配方弹窗） */
    public openCraftGrid(workbench?: string): void {
        // 如果指定了工作台且已建设 → 跳过列表页，直接打开配方弹窗
        if (workbench && this.gm.buildingSaveData[workbench]) {
            this.openRecipeGrid(workbench);
            return;
        }

        this.setMsg(''); // 进入制造时清空旧反馈，防止跨系统串显
        this.navigator.push({
            title: '制造',
            breadcrumb: '制造',
            columns: 4,
            cells: this.buildCraftCells(),
            rebuild: () => this.buildCraftCells(),
            onCellClick: (index, cell) => this.openRecipeGrid(cell.id),
        });
    }

    /** 获取工作台对应的配方表 */
    public getRecipeData(workbench: string): Record<string, any> {
        switch (workbench) {
            case 'makeTable': return MAKE_DATA;
            case 'alchemyTable': return ALCHEMY_DATA;
            case 'magicTable': return MAGIC_DATA;
            case 'scienceTable': return SCIENCE_DATA;
            case 'alco': return ALCO_DATA;
            default: return {};
        }
    }

    /** 配方列表页：替代原 DialogPanel 弹窗，对齐建造页面 list 范式（单列满宽、每格展示名称+需求） */
    private openRecipeGrid(workbench: string): void {
        this.navigator.push(this.buildRecipePage(workbench));
    }

    /** 构建配方列表导航页（push / rebuild / replace 共用） */
    private buildRecipePage(workbench: string): GridPage {
        const wbName = BUILDING_DATA[workbench]?.name || '制造';
        return {
            title: wbName,
            breadcrumb: wbName,
            columns: 1,           // 单列：每行一个配方，横向撑满展示完整信息（同建造列表）
            cells: this.buildRecipeCells(workbench),
            rebuild: () => this.buildRecipeCells(workbench),
            onCellClick: (index, cell) => this.onRecipeClick(workbench, cell.id),
        };
    }

    /** 配方是否解锁：满足 科技/事件/建筑 前置门槛（原版制造台逐级开放逻辑） */
    private isRecipeUnlocked(recipe: any): boolean {
        if (recipe.science && this.gm.getScienceLevel(recipe.science) <= 0) return false;
        if (recipe.event && !this.gm.eventSaveData[recipe.event]?.experienced) return false;
        if (recipe.building && !this.gm.buildingSaveData[recipe.building]) return false;
        return true;
    }

    /** 配方格子（仅列出已解锁配方；名称 + 需求摘要；材料不足置灰） */
    private buildRecipeCells(workbench: string): GridCellData[] {
        const recipeData = this.getRecipeData(workbench);
        const cells: GridCellData[] = [];
        for (const key of Object.keys(recipeData)) {
            const recipe = recipeData[key];
            // 原版：前置 科技/事件/建筑 未达成 → 不展示，随进度逐步开放
            if (!this.isRecipeUnlocked(recipe)) continue;
            const canMake = this.gm.checkHaveResource(recipe.require || {});
            const reqStr = recipe.require && Object.keys(recipe.require).length > 0
                ? Object.entries(recipe.require).map(([k, v]) => `${ITEM_DATA[k]?.name || k}×${v}`).join(' ')
                : '无';
            cells.push({
                id: key,
                name: `${ITEM_DATA[key]?.name || key}\n需求: ${reqStr}`,
                state: canMake ? 'normal' : 'disabled',
                type: 'list',
                data: key,
            });
        }
        return cells;
    }

    /** 配方点击 → 校验材料 → QuantityPanel 选数量（受材料上限约束）→ 制造 */
    private onRecipeClick(workbench: string, recipeId: string): void {
        const recipeData = this.getRecipeData(workbench);
        const recipe = recipeData[recipeId];
        if (!recipe) return;
        if (!this.gm.checkHaveResource(recipe.require || {})) { this.setMsg('材料不足'); return; }

        // 按材料计算可制造的最大次数
        let max = Infinity;
        const bag = this.gm.boxSaveData['bag'] || {};
        for (const k in (recipe.require || {})) {
            max = Math.min(max, Math.floor((bag[k] || 0) / recipe.require[k]));
        }
        if (!isFinite(max) || max < 1) { this.setMsg('材料不足'); return; }

        const itemName = ITEM_DATA[recipeId]?.name || recipeId;
        this.ensureQtyPanel().show(
            `制造【${itemName}】`,
            max,
            (qty) => {
                const r = ActionCraft.instance.make(recipeId, recipeData, qty);
                if (!r.success) this.setMsg(r.message);
                // 成功：进度条播放中，完成后由 OPERATION_DONE 弹反馈；列表由 rebuild(UI_REFRESH) 刷新
                this.eventBus.emit(GameEvents.UI_REFRESH); // 失败/即时动作立即刷新；成功也会在进度结束后再刷一次
            },
            {
                confirmLabel: '制造',
                getPreview: (qty) => {
                    const lines: string[] = [];
                    for (const k in (recipe.require || {})) {
                        lines.push(`消耗 ${ITEM_DATA[k]?.name || k} ×${recipe.require[k] * qty}`);
                    }
                    return lines;
                },
            }
        );
    }

    /** 懒创建数量选择弹窗（挂在 modalLayer，盖住底栏；与 BigBoxPage 同一范式） */
    private ensureQtyPanel(): QuantityPanel {
        if (!this._qtyPanel) {
            const node = new Node('CraftQtyPanel');
            this.ctx.modalLayer!.addChild(node);
            this._qtyPanel = node.addComponent(QuantityPanel);
        }
        return this._qtyPanel;
    }
    private _qtyPanel: QuantityPanel | null = null;
}
