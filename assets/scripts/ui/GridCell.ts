/**
 * GridCell.ts - 网格格子组件（纯代码构建，无 prefab 依赖）
 *
 * 设计要点：
 * - 所有视觉节点在 onLoad() 中以代码形式构建，彻底杜绝 prefab 默认值残留。
 *   （之前因 NameLabel prefab width=40 + enableWrapText=true + 对象池复用，加上
 *    Label 内部 assembler 会按 string 设置时的属性缓存布局，导致主页 3 字中文
 *    被按字符强制换行成竖排）
 * - 不依赖外部 prefab 实例化，GridComponent 用 `new Node() + addComponent(GridCell)`
 *   即可生成；assets/prefabs/GridCell/ 可删除，整条链与 prefab 无关
 * - nameLabel/countLabel/badgeNode/cooldownMask/newBadge 子节点只在首次 onLoad 建好，
 *   refresh 只改属性、不重建——对象池复用安全
 * - refresh() 严格按「布局属性 → 尺寸 → string」顺序设置，确保 Label 按当前配置 relayout
 */

import { _decorator, Component, Node, Label, UIOpacity, Vec3, tween, Color, UITransform, Graphics } from 'cc';
import { GridCellData } from '../data/types';
import type { ResolvedCellLayout } from './cellLayout';
import { C } from './theme';

const { ccclass } = _decorator;

@ccclass('GridCell')
export class GridCell extends Component {
    // 子节点引用（onLoad 中创建）
    private _nameLabel: Label | null = null;
    private _nameTf: UITransform | null = null;
    private _countLabel: Label | null = null;
    private _badgeNode: Node | null = null;
    private _cooldownMask: Node | null = null;
    private _newBadge: Node | null = null;
    private _iconNode: Node | null = null;
    private _iconLabel: Label | null = null;
    private _bgGfx: Graphics | null = null;

    private _data: GridCellData | null = null;
    /** 由 GridComponent 在渲染时按每格解析后下发的最终布局（含像素宽高） */
    private _layout: ResolvedCellLayout | null = null;
    private _onClick: ((cell: GridCell) => void) | null = null;
    private _onLongPress: ((cell: GridCell) => void) | null = null;
    private _longPressTimer: any = null;
    private _built = false;

    onLoad(): void {
        if (this._built) return;
        this._built = true;
        this.buildNodes();
    }

    /** 构建子节点树（仅首次 onLoad 调用，对象池复用时不再调用） */
    private buildNodes(): void {
        const root = this.node;

        // root UITransform（若未存在则补一个 160×160 占位，GridComponent.renderCells
        // 会在挂载前调 setContentSize 覆盖）
        let rootTf = root.getComponent(UITransform);
        if (!rootTf) {
            rootTf = root.addComponent(UITransform);
            rootTf.setContentSize(160, 160);
            rootTf.setAnchorPoint(0.5, 0.5);
        }

        // 背景 Graphics（叠在 root 自身节点，子节点 Label 覆盖在上）
        this._bgGfx = root.addComponent(Graphics);

        // ── NameLabel（格子名字，3 字以内）──
        const nameNode = new Node('NameLabel');
        nameNode.layer = root.layer;
        nameNode.setParent(root);
        this._nameTf = nameNode.addComponent(UITransform);
        this._nameTf.setAnchorPoint(0.5, 0.5);
        this._nameTf.setContentSize(140, 50.4);
        nameNode.setPosition(0, -5, 0);
        this._nameLabel = nameNode.addComponent(Label);
        this._nameLabel.fontSize = 22;
        this._nameLabel.lineHeight = 28;
        this._nameLabel.overflow = Label.Overflow.NONE;
        this._nameLabel.enableWrapText = false;
        this._nameLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._nameLabel.verticalAlign = Label.VerticalAlign.CENTER;

        // ── CountLabel（右上角堆叠数 ×N）──
        const countNode = new Node('CountLabel');
        countNode.layer = root.layer;
        countNode.setParent(root);
        const ctf = countNode.addComponent(UITransform);
        ctf.setAnchorPoint(0.5, 0.5);
        ctf.setContentSize(40, 22);
        countNode.setPosition(60, 60, 0);
        this._countLabel = countNode.addComponent(Label);
        this._countLabel.fontSize = 17;
        this._countLabel.lineHeight = 20;
        this._countLabel.overflow = Label.Overflow.NONE;
        this._countLabel.enableWrapText = false;
        this._countLabel.horizontalAlign = Label.HorizontalAlign.RIGHT;
        this._countLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this._countLabel.color = C.cellCount;

        // ── Badge（红圆点「可操作」指示）──
        this._badgeNode = this.makeDot('Badge', 16, 65, 65, new Color(255, 0, 0, 255));

        // ── CooldownMask（灰色半透覆盖）──
        this._cooldownMask = this.makeOverlay('CooldownMask', new Color(187, 187, 187, 100));

        // ── NewBadge（红色「新」角标，默认隐藏）──
        this._newBadge = this.makeNewBadge();

        // ── Icon（彩色圆角块 + 居中文字，仅 layout.iconPos 指定时显示）──
        this._iconNode = this.makeIcon('Icon');
    }

    /** 创建图标块（圆角彩色底 + 居中文字，默认隐藏；文字取 data.icon 或 name 首字） */
    private makeIcon(name: string): Node {
        const node = new Node(name);
        node.layer = this.node.layer;
        node.setParent(this.node);
        const tf = node.addComponent(UITransform);
        tf.setAnchorPoint(0.5, 0.5);
        tf.setContentSize(60, 60);
        node.setPosition(0, 0, 0);

        const gfx = node.addComponent(Graphics);
        gfx.fillColor = C.cellIconBg;
        gfx.roundRect(-30, -30, 60, 60, 12);
        gfx.fill();

        const lblNode = new Node('L');
        lblNode.layer = this.node.layer;
        lblNode.setParent(node);
        const ltf = lblNode.addComponent(UITransform);
        ltf.setAnchorPoint(0.5, 0.5);
        ltf.setContentSize(60, 60);
        lblNode.setPosition(0, 0, 0);
        const lbl = lblNode.addComponent(Label);
        lbl.fontSize = 28;
        lbl.color = C.cellIconText;
        lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
        lbl.verticalAlign = Label.VerticalAlign.CENTER;
        lbl.overflow = Label.Overflow.CLAMP;
        this._iconLabel = lbl;

        node.active = false; // 默认隐藏
        return node;
    }

    /** 创建圆点（红点/状态点） */
    private makeDot(name: string, size: number, x: number, y: number, color: Color): Node {
        const node = new Node(name);
        node.layer = this.node.layer;
        node.setParent(this.node);
        const tf = node.addComponent(UITransform);
        tf.setContentSize(size, size);
        tf.setAnchorPoint(0.5, 0.5);
        node.setPosition(x, y, 0);
        const gfx = node.addComponent(Graphics);
        gfx.fillColor = color;
        gfx.circle(0, 0, size / 2);
        gfx.fill();
        return node;
    }

    /** 创建全尺寸半透覆盖层（覆盖整个格子用于冷却/禁用状态） */
    private makeOverlay(name: string, color: Color): Node {
        const node = new Node(name);
        node.layer = this.node.layer;
        node.setParent(this.node);
        const tf = node.addComponent(UITransform);
        const rootTf = this.node.getComponent(UITransform);
        const w = rootTf ? rootTf.width : 160;
        const h = rootTf ? rootTf.height : 160;
        tf.setContentSize(w, h);
        tf.setAnchorPoint(0.5, 0.5);
        node.setPosition(0, 0, 0);
        const gfx = node.addComponent(Graphics);
        gfx.fillColor = color;
        gfx.rect(-w / 2, -h / 2, w, h);
        gfx.fill();
        return node;
    }

    /** 创建右上角「新」角标（红底圆角白字「�"新」） */
    private makeNewBadge(): Node {
        const node = new Node('NewBadge');
        node.layer = this.node.layer;
        node.setParent(this.node);
        const tf = node.addComponent(UITransform);
        tf.setContentSize(48, 28);
        tf.setAnchorPoint(1, 1);
        const rootTf = this.node.getComponent(UITransform);
        const w = rootTf ? rootTf.width : 160;
        const h = rootTf ? rootTf.height : 160;
        node.setPosition(w / 2 - 8, h / 2 - 8, 0);

        const gfx = node.addComponent(Graphics);
        gfx.fillColor = C.danger;
        gfx.roundRect(-24, -14, 48, 28, 7);
        gfx.fill();

        // 白字「�"新」
        const lblNode = new Node('L');
        lblNode.layer = this.node.layer;
        lblNode.setParent(node);
        const ltf = lblNode.addComponent(UITransform);
        ltf.setContentSize(48, 28);
        ltf.setAnchorPoint(0.5, 0.5);
        lblNode.setPosition(0, 0, 0);
        const lbl = lblNode.addComponent(Label);
        lbl.string = '新';
        lbl.fontSize = 17;
        lbl.color = C.white;
        lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
        lbl.verticalAlign = Label.VerticalAlign.CENTER;
        lbl.overflow = Label.Overflow.CLAMP;

        node.active = false; // 默认隐藏
        return node;
    }

    // ═══ 公开 API（保持与原版接口兼容）═══

    /** 下发解析后的布局（须在 setData 之前调用，refresh 会按它排版） */
    setLayout(layout: ResolvedCellLayout): void {
        this._layout = layout;
    }

    setData(data: GridCellData): void {
        this._data = data;
        this.refresh();
    }

    get data(): GridCellData | null { return this._data; }

    setOnClick(callback: (cell: GridCell) => void): void {
        this._onClick = callback;
    }

    setOnLongPress(callback: (cell: GridCell) => void): void {
        this._onLongPress = callback;
    }

    /**
     * 刷新显示
     *
     * 顺序要点（关键，避免 Label assembler 缓存旧布局）：
     *   1. 设置布局属性（overflow/wrap/lineHeight/align）
     *   2. 设置 UITransform 尺寸（nameTf.setContentSize）
     *   3. 最后才赋值 string（强制按当前属性 relayout）
     */
    refresh(): void {
        if (!this._data) return;
        if (!this._built) this.buildNodes(); // 极端兜底（对象池复用未触发 onLoad）

        const d = this._data;
        // 形态优先取 GridComponent 下发的解析布局；缺失时回退到 type 推导（兼容旧路径）
        const L = this._layout
            ?? { kind: d.type === 'list' ? 'bar' : 'tile', span: 1, width: 160, height: 160,
                 fontSize: 22, lineHeight: 28, align: 'center', wrap: false, noTruncate: !!d.noTruncate, iconPos: 'none' };
        const isBar = L.kind === 'bar';
        const isHeader = L.kind === 'header';
        const isTile = !isBar && !isHeader;

        // ── 背景色（按状态分层，统一取自主题） ──
        const bgColors: Record<string, Color> = {
            normal:   C.white,
            selected: C.cellSelectedBg,
            disabled: C.cellBgDisabled,
            cooldown: C.cellCooldownBg,
        };
        const bgColor = bgColors[d.state] || bgColors.normal;

        const outlineColors: Record<string, Color> = {
            normal:   C.cellStroke,
            selected: C.cellSelectedStroke,
            disabled: C.cellStrokeDisabled,
            cooldown: C.cellCooldownStroke,
        };
        const outlineColor = outlineColors[d.state] || outlineColors.normal;

        const textColor = d.state === 'disabled' ? C.cellTextDisabled : C.cellText;

        this.drawCellBg(bgColor, outlineColor);

        // ── 名字 ──
        // 名字框尺寸单一像素来源：节点自身的 UITransform（由 GridComponent 按 L.width/height 设定）
        if (this._nameLabel && this._nameTf) {
            const cellTf = this.node.getComponent(UITransform);
            const cellW = cellTf ? cellTf.width : (L.width || 160);
            const cellH = cellTf ? cellTf.height : (L.height || 160);

            let displayName = d.name;
            if (isBar && !L.noTruncate) {
                displayName = this.truncateForList(displayName);
            }

            // 步骤 1：先改布局属性（字号/行高/对齐/溢出）
            this._nameLabel.fontSize = L.fontSize;
            this._nameLabel.lineHeight = L.lineHeight;
            const pad = isBar ? 12 : 8;
            if (isBar) {
                // 横条：左对齐 + 顶 + 可换行 + 裁切（高度已按文本自适应，不会裁切内容）
                this._nameLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
                this._nameLabel.verticalAlign = Label.VerticalAlign.TOP;
                this._nameLabel.overflow = Label.Overflow.CLAMP;
                this._nameLabel.enableWrapText = true;
            } else {
                // 方格 / 标题：居中单行
                this._nameLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
                this._nameLabel.verticalAlign = Label.VerticalAlign.CENTER;
                this._nameLabel.overflow = Label.Overflow.NONE;
                this._nameLabel.enableWrapText = false;
            }

            // 图标（仅方格 + iconPos top）：名字框缩小并下移，图标块置于上方
            const showIcon = isTile && L.iconPos === 'top';
            let nameW = cellW - pad * 2;
            let nameH = cellH - pad * 2;
            let nameY = 0;
            if (showIcon && this._iconNode) {
                const iconSize = 60;
                const reserved = iconSize + 6;
                nameH = Math.max(20, cellH - reserved - pad * 2);
                nameY = -(reserved) / 2;
                if (this._iconLabel) this._iconLabel.string = d.icon || (d.name ? d.name.charAt(0) : '');
                this._iconNode.setPosition(0, cellH / 2 - iconSize / 2 - 6, 0);
                this._iconNode.active = true;
            } else if (this._iconNode) {
                this._iconNode.active = false;
            }

            // 步骤 2：再改 UITransform 尺寸（名字框 = 格子内缩 pad）
            this._nameTf.setAnchorPoint(0.5, 0.5);
            this._nameTf.setContentSize(nameW, nameH);
            this._nameLabel.node.setPosition(0, nameY, 0);

            this._nameLabel.color = textColor;
            // 步骤 3：最后才赋值 string（Label 按当前属性重新布局）
            this._nameLabel.string = displayName;
        }

        // ── count / badge / cooldown 显隐 ──
        // 方格：右上角角标；横条：数量显示在右侧中部（修复列表模式隐藏数量的回归）
        if (this._countLabel) {
            const show = d.count != null && d.count > 1;
            this._countLabel.string = show ? `×${d.count}` : '';
            if (isBar) {
                const cellTf = this.node.getComponent(UITransform);
                const cellW = cellTf ? cellTf.width : (L.width || 160);
                this._countLabel.node.setPosition(cellW / 2 - 22, 0, 0);
            } else {
                this._countLabel.node.setPosition(60, 60, 0);
            }
            this._countLabel.node.active = show;
        }
        if (this._badgeNode) this._badgeNode.active = !isBar && !!d.badge;
        if (this._cooldownMask) this.setCooldownMask(this._cooldownMask, d.state === 'cooldown');

        // ── NewBadge（isNew 才显示） ──
        if (this._newBadge) this._newBadge.active = !!d.isNew;

        this.applyState(d.state || 'normal');
    }

    /** 设置冷却遮罩：按当前格子尺寸重绘（解决 bar 模式尺寸变化后遮罩不跟随） */
    private setCooldownMask(node: Node, on: boolean): void {
        node.active = on;
        if (!on) return;
        const rootTf = this.node.getComponent(UITransform);
        const w = rootTf ? rootTf.width : 160;
        const h = rootTf ? rootTf.height : 160;
        const tf = node.getComponent(UITransform);
        if (tf) tf.setContentSize(w, h);
        const g = node.getComponent(Graphics);
        if (g) {
            g.clear();
            g.fillColor = new Color(187, 187, 187, 100);
            g.rect(-w / 2, -h / 2, w, h);
            g.fill();
        }
    }

    /** 用 Graphics 绘制矩形背景 + 描边 */
    private drawCellBg(bgColor: Color, outlineColor: Color): void {
        if (!this._bgGfx) return;
        const w = this.node.getComponent(UITransform)?.width || 160;
        const h = this.node.getComponent(UITransform)?.height || 160;
        const lw = 2;

        this._bgGfx.clear();
        this._bgGfx.fillColor = bgColor;
        this._bgGfx.rect(-w / 2, -h / 2, w, h);
        this._bgGfx.fill();
        this._bgGfx.strokeColor = outlineColor;
        this._bgGfx.lineWidth = lw;
        this._bgGfx.rect(-w / 2, -h / 2, w, h);
        this._bgGfx.stroke();
    }

    /**
     * 列表模式文字截断防溢出
     * 列表格宽 636px、fontSize 20、约每行 31 个中文字；
     * 标签区高 100px、lineHeight 26 → 约 3.8 行可用；
     * 阈值按 4 行估算（~124 中文字宽度），留换行余量后设为 110
     */
    private truncateForList(text: string): string {
        if (!text) return text;
        let w = 0;
        for (let i = 0; i < text.length; i++) {
            const c = text.charCodeAt(i);
            w += (c > 0x4e00 && c < 0x9fff) || (c > 0xff00 && c < 0xffef) ? 2 : 1;
        }
        const MAX_W = 110;
        if (w <= MAX_W) return text;
        let cut = 0;
        w = 0;
        for (let i = 0; i < text.length; i++) {
            const c = text.charCodeAt(i);
            const cw = (c > 0x4e00 && c < 0x9fff) || (c > 0xff00 && c < 0xffef) ? 2 : 1;
            if (w + cw + 1 > MAX_W - 2) break;
            w += cw;
            cut = i + 1;
        }
        return text.slice(0, cut) + '…';
    }

    /** 应用状态样式 */
    private applyState(state: string): void {
        const opacity = this.node.getComponent(UIOpacity) || this.node.addComponent(UIOpacity);
        opacity.opacity = 255;
    }

    /** 点击动画反馈 */
    playClickAnim(): void {
        const scale = this.node.scale;
        tween(this.node)
            .to(0.08, { scale: new Vec3(scale.x * 0.92, scale.y * 0.92, scale.z) })
            .to(0.08, { scale: new Vec3(scale.x, scale.y, scale.z) })
            .start();
    }

    // ═══ 触摸事件（由 GridComponent 统一绑定，这里提供接口）═══

    /** 处理点击（由父容器调用） */
    handleClick(): void {
        if (!this._data || this._data.state === 'disabled') return;
        this.playClickAnim();
        if (this._onClick) this._onClick(this);
    }

    /** 处理长按（由父容器调用） */
    handleLongPress(): void {
        if (!this._data || this._data.state === 'disabled') return;
        if (this._onLongPress) this._onLongPress(this);
    }

    /** 开始长按检测 */
    startLongPressDetect(): void {
        this._longPressTimer = setTimeout(() => {
            this.handleLongPress();
            this._longPressTimer = null;
        }, 500);
    }

    /** 取消长按检测 */
    cancelLongPressDetect(): void {
        if (this._longPressTimer) {
            clearTimeout(this._longPressTimer);
            this._longPressTimer = null;
        }
    }

    /** 销毁时清理长按计时器，避免节点已销毁仍回调 handleLongPress */
    onDestroy(): void {
        this.cancelLongPressDetect();
    }
}