/**
 * CraftPage.ts - 制造域页面模块
 *
 * 从 MainScene 抽离：制造系统（多工作台配方制造）。
 * 入口方法 openCraftGrid 被 MainScene 的 onHomeCellClick / facilityRoutes 委托调用。
 */

import { BasePage } from './BasePage';
import { GridPage, GridCellData } from '../../data/types';
import { DialogOption } from '../DialogPanel';
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

    /** 配方弹窗 */
    private openRecipeGrid(workbench: string): void {
        const recipeData = this.getRecipeData(workbench);

        const options: DialogOption[] = Object.keys(recipeData).map(key => {
            const recipe = recipeData[key];
            const canMake = this.gm.checkHaveResource(recipe.require || {});
            const reqStr = recipe.require && Object.keys(recipe.require).length > 0
                ? Object.entries(recipe.require).map(([k, v]) => `${ITEM_DATA[k]?.name || k}×${v}`).join(' ')
                : '无';
            return {
                label: `${ITEM_DATA[key]?.name || key}  [需求: ${reqStr}]`,
                data: { workbench, recipeId: key, recipe },
                disabled: !canMake,
            };
        });

        this.dialogPanel.show(
            BUILDING_DATA[workbench]?.name || '制造',
            options,
            (data) => {
                // 先选数量，再制造
                const countOptions: DialogOption[] = [
                    { label: '制造 ×1', data: { ...data, count: 1 } },
                    { label: '制造 ×5', data: { ...data, count: 5 } },
                    { label: '制造 ×10', data: { ...data, count: 10 } },
                    { label: '制造 ×20', data: { ...data, count: 20 } },
                ];
                this.dialogPanel.show(
                    '选择数量',
                    countOptions,
                    (cd) => {
                        const r = ActionCraft.instance.make(cd.recipeId, recipeData, cd.count);
                        this.setMsg(r.message);
                        this.eventBus.emit(GameEvents.UI_REFRESH);
                    },
                    () => {}
                );
            },
            () => {}
        );
    }

    /** 配方详情网格（需求/产出/耗时 + 制造按钮） */
    private openRecipeDetail(workbench: string, recipeId: string): void {
        const recipeData = this.getRecipeData(workbench);
        const recipe = recipeData[recipeId];
        if (!recipe) return;

        const requireStr = recipe.require && Object.keys(recipe.require).length > 0
            ? Object.entries(recipe.require).map(([k, v]) => `${ITEM_DATA[k]?.name || k}×${v}`).join(' ')
            : '无';
        const canMake = this.gm.checkHaveResource(recipe.require || {});

        const cells: GridCellData[] = [
            { id: 'req', name: `需求: ${requireStr}`, state: 'disabled' },
            { id: 'get', name: `产出: ${ITEM_DATA[recipe.get]?.name || recipe.get}×${recipe.amount || 1}`, state: 'disabled' },
            { id: 'time', name: `耗时: ${recipe.timeNeed} 小时`, state: 'disabled' },
            { id: 'make', name: '制造', state: canMake ? 'normal' : 'disabled' },
        ];

        this.navigator.push({
            title: ITEM_DATA[recipeId]?.name || recipeId,
            breadcrumb: ITEM_DATA[recipeId]?.name || recipeId,
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                if (cell.id === 'make') {
                    const r = ActionCraft.instance.make(recipeId, recipeData);
                    this.setMsg(r.message);
                    this.navigator.pop(); // 返回配方列表（材料变化会刷新）
                }
            },
        });
    }
}
