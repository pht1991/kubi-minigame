/**
 * BuildPage.ts - 建造/主页域页面模块
 *
 * 从 MainScene 抽离：原版首页（动态设施 + 建造入口）buildHomePage、建造列表 openBuildList、执行建造 doBuild。
 * 入口 buildHomePage 被 MainScene（initHomeGrid / showDeathScreen / doBuild 后刷新）调用。
 * 首页格子点击经 ctx.onHomeCellClick 回调 MainScene 路由（保持原 onHomeCellClick 中央路由不变）。
 */

import { BasePage } from './BasePage';
import { GridPage, GridCellData } from '../../data/types';
import { ActionBuilding } from '../../actions/ActionBuilding';
import { BUILDING_DATA, ITEM_DATA } from '../../data/data';
import { GameEvents } from '../../core/EventBus';

export class BuildPage extends BasePage {
    /** 原版首页：动态设施区 + 建造 + 出门 + 菜单 */
    public buildHomePage(): GridPage {
        // 回主页 → 必然不在户外，重置底栏按钮为「出门」
        const op = this.ctx.outdoorPage;
        if (op) {
            op.isOutdoors = false;
            op.rolledTraders = []; // 回家清空在场商人，下次出门重新随机
        }
        this.ctx.refreshGoButton();

        const cells: GridCellData[] = [];

        // 1. 已建设施动态入口（建了什么出现什么）
        const facilityMap: Record<string, { label: string; id: string }> = {
            makeTable:  { label: '制造台', id: 'home_craft' },
            alchemyTable: { label: '炼金台', id: 'home_alchemy' },
            magicTable:  { label: '秘术台', id: 'home_magic' },
            scienceTable:{ label: '科研台', id: 'home_science' },
            cooker:     { label: '炊具箱', id: 'home_cook' },
            farm:       { label: '农田',   id: 'home_farm' },
            alco:       { label: '酿酒桶', id: 'home_alco' },
            trap:       { label: '陷阱',   id: 'home_trap' },
            bigBox:     { label: '大箱子', id: 'home_box' },
            well:       { label: '水井',   id: 'home_well' },
            toilet:     { label: '厕所',   id: 'home_toilet' },
            sleepPlace: { label: '床铺',   id: 'home_sleep' },
        };
        for (const [key, info] of Object.entries(facilityMap)) {
            if (this.gm.buildingSaveData[key]?.own) {
                // 有新提示？
                const hint = this.gm.buildingSaveData[key]?.hint;
                cells.push({
                    id: info.id,
                    name: hint ? `${info.label} !` : info.label,
                    state: 'normal',
                    data: key,
                });
            }
        }

        // 3. 固定动作按钮（出门/菜单已移到底栏快捷入口，不再重复）
        cells.push({ id: 'build', name: '建造', state: 'normal' });

        return {
            title: '超苦逼冒险者',
            breadcrumb: '主页',
            columns: 4,
            cells,
            home: true,
            rebuild: () => this.buildHomePage().cells,
            onCellClick: (index, cell) => this.ctx.onHomeCellClick(cell.id),
        };
    }

    // ===== 建造（网格形式：仅未建建筑，每格展示名称+需求摘要）=====
    /** 公开入口：打开建造列表 */
    public openBuildList(): void {
        const cells: GridCellData[] = [];
        for (const key in BUILDING_DATA) {
            if (key === 'build') continue; // 'build' 是分类入口，非真实建筑
            const d = BUILDING_DATA[key];
            const built = this.gm.buildingSaveData[key]?.own;
            if (built) continue; // 已建的不显示（已在首页动态区）

            const preBuilt = !d.building || this.gm.buildingSaveData[d.building]?.own;
            const hasMat = this.gm.checkHaveResource(d.require || {});
            const canBuild = preBuilt && hasMat;

            // 简短需求摘要：如 "木头×8" 或 "木头×10 零件×4"
            const reqStr = d.require && Object.keys(d.require).length > 0
                ? Object.entries(d.require).map(([k, v]) => `${ITEM_DATA[k]?.name || k}×${v}`).join(' ')
                : '';

            cells.push({
                id: `build_${key}`,
                name: `${d.name}${reqStr ? '\n' + reqStr : ''}${d.desc ? '\n' + d.desc : ''}`,
                state: canBuild ? 'normal' : 'disabled',
                type: 'list',  // 列表行：满宽展示完整信息
                data: { key, canBuild },
            });
        }

        if (cells.length === 0) {
            cells.push({ id: 'empty', name: '所有建筑均已建造', state: 'disabled', type: 'list' });
        }


        this.navigator.push({
            title: '建造',
            breadcrumb: '主页 > 建造',
            columns: 1,  // 单列：每行一个建筑，横向撑满展示完整信息
            cells,
            onCellClick: (index, cell) => {
                if (!cell.data?.canBuild) return;
                this.doBuild(cell.data.key);
            },
        });
    }

    /** 执行建造动作（复用 ActionBuilding 完整逻辑） */
    public doBuild(buildingId: string): void {
        const r = ActionBuilding.instance.build(buildingId);
        if (!r.success) this.setMsg(r.message);
        // 成功：进度条播放中，结束后由 OPERATION_DONE 弹反馈；刷新首页（设施动态区会更新）
        this.navigator.setRoot(this.buildHomePage());
        this.eventBus.emit(GameEvents.UI_REFRESH);
    }
}
