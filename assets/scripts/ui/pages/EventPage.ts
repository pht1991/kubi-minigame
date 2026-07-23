/**
 * EventPage.ts - 事件域页面模块
 *
 * 从 MainScene 抽离：事件总览网格 + 事件详情（通过 EventDetailPanel 弹窗）。
 * 入口 openQuestGrid 被 MainScene（onHomeCellClick）委托调用。
 * 事件详情走专用 NPC 对话面板（EventDetailPanel），不再用 GridCell 网格。
 */

import { BasePage } from './BasePage';
import { GridPage, GridCellData } from '../../data/types';
import { EVENT_DATA } from '../../data/data';

export class EventPage extends BasePage {
    /** 公开入口：打开事件总览网格 */
    public openQuestGrid(): void {
        const cells: GridCellData[] = Object.keys(EVENT_DATA)
            .filter(id => !this.gm.eventSaveData[id]?.experienced)
            .map(id => ({
                id,
                name: EVENT_DATA[id].name,
                state: 'normal',
                data: id,
            }));
        if (cells.length === 0) cells.push({ id: 'none', name: '暂无可触发事件', state: 'disabled' });

        this.navigator.push({
            title: '事件',
            breadcrumb: '事件',
            columns: 4,
            cells,
            onCellClick: (index, cell) => this.openEventDetail(cell.id),
        });
    }

    /** 打开事件详情：弹出专用 NPC 对话面板（主页「事件」入口与地图地点事件共用） */
    public openEventDetail(eventId: string): void {
        this.ctx.eventDetailPanel?.showDetail({
            eventId,
            onTrigger: () => {
                // 触发后刷新当前导航页（如果还在事件列表则重建列表）
                const cur = this.navigator.current;
                if (cur && cur.title === '事件') {
                    this.openQuestGrid();
                }
            },
        });
    }
}
