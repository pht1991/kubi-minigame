/**
 * 响应式布局配置（横屏桌面适配 B 方案的核心使能模块）
 *
 * 作用：把「当前设计分辨率 / 是否横屏」集中成一个运行时可读的单一真相源。
 * - MainScene.onLoad 依据运行平台写入（桌面浏览器=横屏 1280×720；手机/微信/移动端浏览器=竖屏 750×1334）。
 * - MainScene 外壳（状态栏/底栏/网格）与 GridComponent（列数推导）读取此处决定布局。
 *
 * 设计约束（铁律）：
 * - 手机 / 微信 / 移动端浏览器 必须保持原 750×1334 竖屏，像素级不变 → 已有构建零回归。
 * - 仅「桌面浏览器（sys.platform==='DESKTOP_BROWSER'）」切换为横屏。
 * - 本模块不依赖任何 Cocos 运行时，纯数据；由 MainScene 在 onLoad 早期写入。
 */
export const Layout = {
    /** 当前设计宽度（设计坐标系，FIXED_WIDTH 下=画布宽） */
    designW: 750,
    /** 当前设计高度（参考值；FIXED_WIDTH 下实际可见高度随窗口纵横比自适应） */
    designH: 1334,
    /** 是否横屏桌面模式（桌面浏览器才为 true） */
    landscape: false,
    /** 是否浏览器（WEB）平台 —— 用于注入 HTML 顶栏让位逻辑（微信/编辑器=false） */
    isWeb: false,
    /**
     * Web 端注入的 HTML 顶栏高度（屏幕 CSS 像素）。
     * deploy-web.bat 会往 index.html 注入一个固定顶栏（约 38px），
     * 它会盖住画布内的状态栏；MainScene 据此把状态栏下移到顶栏之下。
     */
    webNavTopPx: 44,
    /**
     * Web 顶栏高度换算成设计坐标后的值（由 MainScene.onLoad 写入，默认 0）。
     * ModalPanel 据此把弹窗面板钳制在「视口 − 顶栏让位」区域内并整体下移，
     * 避免弹窗标题被 HTML 顶栏盖住。微信/编辑器保持 0，零回归。
     */
    webNavInsetDesign: 0,
    /**
     * 壳层 UI 缩放系数（横屏专用）。
     * 竖屏 750 设计稿的状态栏/底栏/字号直接搬到 1280×720 横屏会显得笨重
     * （高度占屏比过大），横屏下统一乘以该系数压缩：
     * 状态栏高 120→72、底栏高 92→55、按钮 230×72→138×43、字号同步缩小。
     * 手机/微信保持 1，字节级零回归。
     */
    uiScale: 1,

    // ════ 横屏统一缩放 tokens（S1 规则层 · 见 docs/browser-adaptation.md）════
    // 竖屏全部为中性值（1 或 0=不启用）；横屏由 MainScene.onLoad 统一赋值。
    // 铁律 A：任何文件禁止再出现横屏专属魔法数，一律引用此处；调手感只改这里。

    /** 网格单元缩放（tileW/H、横条高、间距；竖屏 160 方格 → 横屏 96） */
    cellScale: 1,
    /** 格子内字号/行高缩放（cellLayout.fontScale） */
    fontScale: 1,
    /** 弹窗面板整体缩放（ModalPanel._fitPanel 乘数）、底栏按钮二段缩放 */
    modalScale: 1,
    /** 横条/列表条目最大宽；0 = 不钳制（竖屏），横屏钳到 460 防撑满整屏 */
    barMaxW: 0,
    /** 页脚列表宽；0 = 用竖屏默认 700 */
    footerW: 0,
    /** 页脚行高；0 = 用竖屏默认 70 */
    footerRowH: 0,
};
