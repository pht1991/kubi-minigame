/**
 * CookPage.ts - 烹饪系统页面模块
 *
 * 从 MainScene 抽离的烹饪业务域（炊具管理 + 配方匹配 + 菜谱书）。
 * 原 MainScene 的 openCookPanel / buildCookHubPage / openCookAdd / openCookStep1 /
 * openCookStep2 / showCookResult / openRecipeBook / formatEffect 全部迁移至此。
 *
 * 调用方（MainScene）只需：this._cookPage.openCookPanel()
 */

import { BasePage } from './BasePage';
import { GridPage, GridCellData } from '../../data/types';
import { ITEM_DATA, COOK_DATA } from '../../data/data';
import { GameEvents } from '../../core/EventBus';
import { ActionCook } from '../../actions/ActionCook';

export class CookPage extends BasePage {
    /** 烹饪第二步选中的第一种食材（烹饪流程内部状态） */
    private _cookIngredient1: string | null = null;

    /** 打开烹饪主页（重置第一步选择） */
    openCookPanel(): void {
        this._cookIngredient1 = null;
        this.navigator.push(this.buildCookHubPage());
    }

    /** 烹饪主页（炊具箱管理 + 开始烹饪） */
    private buildCookHubPage(): GridPage {
        const cooker = this.gm.boxSaveData['cooker'] || {};
        const cookerItems = Object.keys(cooker).filter(k => (cooker[k] || 0) > 0);
        const cells: GridCellData[] = [];

        cells.push({ id: 'add', name: '添加食材', state: 'normal' });
        cells.push({ id: 'cook', name: '开始烹饪', state: cookerItems.length >= 1 ? 'normal' : 'disabled' });
        cells.push({ id: 'book', name: '📖 菜谱书', state: 'normal' });
        if (cookerItems.length > 0) {
            cells.push({ id: 'clear', name: '清空炊具', state: 'normal' });
            cells.push({ id: 'label', name: '── 炊具内 ──', state: 'disabled' });
            for (const itemId of cookerItems) {
                const d = ITEM_DATA[itemId];
                cells.push({ id: `c_${itemId}`, name: `${d?.name || itemId} ×${cooker[itemId]}`, state: 'disabled' });
            }
        } else {
            cells.push({ id: 'empty', name: '炊具空空如也，先添加食材', state: 'disabled' });
        }

        return {
            title: '烹饪（炊具）',
            breadcrumb: '烹饪',
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                if (cell.id === 'add') {
                    this.openCookAdd();
                } else if (cell.id === 'cook') {
                    // 炊具内仅 1 种食材（如尸体/龙鳞）→ 直接匹配单食材配方
                    if (cookerItems.length === 1) {
                        this.showCookResult([cookerItems[0]]);
                    } else {
                        this.openCookStep1();
                    }
                } else if (cell.id === 'book') {
                    this.openRecipeBook();
                } else if (cell.id === 'clear') {
                    for (const itemId of cookerItems) {
                        this.gm.changeItem({ [itemId]: cooker[itemId] }, 'bag');
                    }
                    this.setMsg('已清空炊具，食材退回背包');
                    this.navigator.replace(this.buildCookHubPage());
                }
            },
        };
    }

    /** 从背包挑选食材放入炊具 */
    private openCookAdd(): void {
        const bag = this.gm.boxSaveData['bag'] || {};
        const cells: GridCellData[] = [];
        for (const itemId in bag) {
            if (!bag[itemId]) continue;
            const d = ITEM_DATA[itemId];
            if (!d) continue;
            const isIngredient = d.type === 'food' || d.type === 'cooked' || d.type === 'mat' || d.type === 'material';
            if (isIngredient) {
                cells.push({ id: itemId, name: `${d.name} ×${bag[itemId]}`, state: 'normal', data: itemId });
            }
        }
        if (cells.length === 0) cells.push({ id: 'empty', name: '背包没有可用食材', state: 'disabled' });

        this.navigator.push({
            title: '添加食材到炊具',
            breadcrumb: '添加食材',
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                if (cell.id !== 'empty') {
                    this.gm.changeItem({ [cell.id]: 1 }, 'cooker');
                    this.gm.changeItem({ [cell.id]: -1 }, 'bag');
                    this.eventBus.emit(GameEvents.ITEM_CHANGE, 'cooker');
                    this.eventBus.emit(GameEvents.UI_REFRESH);
                    this.navigator.replace(this.buildCookHubPage());
                }
            },
        });
    }

    /** 第一步：从炊具箱选第一个食材 */
    private openCookStep1(): void {
        const cooker = this.gm.boxSaveData['cooker'] || {};
        const cells: GridCellData[] = [];
        for (const itemId in cooker) {
            if (!cooker[itemId]) continue;
            const d = ITEM_DATA[itemId];
            if (!d) continue;
            cells.push({
                id: itemId,
                name: `${d.name} ×${cooker[itemId]}`,
                state: 'normal',
                data: itemId,
            });
        }
        if (cells.length === 0) {
            cells.push({ id: 'empty', name: '炊具中没有食材', state: 'disabled' });
        }

        this.navigator.push({
            title: '烹饪 · 选择第一种食材',
            breadcrumb: '烹饪1',
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                if (cell.id !== 'empty') {
                    this._cookIngredient1 = cell.id;
                    this.openCookStep2();
                }
            },
        });
    }

    /** 第二步：从炊具箱选第二个食材（与第一个不同） */
    private openCookStep2(): void {
        const cooker = this.gm.boxSaveData['cooker'] || {};
        const cells: GridCellData[] = [];
        for (const itemId in cooker) {
            if (!cooker[itemId] || itemId === this._cookIngredient1) continue;
            const d = ITEM_DATA[itemId];
            if (!d) continue;
            cells.push({
                id: itemId,
                name: `${d.name} ×${cooker[itemId]}`,
                state: 'normal',
                data: itemId,
            });
        }
        if (cells.length === 0) {
            cells.push({ id: 'none', name: '没有其他食材', state: 'disabled' });
        }

        const name1 = ITEM_DATA[this._cookIngredient1!]?.name || this._cookIngredient1;

        this.navigator.push({
            title: `烹饪 · ${name1} + ?`,
            breadcrumb: '烹饪2',
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                if (cell.id !== 'none') {
                    this.showCookResult([this._cookIngredient1!, cell.id]);
                }
            },
        });
    }

    /** 第三步：显示匹配的配方（支持任意食材数量，含单食材配方） */
    private showCookResult(ings: string[]): void {
        const nameList = ings.map(id => ITEM_DATA[id]?.name || id);
        const cells: GridCellData[] = [];

        // 查找匹配的配方（食材集合完全一致，顺序无关，长度也一致）
        const ingredients = [...ings].sort();
        const matched: typeof COOK_DATA = [];
        for (const recipe of COOK_DATA) {
            const req = [...recipe.require].sort();
            if (req.length === ingredients.length && req.every((r, i) => r === ingredients[i])) {
                matched.push(recipe);
            }
        }

        if (matched.length === 0) {
            cells.push({ id: 'no_match', name: `${nameList.join(' + ')} 没有匹配的配方`, state: 'disabled' });
        } else {
            for (const recipe of matched) {
                const outName = ITEM_DATA[recipe.name]?.name || recipe.name;
                const requireDict: Record<string, number> = {};
                for (const r of recipe.require) requireDict[r] = (requireDict[r] || 0) + 1;
                const canCook = this.gm.checkHaveResource(requireDict, 'cooker');
                cells.push({
                    id: `cook_${recipe.name}`,
                    name: `${outName}`,
                    state: canCook ? 'normal' : 'disabled',
                    data: recipe,
                });
            }
        }

        this.navigator.push({
            title: nameList.join(' + '),
            breadcrumb: '结果',
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                if (cell.data) {
                    const recipe = cell.data as { name: string; require: string[] };
                    const r = ActionCook.instance.cook(recipe, 1);
                    this.setMsg(r.message);
                    // 返回炊具主页（食材已扣，可继续烹饪）
                    this.navigator.replace(this.buildCookHubPage());
                }
            },
        });
    }

    /** 配方书：列出全部可烹饪料理（菜名+食用效果+所有配方变体），数据来自 COOK_DATA + ITEM_DATA */
    private openRecipeBook(): void {
        // 按料理名聚合：效果 + 所有配方变体
        const byName: Record<string, { key: string; effect: Record<string, number> | null; variants: string[] }> = {};
        for (const recipe of COOK_DATA) {
            const key = recipe.name;
            if (!byName[key]) {
                byName[key] = {
                    key,
                    effect: (ITEM_DATA[key] && (ITEM_DATA[key] as any).effect) || null,
                    variants: [],
                };
            }
            byName[key].variants.push(recipe.require.map(id => ITEM_DATA[id]?.name || id).join(' + '));
        }

        const cells: GridCellData[] = [];
        for (const key of Object.keys(byName)) {
            const info = byName[key];
            const outName = ITEM_DATA[key]?.name || key;
            const effStr = info.effect ? this.formatEffect(info.effect) : '（无食用效果）';
            const recipeStr = info.variants.join('  /  ');
            const text = `${outName}\n效果: ${effStr}\n配方: ${recipeStr}`;
            cells.push({ id: `rb_${key}`, name: text, state: 'disabled', type: 'list' });
        }

        this.navigator.push({
            title: '📖 菜谱书',
            breadcrumb: '菜谱书',
            columns: 1,
            cells,
            onCellClick: () => {},
        });
    }

    /** 把 effect 对象格式化为中文串，如 {full:15, san:25} → "满腹+15 精神+25" */
    private formatEffect(effect: Record<string, number>): string {
        const cn: Record<string, string> = { full: '满腹', moist: '水分', temp: '体温', san: '精神', hp: '生命', ps: '体力' };
        const parts: string[] = [];
        for (const k of ['full', 'moist', 'temp', 'san', 'hp', 'ps']) {
            if (effect[k] !== undefined) {
                const v = effect[k];
                parts.push(`${cn[k]}${v > 0 ? '+' : ''}${v}`);
            }
        }
        return parts.join(' ') || '—';
    }
}
