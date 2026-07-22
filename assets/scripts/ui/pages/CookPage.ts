/**
 * CookPage.ts - 烹饪系统页面模块
 *
 * 从 MainScene 抽离的烹饪业务域。
 * 交互精简（方案 B）：主页直接根据「背包」内材料列出可制作的料理及可制作份数，
 * 点击一次即制作一份（取自背包、放回背包）；制作后按背包变化刷新列表，
 * 从而支持「二次加工」菜（如 面包 → 木面包）。菜谱书保持只读、不可点。
 *
 * 调用方（MainScene）只需：this._cookPage.openCookPanel()
 */

import { BasePage } from './BasePage';
import { GridPage, GridCellData } from '../../data/types';
import { ITEM_DATA, COOK_DATA } from '../../data/data';
import { GameEvents } from '../../core/EventBus';
import { ActionCook, CookRecipe } from '../../actions/ActionCook';

export class CookPage extends BasePage {
    /** 打开烹饪主页（重置第一步选择） */
    openCookPanel(): void {
        this.navigator.push(this.buildCookHubPage());
    }

    /** 烹饪主页：根据背包材料列出可制作的料理 + 可制作数量 */
    private buildCookHubPage(): GridPage {
        const bag = this.gm.boxSaveData['bag'] || {};

        // 按料理名聚合所有配方变体
        const byName: Record<string, CookRecipe[]> = {};
        for (const r of COOK_DATA) {
            (byName[r.name] = byName[r.name] || []).push(r);
        }

        const cells: GridCellData[] = [];
        for (const name in byName) {
            // 在所有变体中，挑出背包可做的、且可制作份数最大的那个
            let bestVariant: CookRecipe | null = null;
            let bestQty = 0;
            for (const variant of byName[name]) {
                const need: Record<string, number> = {};
                for (const it of variant.require) need[it] = (need[it] || 0) + 1;
                let qty = Infinity;
                for (const k in need) qty = Math.min(qty, Math.floor((bag[k] || 0) / need[k]));
                if (qty > bestQty) {
                    bestQty = qty;
                    bestVariant = variant;
                }
            }
            if (bestVariant && bestQty > 0) {
                const outName = ITEM_DATA[name]?.name || name;
                cells.push({
                    id: `mk_${name}`,
                    name: `${outName}  可做${bestQty}`,
                    state: 'normal',
                    type: 'list',
                    data: { recipe: bestVariant },
                });
            }
        }
        if (cells.length === 0) {
            cells.push({ id: 'empty', name: '背包没有可烹饪的食材组合', state: 'disabled', type: 'list' });
        }
        cells.push({ id: 'book', name: '菜谱书', state: 'normal' });

        return {
            title: '烹饪',
            breadcrumb: '烹饪',
            columns: 1,
            cells,
            // 升级按钮走公共标题栏接口
            ...this.makeUpgradeInfo('cookerUpdate', {
                title: '炊具升级',
                effectText: '烹饪耗时 ×0.8（每级提速约20%）',
                onUpgraded: () => this.navigator.replace(this.buildCookHubPage()),
            }),
            onCellClick: (index, cell) => {
                if (cell.id === 'book') {
                    this.openRecipeBook();
                } else if (cell.data) {
                    // 直接取自背包制作一份，放回背包；随后刷新列表（支持二次加工菜）
                    const recipe = (cell.data as any).recipe as CookRecipe;
                    const r = ActionCook.instance.cook(recipe, 1, 'bag');
                    this.setMsg(r.message);
                    this.navigator.replace(this.buildCookHubPage());
                }
            },
        };
    }

    /** 配方书：列出全部可烹饪料理（菜名+食用效果+所有配方变体），数据来自 COOK_DATA + ITEM_DATA。只读，不可点。 */
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
            title: '菜谱书',
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
