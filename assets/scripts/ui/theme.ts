/**
 * theme.ts - 全局统一风格中枢
 *
 * 所有颜色 / 尺寸 / 间距 / 按钮预设集中在此，一处修改全局生效。
 * 页面与弹窗只从这里取用，禁止再写 `new Color(...)` 字面量（特殊场景用预设 + 局部覆盖）。
 *
 * 使用约定：
 *   - 颜色：import { C } from './theme'  →  C.panelBg / C.body / C.accent ...
 *   - 尺寸：import { S } from './theme'  →  S.panelRadius / S.optionH ...
 *   - 按钮：import { Btn } from './theme' →  Btn.primary / Btn.confirm（含 bg/border/text/radius）
 *           特殊按钮：const myStyle = { ...Btn.primary, bg: 自定 } 后传给 mkBtn(...)
 */

import { Color } from 'cc';

// ══════════ 颜色（唯一真相源）═════════
export const C = {
    // ── 面板 / 容器 ──
    panelBg:    new Color(255, 248, 240, 255),
    panelBorder:new Color(200, 168, 130, 255),
    infoBg:     new Color(245, 240, 230, 255),   // 信息区浅底（导航页背景）
    white:      new Color(255, 252, 245, 255),

    // ── 文字 ──
    title: new Color(92, 61, 30, 255),
    body:  new Color(50, 40, 30, 255),
    sub:   new Color(120, 100, 80, 255),
    brown: new Color(74, 55, 40, 255),   // 深棕（格子名 / 底栏文字）
    warn:  new Color(180, 70, 50, 255),
    danger:new Color(200, 50, 40, 255),

    // ── 主题强调色 ──
    accent:  new Color(196, 132, 64, 255),
    accentDeep: new Color(150, 95, 45, 255),         // 主按钮深底（白字 ≈5.3:1，达 AA；原 accent 白字仅 3.1:1）
    accent2: new Color(76, 128, 72, 255),
    tabOn:   new Color(210, 162, 110, 255),
    tabOff:  new Color(228, 218, 205, 255),

    // ── 滑块 / 进度 ──
    track:  new Color(216, 206, 190, 255),
    fill:   new Color(200, 140, 70, 255),
    handle: new Color(120, 80, 50, 255),
    btnBorder: new Color(150, 110, 70, 200),   // 通用按钮描边

    // ── 状态 / 禁用 ──
    disabled: new Color(175, 170, 163, 255),
    disabledBg:    new Color(216, 212, 206, 255),   // 禁用态浅灰底
    disabledText:  new Color(102, 98, 93, 255),      // 禁用态深灰字（与 disabledBg 对比 ≈4.1:1，≥3:1）
    disabledBorder:new Color(190, 185, 178, 255),    // 禁用态灰描边
    dangerBorder:  new Color(140, 80, 40, 255),      // danger 按钮描边（原 theme.ts:168 硬编码，收口到 token）

    // ── 遮罩 / 关闭 ──
    maskDim:     new Color(0, 0, 0, 180),
    closeBg:     new Color(200, 160, 130, 220),
    closeStroke: new Color(160, 120, 90, 255),

    // ── 弹窗选项行 ──
    optionBg:             new Color(245, 235, 218, 255),
    optionBgDisabled:     new Color(225, 220, 215, 255),
    optionStroke:         new Color(210, 185, 145, 255),
    optionStrokeDisabled: new Color(190, 185, 180, 255),
    optionText:           new Color(60, 45, 30, 255),
    optionTextDisabled:   new Color(150, 145, 140, 255),

    // ── 格子（导航页 / 背包）──
    cellBg:          new Color(245, 238, 225, 255),
    cellBgDisabled:  new Color(225, 220, 212, 255),
    cellStroke:      new Color(200, 180, 155, 255),
    cellStrokeDisabled: new Color(190, 185, 175, 255),
    cellSelectedBg:   new Color(237, 232, 213, 255),  // 暖杏（#EDE8D5）：统一选中态，原浅蓝 230,245,255 与暖色主题冲突
    cellSelectedStroke:new Color(201, 184, 122, 255),  // 金描边（#C9B87A）：与 GridComponent 暖杏金一致
    cellCooldownBg:   new Color(245, 235, 220, 255),
    cellCooldownStroke:new Color(200, 190, 165, 255),
    cellText:        new Color(74, 55, 40, 255),
    cellTextDisabled:new Color(90, 85, 80, 255),
    cellCount:       new Color(150, 110, 70, 255),
    cellIconBg:      new Color(196, 158, 110, 255),  // 图标块底色（暖棕）
    cellIconText:    new Color(255, 250, 240, 255),  // 图标文字（米白）

    // ── 耐久进度条 ──
    durTrack: new Color(214, 204, 192, 255),
    durText:  new Color(100, 75, 50, 255),
    durHigh:  new Color(96, 168, 96, 255),
    durMid:   new Color(216, 168, 64, 255),
    durLow:   new Color(200, 80, 70, 255),

    // ── 底栏按钮 ──
    barBg:       new Color(255, 248, 240, 255),
    barBorder:   new Color(200, 168, 130, 255),
    barBtnBg:    new Color(230, 220, 205, 255),
    barBtnBorder:new Color(180, 160, 130, 255),
    barBtnText:  new Color(74, 55, 40, 255),

    // ── 滚动条 ──
    scrollHandle: new Color(180, 160, 130, 160),

    // ── 存档指示器 ──
    saveBg:      new Color(255, 248, 240, 150),
    saveBorder:  new Color(200, 168, 130, 180),

    // ── 战斗（专用，可覆盖）──
    battleBg:       new Color(250, 242, 230, 255),  // 浅米黄不透明战斗底（与全游戏米黄主题一致）
    battleSep:      new Color(180, 140, 100, 200),
    battleLogMask:  new Color(240, 232, 220, 255),  // 日志区浅底（在浅背景上不突兀）
    battleTitle:    new Color(160, 30, 30, 255),
    hpEnemy:        new Color(200, 60, 40, 255),
    hpPlayer:       new Color(60, 180, 60, 255),
    win:            new Color(40, 140, 40, 255),
    lose:           new Color(200, 40, 40, 255),
    actAttack:      new Color(200, 60, 40),         // 行动按钮描边色（细线，不整块填充）
    actSkill:       new Color(60, 120, 200),
    actItem:        new Color(60, 160, 80),
    actFlee:        new Color(150, 150, 150),

    // ── 战斗（扩展，统一此处，禁止面板内写 new Color 字面量）──
    hpTrack:        new Color(80, 70, 60, 200),     // HP 条底槽（深棕，浅背景上可见）
    battleName:     new Color(90, 60, 40, 255),     // 怪物名 / 「玩家」标签（深棕）
    battleLabel:    new Color(110, 90, 75, 255),    // HP 数值等次级文字（深灰）
    battleLogText:  new Color(90, 70, 50, 255),     // 战斗日志文字（深棕）
    btnActionBg:    new Color(210, 175, 130, 255),  // 行动按钮低饱和暖底色
    battleActBorder:new Color(140, 90, 60, 255),    // 行动按钮描边（深棕，3px）

    // ── 层次 / 深度（P2-A1）──
    shadow:      new Color(70, 45, 25, 55),         // 真实投影（仅未遮罩表面可用：HUD/侧栏）
    sheen:       new Color(255, 255, 255, 95),      // 内侧高光描边（所有表面通用，不被 Mask 裁）
    divider:     new Color(216, 200, 178, 255),     // 分隔线
    focus:       new Color(110, 165, 220, 255),     // 焦点 / 悬停描边（桌面态）
    panelTop:    new Color(255, 252, 246, 255),     // 面板顶部提亮（伪渐变上沿）
};

// ══════════ 尺寸 / 间距 token（魔法数字集中地）═════════
export const S = {
    screenW: 750,
    screenH: 1334,

    panelRadius: 16,
    panelBorderW: 3,

    btnRadius: 14,
    btnBorderW: 2,

    optionH: 70,
    optionGap: 8,
    optionRadius: 8,
    optionTopPad: 36,
    optionBotPad: 24,

    cellRadius: 8,
    cellGap: 12,

    barH: 96,

    /** 弹窗内容区左右留边（统一「内容左右留边」模板，P1-L5）。所有弹窗内容宽 = panelW - 2*contentPadX */
    contentPadX: 24,

    /** 真实投影竖向偏移（仅未被 Mask 裁掉的表面：HUD / 侧栏）。弹窗/格子在 Mask 内，投影会被裁，故用 sheen 代替 */
    shadowOffY: 6,
    shadowRadius: 14,

    font: {
        title: 28,
        body: 20,
        sub: 18,
        cellName: 20,
        cellCount: 17,
        option: 22,
        button: 24,
        durText: 16,   // P0×4：耐久数值下限 ≥16 设计 px（原 10 ≈5pt，挤成一团不可读）
    },
};

// ══════════ 字号层级 type scale（P2-A3）═════════
// 用统一层级拉开标题/正文/辅助对比，避免散落 fontSize 字面量。消费方取 size/color/bold。
export const T = {
    title:    { size: 30, color: C.title, bold: true },
    heading:  { size: 25, color: C.title, bold: true },
    subtitle: { size: 22, color: C.sub,   bold: false },
    body:     { size: 20, color: C.body,  bold: false },
    caption:  { size: 16, color: C.sub,   bold: false },
};

// ══════════ 按钮样式预设（特殊场景用 {...预设, bg: 自定} 覆盖）═════════
export interface BtnStyle {
    bg: Color;
    border: Color;
    borderW: number;
    text: Color;
    radius: number;
    /** 文字尺寸（缺省按高度自适应，见 ModalPanel.mkBtn） */
    fontSize?: number;
}

export const Btn = {
    primary: { bg: C.accentDeep, border: C.btnBorder, borderW: S.btnBorderW, text: C.white, radius: S.btnRadius } as BtnStyle,
    confirm: { bg: C.accent2, border: C.btnBorder, borderW: S.btnBorderW, text: C.white, radius: S.btnRadius } as BtnStyle,
    neutral: { bg: C.tabOn,   border: C.btnBorder, borderW: S.btnBorderW, text: C.body,  radius: S.btnRadius } as BtnStyle,
    danger:  { bg: C.danger,  border: C.dangerBorder, borderW: S.btnBorderW, text: C.white, radius: S.btnRadius } as BtnStyle,
};

// ══════════ 弹窗选项行样式预设 ══════════
export const DialogOptionStyle = {
    bg: C.optionBg,
    bgDisabled: C.optionBgDisabled,
    stroke: C.optionStroke,
    strokeDisabled: C.optionStrokeDisabled,
    text: C.optionText,
    textDisabled: C.optionTextDisabled,
    radius: S.optionRadius,
    height: S.optionH,
    gap: S.optionGap,
};

// ══════════ 格子样式预设 ══════════
export const GridCellStyle = {
    bg: C.cellBg,
    bgDisabled: C.cellBgDisabled,
    stroke: C.cellStroke,
    strokeDisabled: C.cellStrokeDisabled,
    text: C.cellText,
    textDisabled: C.cellTextDisabled,
    radius: S.cellRadius,
};
