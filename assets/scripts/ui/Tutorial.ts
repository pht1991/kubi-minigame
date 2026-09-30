import { t } from '../i18n';
/**
 * Tutorial.ts - 最小新手引导文案与触发逻辑（T-UI-T5）
 *
 * 职责（纯数据 + 轻量触发，零新架构）：
 *  - STATUS_DEFS：6 维状态的一句话释义（T5.2 状态栏点击复用弹窗）
 *  - HINTS / PAGE_HINT_OF：各页面首次进入的顶部 msg 条提示（T5.3）
 *  - maybeShowHint(key)：仅在首次进入时弹 Toast（msg 条），用 SaveManager 标志去重
 *  - isFirstPlayDone / markFirstPlayDone：首玩 3 步卡的「仅首次」判定
 *
 * 不依赖 Cocos 渲染对象，仅用 SaveManager（双端 fallback）与 Toast（顶层 msg 条）。
 * 注意：游戏实际 6 维为 生命/满腹/水分/体力/精神/体温（StatusBar 字段 hp/full/moist/ps/san/temp）；
 * 设计文档 T5.1 提到的「理智」在本体实现中对应「精神(san)」，已在释义中按真实字段落地。
 */

import { SaveManager } from '../core/SaveManager';
import { Toast } from './Toast';

export interface StatusDef {
    /** 状态显示名（弹窗标题） */
    name: string;
    /** 一句话释义（归零 / 极端会怎样） */
    desc: string;
}

export class Tutorial {
    /** T5.2：6 维状态释义（key 与 StatusBar 字段一致：hp/full/moist/ps/san/temp） */
    static readonly STATUS_DEFS: Record<string, StatusDef> = {
        hp:    { name: t('生命'), desc: t('生命归零即死亡，一切归零重来。优先保命！') },
        full:  { name: t('满腹'), desc: t('饱食度归零会持续掉血，记得吃东西填饱肚子。') },
        moist: { name: t('水分'), desc: t('水分归零会持续掉血，记得喝水补充水分。') },
        ps:    { name: t('体力'), desc: t('体力过低行动受限，极端耗竭会掉血，注意休息。') },
        san:   { name: t('精神'), desc: t('精神过低会掉血，归零将失控，保持心态稳定。') },
        temp:  { name: t('体温'), desc: t('体温过热或过冷会持续掉血，注意保暖与降温。') },
    };

    /** T5.3：各页面首次提示文案（key 为内部提示 key） */
    static readonly HINTS: Record<string, string> = {
        map:      t('点地点进入 → 采集获取材料，狩猎会进入战斗。注意状态变化。'),
        goout:    t('选择地点出门探索，部分地点会遇到商人可交易。'),
        craft:    t('选配方消耗材料制造道具；需先满足前置建筑 / 科技。'),
        cook:     t('用食材烹饪可恢复满腹 / 水分等状态，先填饱肚子！'),
        build:    t('消耗材料建造设施，解锁更多功能与入口。'),
        skill:    t('用轮回点数学习技能，永久强化你的能力。'),
        dungeon:  t('深入地牢挑战强敌获取稀有掉落，注意状态与装备。'),
        event:    t('随机事件触发选择或战斗，谨慎决策。'),
        bigbox:   t('存放多余物资，容量有限，可升级扩容。'),
        building: t('在此管理设施：取水 / 种植 / 陷阱 / 酿造等。'),
        bag:      t('查看与使用物资；点物品可装备或食用。'),
        brew:     t('酿造酒类，部分可作交易或特殊用途。'),
        rest:     t('在床铺休息恢复状态；睡觉会推进时间。'),
    };

    /**
     * T5.3：首页 / 底栏入口 id → 提示 key 映射（未列出的入口不弹提示）。
     * 覆盖：背包 / 地图 / 制造 / 烹饪 / 建造 / 技能 / 地牢 / 事件 / 大箱子 / 设施 / 酿酒 / 休息。
     */
    static readonly PAGE_HINT_OF: Record<string, string> = {
        map: 'map',
        goOut: 'goout',
        build: 'build',
        bag: 'bag',
        equip: 'bag',
        craft: 'craft',
        home_craft: 'craft',
        home_alchemy: 'craft',
        home_magic: 'craft',
        home_science: 'craft',
        cook: 'cook',
        home_cook: 'cook',
        building: 'building',
        home_farm: 'building',
        home_trap: 'building',
        home_well: 'building',
        home_toilet: 'building',
        home_box: 'bigbox',
        home_alco: 'brew',
        skill: 'skill',
        dungeon: 'dungeon',
        quest: 'event',
        home_sleep: 'rest',
    };

    /** T5.3：首次进入某页面时弹顶部 msg 条（仅首次，用 SaveManager 标志去重） */
    static maybeShowHint(key: string): void {
        const text = Tutorial.HINTS[key];
        if (!text) return;
        if (SaveManager.instance.getTutorialFlag('hint_' + key)) return;
        SaveManager.instance.setTutorialFlag('hint_' + key, true);
        Toast.instance?.show(text, 1600);
    }

    /** T5.1：首玩 3 步卡是否已展示过（仅首次进入游戏） */
    static isFirstPlayDone(): boolean {
        return SaveManager.instance.getTutorialFlag('firstplay');
    }

    /** T5.1：标记首玩 3 步卡已完成（看完 / 跳过都置位，避免回访者重复弹） */
    static markFirstPlayDone(): void {
        SaveManager.instance.setTutorialFlag('firstplay', true);
    }
}
