/**
 * 注册全部数据表到 i18n（仅做一次）。
 * 数据表的导出名来自 data/data_*.ts 与 data/data.ts / data/data_studio.ts。
 *
 * 注册后，applyLang() 即可按 ID 就地覆盖这些表的 name/desc/对话字段，
 * 所有读取点（ITEM_DATA[id].name 等）无需改动即得本地化结果。
 */
import { registerDataTable, registerFlatMap } from './index';

import { ITEM_DATA } from '../data/data_item';
import { MST_DATA, PREFIX_DATA } from '../data/data_mst';
import { PLACE_DATA } from '../data/data_place';
import { EVENT_DATA } from '../data/data_event';
import { DUNGEON_DATA } from '../data/data_dungeon';

import {
    TYPE_DATA, BUILDING_DATA, BUILDING_UPDATE_DATA, TRAP_DATA, CROP_DATA,
    ALCO_DATA, TRADE_DATA, SKILL_DATA, TEMP_DATA, EQUIP_TYPE_DATA, ROBBER_DATA,
} from '../data/data';
import { MAKE_DATA, ALCHEMY_DATA, SCIENCE_DATA, MAGIC_DATA } from '../data/data_studio';

let registered = false;

export function registerAllDataTables(): void {
    if (registered) return;
    registered = true;

    // 对象型表（带 name/desc，可能嵌套）
    registerDataTable('item', ITEM_DATA);
    registerDataTable('mst', MST_DATA);
    registerDataTable('prefix', PREFIX_DATA);
    registerDataTable('place', PLACE_DATA);
    registerDataTable('event', EVENT_DATA);
    registerDataTable('dungeon', DUNGEON_DATA);
    registerDataTable('type', TYPE_DATA);
    registerDataTable('building', BUILDING_DATA);
    registerDataTable('buildingUpdate', BUILDING_UPDATE_DATA);
    registerDataTable('trap', TRAP_DATA);
    registerDataTable('crop', CROP_DATA);
    registerDataTable('alco', ALCO_DATA);
    registerDataTable('trade', TRADE_DATA);
    registerDataTable('skill', SKILL_DATA);
    registerDataTable('temp', TEMP_DATA);
    registerDataTable('robber', ROBBER_DATA);
    registerDataTable('make', MAKE_DATA);
    registerDataTable('alchemy', ALCHEMY_DATA);
    registerDataTable('magic', MAGIC_DATA);
    registerDataTable('science', SCIENCE_DATA);

    // 扁平字符串映射表（顶层 value 即译文，无 name 包裹）
    registerFlatMap('equipType', EQUIP_TYPE_DATA);
}
