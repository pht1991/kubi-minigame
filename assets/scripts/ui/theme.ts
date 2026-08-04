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
    cellSelectedBg:   new Color(230, 245, 255, 255),
    cellSelectedStroke:new Color(120, 180, 230, 255),
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
    battleBg:       new Color(20, 15, 10, 230),
    battleSep:      new Color(180, 140, 100, 200),
    battleLogMask:  new Color(40, 35, 30, 180),
    battleTitle:    new Color(160, 30, 30, 255),
    hpEnemy:        new Color(200, 60, 40, 255),
    hpPlayer:       new Color(60, 180, 60, 255),
    win:            new Color(40, 140, 40, 255),
    lose:           new Color(200, 40, 40, 255),
    actAttack:      new Color(200, 60, 40),
    actSkill:       new Color(60, 120, 200),
    actItem:        new Color(60, 160, 80),
    actFlee:        new Color(150, 150, 150),
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

    font: {
        title: 28,
        body: 20,
        sub: 18,
        cellName: 20,
        cellCount: 17,
        option: 22,
        button: 24,
        durText: 10,
    },
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
    primary: { bg: C.accent,  border: C.btnBorder, borderW: S.btnBorderW, text: C.white, radius: S.btnRadius } as BtnStyle,
    confirm: { bg: C.accent2, border: C.btnBorder, borderW: S.btnBorderW, text: C.white, radius: S.btnRadius } as BtnStyle,
    neutral: { bg: C.tabOn,   border: C.btnBorder, borderW: S.btnBorderW, text: C.body,  radius: S.btnRadius } as BtnStyle,
    danger:  { bg: C.danger,  border: new Color(140, 80, 40, 255), borderW: S.btnBorderW, text: C.white, radius: S.btnRadius } as BtnStyle,
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
