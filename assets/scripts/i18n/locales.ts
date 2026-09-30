/**
 * 语种覆盖表注册中心。
 *
 * 结构：
 *   LOCALES[lang][tableKey][relativePath] = 译文        ← 数据层（就地覆盖）
 *   LOCALES[lang].ui[key]                 = 译文        ← UI 层（t(key,...)）
 *
 * tableKey 与 register.ts 中 registerDataTable/registerFlatMap 的第一个参数一一对应。
 * 某个表/键未提供覆盖时，运行时自动回退到中文（数据层回退原始快照，UI 层回退 t() 传入的 zh）。
 *
 * 扩充语种：在 Lang 里加一种，这里补一个对应分支，并把 en/ 下的译文文件复制为对应语种即可。
 */
import type { Lang } from './index';
import { EN_DATA } from './en/data';
import { EN_UI } from './en/ui';

export const LOCALES: Record<Lang, any> = {
    zh: {}, // 中文即源语言，无需覆盖表
    en: {
        ...EN_DATA,
        ui: EN_UI,
    },
};
