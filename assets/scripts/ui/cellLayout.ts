/**
 * cellLayout.ts - 格子布局抽象层
 *
 * 把「方格 / 横条 / 标题 / 内部文字排版 / 图标」从 GridCell 的硬编码分支抽成可配置参数，
 * 让 GridComponent 可以按每格尺寸做流式布局（支持同页方格 + 横条混排）。
 *
 * 设计要点：
 * - GridCellData.layout 可以是预设名（'tile' | 'bar' | 'header'）或覆盖对象
 *   Partial<CellLayoutStyle>；不填则回退到旧的 type 字段
 *   （type==='list' → bar，其它 → tile），保证 100+ 处旧调用零改动。
 * - resolveCellLayout(data, ctx, opts?) 返回 ResolvedCellLayout（含最终像素宽高、
 *   fontSize、对齐、换行、是否整行），GridComponent 用它定位，GridCell 用它排版。
 * - 单一像素来源：GridCell 排版时只读「节点自身 UITransform 尺寸」（由 GridComponent
 *   按 ResolvedCellLayout.width/height 设定），不反推预设数字，避免双源不一致。
 * - 横条（bar）高度自适应：按 name 估算行数算 height，解决多行文本被 CLAMP 裁切。
 * - 标题（header）形态：居中小字号弱色整行，用作分组标题（── xxx ── / 【xxx】）。
 */

import { GridCellData } from '../data/types';

/** 布局形态：方格 / 横条 / 标题 */
export type CellLayoutKind = 'tile' | 'bar' | 'header';

/** 图标位置 */
export type IconPos = 'none' | 'top' | 'left';

/** 每格可覆盖的布局样式（全可选，未填则取预设默认值） */
export interface CellLayoutStyle {
    /** 形态；省略时由 type 推导 */
    kind?: CellLayoutKind;
    /** 占用列数（仅对 tile 有意义的提示；bar/header 强制整行） */
    span?: number;
    /** 格子像素宽（省略取预设） */
    width?: number;
    /** 格子像素高（省略取预设；bar 会按文本自适应覆盖） */
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
    /** 图标位置（仅 tile 支持 top；bar 不显示图标） */
    iconPos?: IconPos;
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
    iconPos: IconPos;
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
        iconPos: 'none',
    };
}

/** 横条预设（整行满宽 = barWidth，左对齐可换行；高度按文本自适应） */
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
        iconPos: 'none',
    };
}

/** 标题预设（整行满宽，居中小字号弱色，用于分组标题） */
function headerPreset(ctx: CellLayoutContext): Omit<ResolvedCellLayout, 'kind'> {
    return {
        span: ctx.columns,
        width: ctx.barWidth,
        height: 56,
        fontSize: 18,
        lineHeight: 24,
        align: 'center',
        wrap: false,
        noTruncate: true,
        iconPos: 'none',
    };
}

/**
 * 估算横条高度：按 name 估算行数 × 行高 + 上下内边距，取与 barH 的较大值。
 * 解决多行文本（建造列表 名称\n需求\n描述、技能长描述等）被固定 120 高 CLAMP 裁切的问题。
 */
function estimateBarHeight(name: string, ctx: CellLayoutContext, fs: number, lh: number): number {
    const padX = 24;
    const padY = 16;
    const availW = Math.max(120, ctx.barWidth - padX);
    // 单行可容纳的「显示单位」数：中文=1 单位（≈ fs 像素宽），英文/数字=0.5 单位（≈ fs/2）
    const perLineUnits = Math.max(1, Math.floor(availW / (fs * 0.95)));
    let lines = 0;
    for (const seg of (name || '').split('\n')) {
        let units = 0;
        for (const ch of seg) {
            const c = ch.charCodeAt(0);
            const u = (c > 0x4e00 && c < 0x9fff) || (c > 0xff00 && c < 0xffef) ? 1 : 0.5;
            units += u;
        }
        lines += Math.max(1, Math.ceil(units / perLineUnits));
    }
    const textH = lines * lh;
    return Math.max(ctx.barH, textH + padY * 2);
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
    // 防御：未知字符串兜底为 tile
    if (kind !== 'tile' && kind !== 'bar' && kind !== 'header') kind = 'tile';

    // 2) 取预设基线
    const base = kind === 'bar' ? barPreset(ctx)
        : kind === 'header' ? headerPreset(ctx)
        : tilePreset(ctx);

    // 3) 应用覆盖
    const width = ov.width ?? base.width;
    const fontSize = ov.fontSize ?? base.fontSize;
    const lineHeight = ov.lineHeight ?? base.lineHeight;
    const align = ov.align ?? base.align;
    const wrap = ov.wrap ?? base.wrap;
    const noTruncate = ov.noTruncate ?? data.noTruncate ?? base.noTruncate;
    const span = ov.span ?? base.span;
    const iconPos = ov.iconPos ?? base.iconPos;

    // 4) 高度：bar 按文本自适应；header/tile 用预设（除非显式覆盖）
    let height = ov.height ?? base.height;
    if (kind === 'bar' && ov.height == null) {
        height = estimateBarHeight(data.name || '', ctx, fontSize, lineHeight);
    }

    return { kind, span, width, height, fontSize, lineHeight, align, wrap, noTruncate, iconPos };
}
