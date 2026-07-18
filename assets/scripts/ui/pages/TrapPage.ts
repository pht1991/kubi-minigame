/**
 * TrapPage.ts - 陷阱管理域页面模块
 *
 * 从 MainScene 抽离：陷阱放置/检查/移除。
 * 入口 openTrapPanel 被 MainScene（建筑详情）委托调用。
 */

import { BasePage } from './BasePage';
import { GridPage, GridCellData } from '../../data/types';
import { ActionBuilding } from '../../actions/ActionBuilding';
import { ITEM_DATA, TRAP_DATA } from '../../data/data';

export class TrapPage extends BasePage {
    /** 公开入口：打开陷阱管理面板 */
    public openTrapPanel(): void {
        this.setMsg('');
        this.navigator.push(this.buildTrapPage());
    }

    private buildTrapPage(): GridPage {
        const trapData = this.gm.buildingSaveData['trap'];
        const slots = ActionBuilding.instance.getTrapSlots();
        const cells: GridCellData[] = [];

        // 已放置的陷阱
        cells.push({ id: 'slot_label', name: `── 已放置 (${slots.length}/${trapData?.size || 2}) ──`, state: 'disabled' });
        for (let i = 0; i < slots.length; i++) {
            const s = slots[i];
            if (s.canCheck) {
                cells.push({ id: `check_${i}`, name: `${s.trapDesc} [可检查]`, state: 'normal' });
            } else if (s.checked) {
                cells.push({ id: `remove_${i}`, name: `${s.trapDesc} [已检查·移除]`, state: 'normal' });
            } else {
                const hoursLeft = Math.max(0, 6 - s.elapsed);
                cells.push({ id: `slot_${i}`, name: `${s.trapDesc} 等待中(${Math.ceil(hoursLeft)}h)`, state: 'disabled' });
            }
        }

        // 可放置的陷阱列表
        if (slots.length < (trapData?.size || 2)) {
            cells.push({ id: 'place_label', name: '── 可放置 ──', state: 'disabled' });
            for (const trapId in TRAP_DATA) {
                const trap = TRAP_DATA[trapId];
                const canPlace = this.gm.checkHaveResource(trap.require);
                const reqStr = Object.entries(trap.require)
                    .map(([k, v]) => `${ITEM_DATA[k]?.name || k}×${v}`).join(' ');
                const getStr = Object.entries(trap.itemGet)
                    .map(([k, v]) => `${ITEM_DATA[k]?.name || k}×${v}`).join(' ');
                cells.push({
                    id: `place_${trapId}`,
                    name: `${trap.desc} 诱[${reqStr}] → ${getStr}`,
                    state: canPlace ? 'normal' : 'disabled',
                });
            }
        }

        return {
            title: '陷阱管理',
            breadcrumb: '陷阱',
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                if (cell.id.startsWith('check_')) {
                    const slotIdx = parseInt(cell.id.replace('check_', ''));
                    const r = ActionBuilding.instance.checkTrap(slotIdx);
                    this.setMsg(r.message);
                    this.navigator.replace(this.buildTrapPage());
                } else if (cell.id.startsWith('remove_')) {
                    const slotIdx = parseInt(cell.id.replace('remove_', ''));
                    const r = ActionBuilding.instance.removeTrap(slotIdx);
                    this.setMsg(r.message);
                    this.navigator.replace(this.buildTrapPage());
                } else if (cell.id.startsWith('place_')) {
                    const trapId = cell.id.replace('place_', '');
                    const r = ActionBuilding.instance.placeTrap(trapId);
                    this.setMsg(r.message);
                    this.navigator.replace(this.buildTrapPage());
                }
            },
        };
    }
}
