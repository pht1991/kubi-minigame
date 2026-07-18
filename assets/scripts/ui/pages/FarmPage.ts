/**
 * FarmPage.ts - 农田管理域页面模块
 *
 * 从 MainScene 抽离：农田种植/收获。
 * 入口 openFarmPanel 被 MainScene（建筑详情/主页设施）委托调用。
 */

import { BasePage } from './BasePage';
import { GridPage, GridCellData } from '../../data/types';
import { ActionBuilding } from '../../actions/ActionBuilding';
import { ITEM_DATA, CROP_DATA } from '../../data/data';

export class FarmPage extends BasePage {
    /** 公开入口：打开农田管理面板 */
    public openFarmPanel(): void {
        this.setMsg('');
        this.navigator.push(this.buildFarmPage());
    }

    private buildFarmPage(): GridPage {
        const farmData = this.gm.buildingSaveData['farm'];
        const slots = ActionBuilding.instance.getFarmSlots();
        const cells: GridCellData[] = [];

        // 已种植的作物（可收获/查看进度）
        cells.push({ id: 'slot_label', name: `── 已种植 (${slots.length}/${farmData?.size || 2}) ──`, state: 'disabled' });
        for (let i = 0; i < slots.length; i++) {
            const s = slots[i];
            if (s.ready) {
                cells.push({ id: `harvest_${i}`, name: `${s.cropDesc} [可收获]`, state: 'normal' });
            } else {
                const pct = Math.floor(s.progress * 100);
                cells.push({ id: `slot_${i}`, name: `${s.cropDesc} 生长${pct}% (${Math.ceil(s.remaining)}h)`, state: 'disabled' });
            }
        }

        // 可种植的作物列表
        if (slots.length < (farmData?.size || 2)) {
            cells.push({ id: 'plant_label', name: '── 可种植 ──', state: 'disabled' });
            for (const cropId in CROP_DATA) {
                const crop = CROP_DATA[cropId];
                const canPlant = this.gm.checkHaveResource(crop.require);
                const reqStr = Object.entries(crop.require)
                    .map(([k, v]) => `${ITEM_DATA[k]?.name || k}×${v}`).join(' ');
                cells.push({
                    id: `plant_${cropId}`,
                    name: `${crop.desc} [${reqStr}]`,
                    state: canPlant ? 'normal' : 'disabled',
                });
            }
        }

        return {
            title: '农田管理',
            breadcrumb: '农田',
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                if (cell.id.startsWith('harvest_')) {
                    const slotIdx = parseInt(cell.id.replace('harvest_', ''));
                    const r = ActionBuilding.instance.harvestCrop(slotIdx);
                    this.setMsg(r.message);
                    this.navigator.replace(this.buildFarmPage());
                } else if (cell.id.startsWith('plant_')) {
                    const cropId = cell.id.replace('plant_', '');
                    const r = ActionBuilding.instance.plantCrop(cropId);
                    this.setMsg(r.message);
                    this.navigator.replace(this.buildFarmPage());
                }
            },
        };
    }
}
