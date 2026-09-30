/**
 * i18n 运行时核心
 *
 * 设计要点（为什么这么设计，见项目 docs/ 与 .workbuddy/memory 的评估结论）：
 *
 * 1) 数据层「就地覆盖」——零改动读取点
 *    - 每个数据表（ITEM_DATA / MST_DATA / SKILL_DATA …）都用【稳定字符串 ID】作键，
 *      且 name/desc/对话 全是纯展示字段。
 *    - 启动时把数据表注册进 i18n，递归收集所有可翻译叶子（name/desc/d_1/d_2 等），
 *      并快照其原始（中文）值。
 *    - applyLang(lang) 时，按「覆盖表」把对应叶子替换成目标语种；未提供的条目回退到中文快照。
 *    - 于是 ITEM_DATA[id].name 这类读取点【一行都不用改】，背包/商店/建造/技能页自动本地化。
 *
 * 2) UI 层用 t(key, zh, params) —— 内联中文就地改调用
 *    - 第二个参数 zh 是「调用处的中文原文」，作为 zh 语种的回退值，免维护 zh 表。
 *    - 非 zh 语种命中覆盖表则用覆盖值，否则回退到传入的中文（半迁移也不破版）。
 *    - 支持 {param} 插值，用于「自动存档: {state}」这类动态串。
 *
 * 3) 架构对 N 语种可扩展：LOCALES[lang][table][path] 与 LOCALES[lang].ui[key] 补表即可，零改代码。
 */

import { LOCALES } from './locales';

export type Lang = 'zh' | 'en';

/** 数据表中需要被翻译的字段名（仅这些会被就地覆盖） */
const DATA_TRANS_FIELDS = new Set(['name', 'desc', 'd_1', 'd_2']);

interface Leaf {
    /** 相对表根的路径，如 'evilBook.name'、'town.resource.tree.name' */
    path: string;
    get: () => any;
    set: (v: any) => void;
}

interface RegTable {
    key: string;
    leaves: Leaf[];
    original: Map<string, any>;
}

const registrations: RegTable[] = [];
let current: Lang = 'zh';

/**
 * 注册一个「对象型」数据表（带 name/desc 等字段，可能嵌套）。
 * 会递归收集可翻译叶子并快照中文原始值。重复注册同一 key 会被忽略。
 */
export function registerDataTable(key: string, table: Record<string, any>): void {
    if (registrations.some(r => r.key === key)) return;
    const reg: RegTable = { key, leaves: [], original: new Map() };
    walkObject(table, '', reg);
    registrations.push(reg);
}

/**
 * 注册一个「扁平字符串映射」表（如 EQUIP_TYPE_DATA：{ body:'身体', hand:'手' }）。
 * 顶层每个 key 视为 ID，value 视为可翻译串（无 name/desc 包裹）。
 */
export function registerFlatMap(key: string, map: Record<string, any>): void {
    if (registrations.some(r => r.key === key)) return;
    const reg: RegTable = { key, leaves: [], original: new Map() };
    for (const k of Object.keys(map)) {
        const v = map[k];
        if (typeof v === 'string') {
            const path = k;
            reg.original.set(path, v);
            reg.leaves.push({ path, get: () => map[k], set: (x: any) => { map[k] = x; } });
        }
    }
    registrations.push(reg);
}

function walkObject(node: any, prefix: string, reg: RegTable): void {
    if (node == null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
        node.forEach((item, i) => {
            const p = `${prefix}[${i}]`;
            if (typeof item === 'string') {
                reg.original.set(p, item);
                reg.leaves.push({ path: p, get: () => node[i], set: (v: any) => { node[i] = v; } });
            } else if (item && typeof item === 'object') {
                walkObject(item, p, reg);
            }
        });
        return;
    }
    for (const k of Object.keys(node)) {
        const v = node[k];
        const p = prefix ? `${prefix}.${k}` : k;
        if (typeof v === 'string') {
            if (DATA_TRANS_FIELDS.has(k)) {
                reg.original.set(p, v);
                reg.leaves.push({ path: p, get: () => node[k], set: (x: any) => { node[k] = x; } });
            }
        } else if (v && typeof v === 'object') {
            walkObject(v, p, reg);
        }
    }
}

/** 应用语种：把所有已注册表的叶子替换成目标语种覆盖，缺失则回退中文快照 */
export function applyLang(lang: Lang): void {
    current = lang;
    for (const reg of registrations) {
        const tableLoc: Record<string, any> | undefined = LOCALES[lang]?.[reg.key];
        for (const leaf of reg.leaves) {
            const override = tableLoc?.[leaf.path];
            leaf.set(override != null ? override : reg.original.get(leaf.path));
        }
    }
}

export function getLang(): Lang { return current; }
export function isZh(): boolean { return current === 'zh'; }
export function setLang(lang: Lang): void { applyLang(lang); }

/**
 * 浏览器端是否处于「国内」（中国大陆）环境。
 * 用于在浏览器平台决定默认语种：国内(命中)→中文，国外→英文。
 * 微信小游戏不调用此函数（按平台直接判定为中文）。
 * 用 typeof 守卫，保证在非浏览器（微信/编辑器）环境下不会抛错。
 */
export function isDomesticBrowser(): boolean {
    try {
        const nav: any = typeof navigator !== 'undefined' ? navigator : null;
        if (nav) {
            const lang = (nav.language || (nav.languages && nav.languages[0]) || '').toLowerCase();
            if (lang.indexOf('zh') === 0) return true;
        }
        if (typeof Intl !== 'undefined') {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
            if (['Asia/Shanghai', 'Asia/Chongqing', 'Asia/Urumqi', 'Asia/Hong_Kong', 'Asia/Macau', 'Asia/Taipei'].indexOf(tz) >= 0) {
                return true;
            }
        }
    } catch (e) { /* 环境不支持，保守返回 false */ }
    return false;
}

/**
 * 按运行平台决定「新游戏」的默认语种：
 * - 微信小游戏（移动端 / 国内）：中文
 * - 浏览器：国内(时区/语言命中)→中文，否则英文（兼顾「默认英语，能区分国内国外最佳」）
 */
export function defaultLangForPlatform(platform: string): Lang {
    if (platform === 'WECHAT_GAME') return 'zh';
    return isDomesticBrowser() ? 'zh' : 'en';
}

/**
 * 是否应在界面展示「语言切换」开关：
 * - 浏览器（桌面 / 移动浏览器）展示
 * - 微信小游戏（移动端 / 国内）不展示
 */
export function shouldShowLangToggle(platform: string): boolean {
    return platform === 'DESKTOP_BROWSER' || platform === 'MOBILE_BROWSER';
}

function interpolate(s: string, params?: Record<string, any>): string {
    if (!params) return s;
    return s.replace(/\{(\w+)\}/g, (_, k: string) =>
        params[k] != null ? String(params[k]) : `{${k}}`);
}

/**
 * UI 文案翻译。
 * @param key  稳定键，如 'ui.settings.autoSave'
 * @param zh   调用处的中文原文（zh 回退值，免维护 zh 表）
 * @param params 插值参数 {state:'开'}
 */
export function t(key: string, zh?: string, params?: Record<string, any>): string {
    const override = LOCALES[current]?.ui?.[key];
    const s = override != null ? override : (zh != null ? zh : key);
    return interpolate(s, params);
}

// 对外暴露「注册全部数据表」入口（实现在 register.ts），方便 GameManager 一处接入
export { registerAllDataTables } from './register';
