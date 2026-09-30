/**
 * textMetrics.ts - 文本尺寸估算单一真相源
 *
 * 把散落在 UILabel / cellLayout / ModalInfoRow / EventDetailPanel 等地的「字符宽估算」
 * 统一到这里，避免同一段汉字在不同组件里算出的宽高不一致（旧分叉是裁切 bug 的同源病根）。
 *
 * 模型（贴近 CSS 但不依赖回流链）：
 *  - 宽字符（CJK 汉字 / 全角标点 / 假名）视觉宽 ≈ 1.0×字号（方块字）
 *  - 窄字符（ASCII / 数字 / 半角标点）视觉宽 ≈ 0.55×字号
 *  ⚠️ 注意：这只是「布局估算」，用于让父容器（VStack/HStack/行/面板）在 Cocos 无父随子
 *    回流链的前提下拿到接近真实的子尺寸。文字本身是否裁切由 UILabel 的 overflow 决定
 *    （不传 width → NONE 自适应，永不裁切）。
 */

import { getLang } from '../i18n';

/** 单个字符的「显示单位」（宽字符 1.0，窄字符 0.55） */
export function charUnits(ch: string): number {
    const code = ch.codePointAt(0)!;
    // CJK 统一表意文字 + 中文/日文标点 + 全角字符
    const isWide = (code >= 0x2E80 && code <= 0x9FFF)
                || (code >= 0x3000 && code <= 0x30FF)
                || (code >= 0xFF00 && code <= 0xFFEF);
    return isWide ? 1.0 : 0.55;
}

/** 整串文本的总显示单位数（宽字符 1 单位，窄字符 0.55 单位） */
export function textUnits(text: string): number {
    let total = 0;
    for (const ch of text) total += charUnits(ch);
    return total;
}

const LATIN_CHAR_W = 0.5;   // 拉丁字母/数字平均视觉宽 ≈ 0.5em（等比字体）
const LATIN_SPACE_W = 0.28; // 空格宽 ≈ 0.28em

/** 单行拉丁文本宽度（词内不断开，空格按 LATIN_SPACE_W 计） */
function estimateLatinLineWidth(line: string, fontSize: number): number {
    let w = 0;
    for (const tk of line.split(/(\s+)/)) {
        if (!tk) continue;
        w += /^\s+$/.test(tk) ? tk.length * LATIN_SPACE_W * fontSize : tk.length * LATIN_CHAR_W * fontSize;
    }
    return w;
}

/**
 * 估算文本在给定字号下的像素宽度（基于混合字符宽）。
 * 返回不含 padding 的纯文字宽，调用方可按需 + 余量。
 */
export function estimateTextWidth(text: string, fontSize: number): number {
    if (getLang() !== 'zh') {
        // 非中文：取最宽的一行宽度（按 \n 分段）
        let maxW = 0;
        for (const line of (text || '').split('\n')) maxW = Math.max(maxW, estimateLatinLineWidth(line, fontSize));
        return Math.ceil(maxW);
    }
    return Math.ceil(textUnits(text) * fontSize);
}

/**
 * 估算文本在给定可用宽度下会折成几行（按 \n 分段后再逐段折行）。
 * @param text      文本（可含 \n）
 * @param fontSize  字号
 * @param availW    单行可用像素宽（不含 padding）
 */
export function estimateWrappedLines(text: string, fontSize: number, availW: number): number {
    if (getLang() !== 'zh') {
        // 非中文：词边界换行（词内不断开）
        const charW = LATIN_CHAR_W * fontSize;
        const spaceW = LATIN_SPACE_W * fontSize;
        let lines = 0;
        for (const seg of (text || '').split('\n')) {
            const words = seg.split(/\s+/).filter(Boolean);
            if (words.length === 0) { lines++; continue; }
            let lineW = 0, first = true;
            for (const word of words) {
                const w = word.length * charW;
                const add = (first ? 0 : spaceW) + w;
                if (lineW + add > availW && !first) { lines++; lineW = w; }
                else { lineW += add; }
                first = false;
            }
            lines++;
        }
        return lines;
    }
    const perLine = Math.max(1, Math.floor(availW / (fontSize * 0.95)));
    let lines = 0;
    for (const seg of (text || '').split('\n')) {
        const segUnits = textUnits(seg);
        lines += Math.max(1, Math.ceil(segUnits / perLine));
    }
    return lines;
}
