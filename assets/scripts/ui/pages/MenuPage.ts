/**
 * MenuPage.ts - 菜单域页面模块
 *
 * 从 MainScene 抽离：菜单主页 + 技能页 + 设置页（存档/读档/云存档/音量/统计/帮助/转生/阵营）+ 阵营选择弹窗
 * + 云存档页 + 转生面板 + 统计面板 + 帮助面板。
 * 入口 openMenuGrid 被 MainScene（onHomeCellClick）委托调用。
 * 转生后回主页经 ctx.buildPage.buildHomePage 跳转。
 */

import { BasePage } from './BasePage';
import { GridPage, GridCellData } from '../../data/types';
import { ActionEvent } from '../../actions/ActionEvent';
import { CloudSaveProvider } from '../../core/CloudSaveProvider';
import { SKILL_DATA, EVENT_DATA } from '../../data/data';
import { GameEvents } from '../../core/EventBus';
import { DialogOption } from '../DialogPanel';
import { t, type Lang } from '../../i18n';
import { Layout } from '../layoutConfig';

export class MenuPage extends BasePage {
    // ===== 菜单（原版风格：技能 + 设置 两页）=====
    /** 公开入口：打开菜单主页 */
    public openMenuGrid(): void {
        this.navigator.push(this.buildMenuPage());
    }

    private buildMenuPage(): GridPage {
        // 原版菜单只有两个入口：技能 / 设置
        const cells: GridCellData[] = [
            { id: 'skill', name: t('ui.menu.skills', '技能'), state: 'normal' },
            { id: 'settings', name: t('ui.menu.settings', '设置'), state: 'normal' },
        ];


        return {
            title: t('ui.menu.title', '菜单'),
            breadcrumb: t('ui.menu.breadcrumb', '主页 > 菜单'),
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                if (cell.id === 'skill') {
                    this.navigator.push(this.buildMenuSkillPage());
                } else if (cell.id === 'settings') {
                    this.navigator.push(this.buildMenuSettingsPage());
                }
            },
        };
    }

    /** 菜单 → 技能页 */
    private buildMenuSkillPage(): GridPage {
        const cells: GridCellData[] = [];
        for (const key in SKILL_DATA) {
            const d = SKILL_DATA[key];
            const level = this.gm.skill[key] || 0;
            // 原版：初始技能为空，后续根据条件获得（含天赋，也需习得 level>0 才显示）
            if (level <= 0) continue;

            const maxLv = d.maxLevel || 10;
            const talentMark = (d as any).isTalent ? t('ui.skill.talent', '(天赋)') : '';
            cells.push({
                id: `skill_${key}`,
                name: `${d.name}${talentMark}\nLv.${level}/${maxLv}\n${d.desc || ''}`,
                state: level > 0 ? 'normal' : 'disabled',
                type: 'list',
            });
        }

        if (cells.length === 0) {
            cells.push({ id: 'empty', name: t('ui.skill.empty', '尚未习得任何技能'), state: 'disabled', type: 'list' });
        }

        return {
            title: t('ui.menu.skills', '技能'),
            breadcrumb: t('ui.menu.breadcrumb.skills', '菜单 > 技能'),
            columns: 1,  // 单列列表
            cells,
            onCellClick: (index, cell) => {},
        };
    }

    /** 菜单 → 设置页（参照原版：存档/读档/云存档/音量/统计/帮助/转生/阵营/语言/返回） */
    private buildMenuSettingsPage(): GridPage {
        const s = this.gm.settings;
        const canReincarnate = ActionEvent.instance.canReincarnate();
        const langNow: Lang = (s.lang as Lang) || 'zh';
        const campName = this.gm.camp
            ? (this.gm.camp === 'fire' ? t('ui.fire', '火之阵营') : t('ui.ice', '冰之阵营'))
            : t('ui.settings.chooseCamp', '选择阵营');
        const cells: GridCellData[] = [
            { id: 'save', name: t('ui.settings.save', '保存游戏'), state: 'normal' },
            { id: 'load', name: t('ui.settings.load', '读取存档'), state: 'normal' },
            { id: 'cloud', name: t('ui.settings.cloud', '云存档'), state: CloudSaveProvider.instance.enabled ? 'normal' : 'disabled' },
            { id: 'autoSave', name: t('ui.settings.autoSave', '自动存档: {state}', { state: s.autoSave ? t('ui.on', '开') : t('ui.off', '关') }), state: 'normal' },
            { id: 'volLabel', name: t('ui.settings.volLabel', '音量: {pct}', { pct: `${Math.round(s.volume * 100)}%` }), state: 'disabled' },
            { id: 'volUp', name: t('ui.settings.volUp', '音量+'), state: 'normal' },
            { id: 'volDown', name: t('ui.settings.volDown', '音量-'), state: 'normal' },
            { id: 'stats', name: t('ui.settings.stats', '游戏统计'), state: 'normal' },
            { id: 'help', name: t('ui.settings.help', '游戏帮助'), state: 'normal' },
            { id: 'reincarnation', name: canReincarnate ? t('ui.settings.reincarnation', '转生') : t('ui.settings.reincarnationLocked', '转生(未满足条件)'), state: canReincarnate ? 'normal' : 'disabled' },
            { id: 'camp', name: t('ui.settings.camp', '阵营: {c}', { c: campName }), state: this.gm.camp ? 'disabled' : 'normal' },
        ];

        // 语言切换：仅「浏览器」平台展示；微信小游戏（移动端/国内）按需求不展示
        if (Layout.isWeb) {
            cells.push({ id: 'lang', name: langNow === 'zh' ? 'English' : '中文', state: 'normal' });
        }


        return {
            title: t('ui.settings.title', '设置'),
            breadcrumb: t('ui.menu.breadcrumb.settings', '菜单 > 设置'),
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                switch (cell.id) {
                    case 'save':
                        this.saveMgr.save();
                        this.setMsg(t('ui.msg.saved', '存档已保存'));
                        this.navigator.replace(this.buildMenuSettingsPage());
                        break;
                    case 'load':
                        this.saveMgr.load();
                        this.setMsg(t('ui.msg.loaded', '已读档'));
                        this.eventBus.emit(GameEvents.UI_REFRESH);
                        this.navigator.replace(this.buildMenuSettingsPage());
                        break;
                    case 'cloud':
                        this.openCloudPanel();
                        break;
                    case 'autoSave':
                        this.gm.settings.autoSave = !this.gm.settings.autoSave;
                        if (this.gm.settings.autoSave) this.saveMgr.startAutoSave(60000);
                        else this.saveMgr.stopAutoSave();
                        this.setMsg(t('ui.msg.autoSaveOn', '自动存档已开启'));
                        this.navigator.replace(this.buildMenuSettingsPage());
                        break;
                    case 'volUp':
                        this.gm.settings.volume = Math.min(1, this.gm.settings.volume + 0.1);
                        this.navigator.replace(this.buildMenuSettingsPage());
                        break;
                    case 'volDown':
                        this.gm.settings.volume = Math.max(0, this.gm.settings.volume - 0.1);
                        this.navigator.replace(this.buildMenuSettingsPage());
                        break;
                    case 'lang':
                        this.gm.setLanguage(langNow === 'zh' ? 'en' : 'zh');
                        this.saveMgr.save();
                        this.navigator.replace(this.buildMenuSettingsPage());
                        break;
                    case 'stats':
                        this.openStatsPanel();
                        break;
                    case 'help':
                        this.openHelpPanel();
                        break;
                    case 'reincarnation':
                        if (canReincarnate) this.openReincarnationPanel();
                        break;
                    case 'camp':
                        this.openCampDialog();
                        break;
                }
            },
        };
    }

    /** 阵营选择弹窗（仅未选择时有效） */
    private openCampDialog(): void {
        if (this.gm.camp) {
            const campName = this.gm.camp === 'fire' ? t('ui.fire', '火之阵营') : t('ui.ice', '冰之阵营');
            this.setMsg(t('ui.camp.already', '你已属于【{c}】，无法更改', { c: campName }));
            this.navigator.replace(this.buildMenuPage());
            return;
        }
        const options: DialogOption[] = [
            { label: '🔥 ' + t('ui.fire', '火之阵营'), data: 'fire', desc: t('ui.camp.fireDesc', '体温更暖（不易冻毙），代谢稳定使满腹/水分消耗 -15%，战斗中攻击 +5%') },
            { label: '❄ ' + t('ui.ice', '冰之阵营'), data: 'ice', desc: t('ui.camp.iceDesc', '冷静使精神衰减 -50%，低温环境更稳') },
        ];
        this.dialogPanel?.show(
            t('ui.camp.title', '选择你的阵营'),
            options,
            (data: string) => {
                const r = this.gm.chooseCamp(data as 'ice' | 'fire');
                this.setMsg(r.message);
                this.navigator.replace(this.buildMenuPage());
            },
            () => {}
        );
    }

    /** 云存档面板 */
    private openCloudPanel(): void {
        this.navigator.push(this.buildCloudPage());
    }

    private buildCloudPage(): GridPage {
        const cells: GridCellData[] = [
            { id: 'c_status', name: `状态: ${this.saveMgr.cloudStatusText()}`, state: 'disabled' },
            { id: 'c_upload', name: '立即上传', state: 'normal' },
            { id: 'c_download', name: '下载云端', state: 'normal' },
        ];

        return {
            title: '云存档',
            breadcrumb: '云存档',
            columns: 4,
            cells,
            onCellClick: async (index, cell) => {
                if (cell.id === 'c_upload') {
                    const ok = await this.saveMgr.uploadToCloud();
                    this.setMsg(ok ? '已上传到云端' : '上传失败，检查网络/云配置');
                    this.navigator.replace(this.buildCloudPage());
                } else if (cell.id === 'c_download') {
                    const ok = await this.saveMgr.downloadFromCloud();
                    this.setMsg(ok ? '已从云端恢复' : '下载失败/云端无存档');
                    if (ok) this.eventBus.emit(GameEvents.UI_REFRESH);
                    this.navigator.replace(this.buildCloudPage());
                }
            },
        };
    }

    /** 转生面板 */
    private openReincarnationPanel(): void {
        const canReincarnate = ActionEvent.instance.canReincarnate();
        const maouLevel = this.gm.maouLevel;
        const cells: GridCellData[] = [
            { id: 'info', name: `当前轮回: 第 ${maouLevel} 世`, state: 'disabled', type: 'list', noTruncate: true },
            { id: 'cond', name: canReincarnate ? '条件已满足，可以转生' : '需到达地牢10层或击败魔王', state: 'disabled', type: 'list', noTruncate: true },
            { id: 'desc', name: '转生将重置地牢进度与状态，但保留技能与魔王等级', state: 'disabled', type: 'list', noTruncate: true },
            { id: 'doReincarnate', name: '确认转生', state: canReincarnate ? 'normal' : 'disabled', type: 'list', noTruncate: true },
        ];

        this.navigator.push({
            title: '转生',
            breadcrumb: '转生',
            columns: 1,
            cells,
            onCellClick: (index, cell) => {
                if (cell.id === 'doReincarnate' && canReincarnate) {
                    const r = ActionEvent.instance.doReincarnation();
                    this.setMsg(r.message);
                    const home = this.ctx.buildPage?.buildHomePage();
                    if (home) this.navigator.setRoot(home);
                }
            },
        });
    }

    /** 统计面板 */
    private openStatsPanel(): void {
        const s = this.gm.playerState;
        const td = this.gm.timeData;
        const bag = this.gm.boxSaveData['bag'] || {};
        const itemCount = Object.keys(bag).length;
        const skillCount = Object.keys(this.gm.skill).filter(k => this.gm.skill[k] > 0).length;
        const eventCount = Object.keys(this.gm.eventSaveData).filter(k => this.gm.eventSaveData[k]?.experienced).length;
        const totalEvents = Object.keys(EVENT_DATA).length;
        const ds = this.gm.dungeonSaveData;

        const cells: GridCellData[] = [
            { id: 'time', name: `游戏时间: ${td.day}天 ${td.hour}时`, state: 'disabled' },
            { id: 'season', name: `季节: ${['春', '夏', '秋', '冬'][td.season]}`, state: 'disabled' },
            { id: 'hp', name: `生命: ${Math.round(s.hp)}/100`, state: 'disabled' },
            { id: 'full', name: `满腹: ${Math.round(s.full)}/100`, state: 'disabled' },
            { id: 'moist', name: `水分: ${Math.round(s.moist)}/100`, state: 'disabled' },
            { id: 'ps', name: `体力: ${Math.round(s.ps)}/100`, state: 'disabled' },
            { id: 'san', name: `精神: ${Math.round(s.san)}/100`, state: 'disabled' },
            { id: 'maou', name: `轮回: 第 ${this.gm.maouLevel} 世`, state: 'disabled' },
            { id: 'items', name: `背包物品: ${itemCount} 种`, state: 'disabled' },
            { id: 'skills', name: `已学技能: ${skillCount} 项`, state: 'disabled' },
            { id: 'events', name: `已完成事件: ${eventCount}/${totalEvents}`, state: 'disabled' },
            { id: 'dungeon', name: `地牢最深: ${ds?.deepest || 0} 层`, state: 'disabled' },
        ];

        this.navigator.push({
            title: '统计',
            breadcrumb: '统计',
            columns: 4,
            cells,
            onCellClick: (index, cell) => {},
        });
    }

    /** 帮助面板 */
    private openHelpPanel(): void {
        const cells: GridCellData[] = [
            { id: 'h1', name: '【操作说明】', state: 'disabled', type: 'list', noTruncate: true, layout: { kind: 'header' } },
            { id: 'h2', name: '点击网格格子进入对应功能', state: 'disabled', type: 'list', noTruncate: true },
            { id: 'h3', name: '弹窗可点击右上角×或蒙层关闭', state: 'disabled', type: 'list', noTruncate: true },
            { id: 'h4', name: '【生存指南】', state: 'disabled', type: 'list', noTruncate: true, layout: { kind: 'header' } },
            { id: 'h5', name: '满腹/水分/精神随时间下降', state: 'disabled', type: 'list', noTruncate: true },
            { id: 'h6', name: '通过采集/狩猎/烹饪获取食物', state: 'disabled', type: 'list', noTruncate: true },
            { id: 'h7', name: '建造农田可稳定生产食材', state: 'disabled', type: 'list', noTruncate: true },
            { id: 'h8', name: '【战斗指南】', state: 'disabled', type: 'list', noTruncate: true, layout: { kind: 'header' } },
            { id: 'h9', name: '装备武器提升攻击力', state: 'disabled', type: 'list', noTruncate: true },
            { id: 'h10', name: '学习技能获得永久加成', state: 'disabled', type: 'list', noTruncate: true },
            { id: 'h11', name: '地牢每层有战斗和宝箱', state: 'disabled', type: 'list', noTruncate: true },
            { id: 'h12', name: '【进阶提示】', state: 'disabled', type: 'list', noTruncate: true, layout: { kind: 'header' } },
            { id: 'h13', name: '陷阱可捕获小动物', state: 'disabled', type: 'list', noTruncate: true },
            { id: 'h14', name: '完成事件解锁新内容', state: 'disabled', type: 'list', noTruncate: true },
            { id: 'h15', name: '到达地牢深层可转生', state: 'disabled', type: 'list', noTruncate: true },
        ];

        this.navigator.push({
            title: '帮助',
            breadcrumb: '帮助',
            columns: 1,
            cells,
            onCellClick: (index, cell) => {},
        });
    }
}
