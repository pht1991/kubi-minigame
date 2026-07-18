/**
 * SkillPage.ts - 技能域页面模块
 *
 * 从 MainScene 抽离：技能一览网格 + 技能详情（学习/升级）。
 * 入口 openSkillGrid 被 MainScene（onHomeCellClick）委托调用。
 */

import { BasePage } from './BasePage';
import { GridPage, GridCellData } from '../../data/types';
import { ActionSkill } from '../../actions/ActionSkill';
import { SKILL_DATA, ITEM_DATA } from '../../data/data';

export class SkillPage extends BasePage {
    /** 公开入口：打开技能一览网格 */
    public openSkillGrid(): void {
        const cells: GridCellData[] = [];
        for (const key in SKILL_DATA) {
            const data = SKILL_DATA[key];
            const isTalent = !!(data as any).isTalent;
            const level = this.gm.skill[key] || 0;
            const tag = isTalent ? '【天】' : '【技】';
            const levelStr = level > 0 ? ` Lv.${level}` : '';
            cells.push({
                id: key,
                name: `${tag}${data.name}${levelStr}`,
                state: 'normal',
                data: key,
            });
        }

        if (cells.length === 0) {
            cells.push({ id: 'empty', name: '暂无技能', state: 'disabled' });
        }

        this.navigator.push({
            title: `技能 (${cells.length})`,
            breadcrumb: '技能',
            columns: 4,
            cells,
            onCellClick: (index, cell) => this.openSkillDetail(cell.id),
        });
    }

    /** 技能详情 + 学习动作 */
    private openSkillDetail(skillId: string): void {
        this.navigator.push(this.buildSkillDetailPage(skillId));
    }

    private buildSkillDetailPage(skillId: string): GridPage {
        const data = SKILL_DATA[skillId];
        const level = this.gm.skill[skillId] || 0;
        const cost = ActionSkill.instance.previewCost(skillId);
        const costStr = cost
            ? Object.entries(cost).map(([k, v]) => `${ITEM_DATA[k]?.name || k}×${v}`).join(' ')
            : '已满学/不可学';
        const canLearn = !!cost && this.gm.checkHaveResource(cost);
        const isTalent = !!(data as any).isTalent;
        const isOne = !!(data as any).one;
        const cells: GridCellData[] = [];
        cells.push(
            { id: 'name', name: `${data.name} [${isTalent ? '天赋' : '技能'}]`, state: 'disabled' },
            { id: 'desc', name: data.desc || '', state: 'disabled' },
            { id: 'lv', name: `当前等级: ${level}${isOne ? ' (唯一)' : ''}`, state: 'disabled' },
        );
        if ((data as any).buff) {
            const buffVal = (data as any).buff;
            const buffStr = isTalent
                ? `每级加成: +${Math.round(buffVal * 100)}%`
                : `每级效果: ${buffVal < 1 ? `×${buffVal}` : `+${Math.round(buffVal * 100)}%`}`;
            cells.push({ id: 'buff', name: buffStr, state: 'disabled' });
        }
        cells.push(
            { id: 'cost', name: `学习成本: ${costStr}`, state: 'disabled' },
            { id: 'learn', name: level > 0 ? '升级' : '学习', state: canLearn ? 'normal' : 'disabled' },
        );

        return {
            title: data.name,
            breadcrumb: data.name,
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                if (cell.id === 'learn') {
                    const r = ActionSkill.instance.learn(skillId);
                    this.setMsg(r.message);
                    this.navigator.replace(this.buildSkillDetailPage(skillId));
                }
            },
        };
    }
}
