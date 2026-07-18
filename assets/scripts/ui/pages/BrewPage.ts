/**
 * BrewPage.ts - 酿酒管理域页面模块
 *
 * 从 MainScene 抽离：酿酒桶酿造/收获/配方选择。
 * 入口 openBrewPanel 被 MainScene（主页设施 home_alco）委托调用。
 * 注意：未建造酿酒桶时需跳回建筑详情页，经 ctx.outdoorPage 跨域导航（OutdoorPage 在批 C 创建）。
 */

import { BasePage } from './BasePage';
import { GridPage, GridCellData } from '../../data/types';
import { DialogOption } from '../DialogPanel';
import { ActionBrew } from '../../actions/ActionBrew';
import { ITEM_DATA, ALCO_DATA } from '../../data/data';

export class BrewPage extends BasePage {
    /** 公开入口：打开酿酒管理面板 */
    public openBrewPanel(): void {
        if (!ActionBrew.instance.isBuilt()) {
            this.setMsg('需要先建造【酿酒桶】');
            this.navigator.replace(this.ctx.outdoorPage?.buildBuildingDetailPage('alco'));
            return;
        }
        this.setMsg('');
        this.navigator.push(this.buildBrewPage());
    }

    private buildBrewPage(): GridPage {
        const slots = ActionBrew.instance.getBrewSlots();
        const cells: GridCellData[] = [];

        cells.push({ id: 'start', name: '开始酿造', state: 'normal' });
        cells.push({ id: 'slot_label', name: `── 酿造中 (${slots.length}/${ActionBrew.MAX_SLOTS}) ──`, state: 'disabled' });
        if (slots.length === 0) {
            cells.push({ id: 'empty', name: '暂无酿造', state: 'disabled' });
        }
        slots.forEach((s, i) => {
            if (s.ready) {
                cells.push({ id: `harvest_${i}`, name: `${s.recipeDesc} [可收获]`, state: 'normal' });
            } else {
                cells.push({ id: `slot_${i}`, name: `${s.recipeDesc} 酿造${s.progress}% (${Math.ceil(s.remaining)}h)`, state: 'disabled' });
            }
        });

        return {
            title: '酿酒管理',
            breadcrumb: '酿酒',
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                if (cell.id === 'start') {
                    this.openBrewRecipeList();
                } else if (cell.id.startsWith('harvest_')) {
                    const slotIdx = parseInt(cell.id.replace('harvest_', ''));
                    const r = ActionBrew.instance.harvestBrew(slotIdx);
                    this.setMsg(r.message);
                    this.navigator.replace(this.buildBrewPage());
                }
            },
        };
    }

    /** 选择要酿造的配方 */
    private openBrewRecipeList(): void {
        const options: DialogOption[] = Object.keys(ALCO_DATA).map(key => {
            const recipe = ALCO_DATA[key];
            const canBrew = this.gm.checkHaveResource(recipe.require || {});
            const reqStr = recipe.require && Object.keys(recipe.require).length > 0
                ? Object.entries(recipe.require).map(([k, v]) => `${ITEM_DATA[k]?.name || k}×${v}`).join(' ')
                : '无';
            const outName = ITEM_DATA[recipe.itemGet]?.name || recipe.itemGet;
            return {
                label: `${recipe.desc} ${outName} [${reqStr}]`,
                data: key,
                disabled: !canBrew,
            };
        });
        this.dialogPanel.show(
            '选择酿造配方',
            options,
            (data: string) => {
                const r = ActionBrew.instance.brew(data);
                this.setMsg(r.message);
                this.navigator.replace(this.buildBrewPage());
            },
            () => {}
        );
    }
}
