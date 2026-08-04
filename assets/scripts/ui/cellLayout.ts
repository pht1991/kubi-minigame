/**
 * cellLayout.ts - 格子布局抽象层
 *
 * 把「方格 / 横条 / 内部文字排版」从 GridCell 的硬编码两分支抽成可配置参数，
 * 让 GridComponent 可以按每格尺寸做流式布局（支持同页方格 + 横条混排）。
 *
 * 设计要点：
 * - GridCellData.layout 可以是预设名（'tile' | 'bar'）或覆盖对象
 *   Partial<CellLayoutStyle>；不填则回退到旧的 type 字段
 *   （type==='list' → bar，其它 → tile），保证 100+ 处旧调用零改动。
 * - resolveCellLayout(data, ctx, opts?) 返回 ResolvedCellLayout（含最终像素宽高、
 *   fontSize、对齐、换行、是否整行），GridComponent 用它定位，GridCell 用它排版。
 * - 单一像素来源：GridCell 排版时只读「节点自身 UITransform 尺寸」（由 GridComponent
 *   按 ResolvedCellLayout.width/height 设定），不反推预设数字，避免双源不一致。
 */

import { GridCellData } from '../data/types';

/** 布局形态：方格 / 横条 */
export type CellLayoutKind = 'tile' | 'bar';

/** 每格可覆盖的布局样式（全可选，未填则取预设默认值） */
export interface CellLayoutStyle {
    /** 形态；省略时由 type 推导 */
    kind?: CellLayoutKind;
    /** 占用列数（仅对 tile 有意义的提示；bar 强制整行） */
    span?: number;
    /** 格子像素宽（省略取预设） */
    width?: number;
    /** 格子像素高（省略取预设） */
    height?: number;
    /** 名字字号 */
    fontSize?: number;
    /** 名字行高 */
    lineHeight?: number;
    /** 名字水平对齐 */
    align?: 'center' | 'left';
    /** 是否允许换行（横条多为 true，方格多为 false） */
    wrap?: boolean;
    /** 横条是否跳过自动截断（长富文本行设为 true） */
    noTruncate?: boolean;
}

/** 页面级布局上下文（由 GridComponent 在渲染时构建） */
export interface CellLayoutContext {
    /** 页面列数（方格模式下一行几格） */
    columns: number;
    /** 方格默认宽 */
    tileW: number;
    /** 方格默认高 */
    tileH: number;
    /** 格子间距 */
    spacing: number;
    /** 内容区内宽（= max(方格网格宽, barWidth)），用于流式定位与 content 尺寸下限 */
    contentInnerW: number;
    /** 横条满宽（独立于 columns，纯列表页恒为满宽，不受 columns=1 影响） */
    barWidth: number;
    /** 横条默认高 */
    barH: number;
}

/** 解析后的最终布局（像素已确定） */
export interface ResolvedCellLayout {
    kind: CellLayoutKind;
    span: number;
    width: number;
    height: number;
    fontSize: number;
    lineHeight: number;
    align: 'center' | 'left';
    wrap: boolean;
    noTruncate: boolean;
}

/** 方格预设（依赖 ctx 计算像素宽高） */
function tilePreset(ctx: CellLayoutContext): Omit<ResolvedCellLayout, 'kind'> {
    return {
        span: 1,
        width: ctx.tileW,
        height: ctx.tileH,
        fontSize: 22,
        lineHeight: 28,
        align: 'center',
        wrap: false,
        noTruncate: false,
    };
}

/** 横条预设（整行满宽 = barWidth，左对齐可换行） */
function barPreset(ctx: CellLayoutContext): Omit<ResolvedCellLayout, 'kind'> {
    return {
        span: ctx.columns,
        width: ctx.barWidth,
        height: ctx.barH,
        fontSize: 20,
        lineHeight: 26,
        align: 'left',
        wrap: true,
        noTruncate: false,
    };
}

export interface ResolveOpts {
    /** 无 layout 也无 type 时的默认形态（页脚统一用 'bar'） */
    defaultKind?: CellLayoutKind;
}

/**
 * 解析单格布局。
 * 优先级：layout 显式覆盖 > type 推导 > defaultKind。
 */
export function resolveCellLayout(
    data: GridCellData,
    ctx: CellLayoutContext,
    opts?: ResolveOpts
): ResolvedCellLayout {
    // 1) 决定形态
    let kind: CellLayoutKind;
    let ov: Partial<CellLayoutStyle> = {};
    if (data.layout) {
        if (typeof data.layout === 'string') {
            kind = data.layout;
        } else {
            ov = data.layout;
            kind = data.layout.kind
                ?? (data.type === 'list' ? 'bar' : 'tile');
        }
    } else {
        kind = data.type === 'list' ? 'bar' : (opts?.defaultKind ?? 'tile');
    }

    // 2) 取预设基线
    const base = kind === 'bar' ? barPreset(ctx) : tilePreset(ctx);

    // 3) 应用覆盖
    const width = ov.width ?? base.width;
    const height = ov.height ?? base.height;
    const fontSize = ov.fontSize ?? base.fontSize;
    const lineHeight = ov.lineHeight ?? base.lineHeight;
    const align = ov.align ?? base.align;
    const wrap = ov.wrap ?? base.wrap;
    const noTruncate = ov.noTruncate ?? data.noTruncate ?? base.noTruncate;
    const span = ov.span ?? base.span;

    return { kind, span, width, height, fontSize, lineHeight, align, wrap, noTruncate };
}
