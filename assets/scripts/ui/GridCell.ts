/**
 * GridCell.ts - 网格格子组件
 * 绑定到 GridCell 预制体，显示单个格子内容
 */

import { _decorator, Component, Node, Label, Sprite, UIOpacity, Vec3, tween, Color, UITransform, Graphics, Widget } from 'cc';
import { GridCellData } from '../data/types';
import { C } from './theme';

const { ccclass, property } = _decorator;

@ccclass('GridCell')
export class GridCell extends Component {
    @property(Label)
    nameLabel: Label | null = null;

    @property(Label)
    countLabel: Label | null = null;

    @property(Sprite)
    iconSprite: Sprite | null = null;

    @property(Sprite)
    borderSprite: Sprite | null = null;

    @property(Node)
    badgeNode: Node | null = null;

    @property(Node)
    newBadgeNode: Node | null = null;

    @property(Node)
    cooldownMask: Node | null = null;

    private _data: GridCellData | null = null;
    private _onClick: ((cell: GridCell) => void) | null = null;
    private _onLongPress: ((cell: GridCell) => void) | null = null;
    private _longPressTimer: any = null;
    /** 红色「新」badge（运行时动态创建，避免依赖 prefab 配置） */
    private _newBadge: Node | null = null;

    /** 设置格子数据 */
    setData(data: GridCellData): void {
        this._data = data;
        this.refresh();
    }

    /** 获取格子数据 */
    get data(): GridCellData | null {
        return this._data;
    }

    /** 设置点击回调 */
    setOnClick(callback: (cell: GridCell) => void): void {
        this._onClick = callback;
    }

    /** 设置长按回调 */
    setOnLongPress(callback: (cell: GridCell) => void): void {
        this._onLongPress = callback;
    }

    /** 刷新显示 */
    refresh(): void {
        if (!this._data) return;
        const d = this._data;
        const isList = d.type === 'list';

        // ── 背景色（按状态分层，统一取自主题） ──
        const bgColors: Record<string, Color> = {
            normal:   C.white,
            selected: C.cellSelectedBg,
            disabled: C.cellBgDisabled,
            cooldown: C.cellCooldownBg,
        };
        const bgColor = bgColors[d.state] || bgColors.normal;

        // ── 描边色 ──
        const outlineColors: Record<string, Color> = {
            normal:   C.cellStroke,
            selected: C.cellSelectedStroke,
            disabled: C.cellStrokeDisabled,
            cooldown: C.cellCooldownStroke,
        };
        const outlineColor = outlineColors[d.state] || outlineColors.normal;

        // ── 文字色（全部不透明，确保可读性） ──
        const textColor = d.state === 'disabled' ? C.cellTextDisabled : C.cellText;

        // 绘制矩形背景 + 描边（Cocos 3.8 Graphics 不支持 roundRect，使用 rect 替代）
        this.drawCellBg(bgColor, outlineColor);

        // borderSprite 作为备用底衬（容错，避免获取失败中断 refresh）
        if (this.borderSprite) {
            try {
                if (!this.borderSprite.spriteFrame) {
                    // 无法可靠获取白色纹理，依赖 Graphics 绘制即可
                }
                if (this.borderSprite.spriteFrame) {
                    this.borderSprite.color = bgColor;
                }
            } catch (e) {
                // 忽略，Graphics 已绘制背景
            }
        }

        // ---- 文字设置 ----
        if (this.nameLabel) {
            // 列表模式先做长度截断防溢出（CLAMP+换行对超长文本仍可能溢出）
            // noTruncate 标志位区分：方形网格的 list 行需截断，长条富文本行（地图详情等）不截断
            let displayName = d.name;
            if (isList && !d.noTruncate) {
                displayName = this.truncateForList(displayName);
            }
            this.nameLabel.string = displayName;
            this.nameLabel.color = textColor;
            // 列表类型：左对齐 + 较小字号 + 自动换行
            if (isList) {
                // 用硬编码常量（与 GridComponent 的 effCellW=660 / effCellH=120 保持一致）
                const LIST_W = 660;
                const LIST_H = 120;
                this.nameLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
                this.nameLabel.verticalAlign = Label.VerticalAlign.TOP;
                this.nameLabel.fontSize = 20;
                this.nameLabel.overflow = Label.Overflow.CLAMP; // CLAMP 模式下对齐生效
                this.nameLabel.enableWrapText = true;          // 启用自动换行
                this.nameLabel.lineHeight = 26;                // 行高稍大于字号

                // 把 nameLabel 区域撑满格子（留内边距），锚点居中、位置归零
                const nameTf = this.nameLabel.node.getComponent(UITransform);
                if (nameTf) {
                    nameTf.setAnchorPoint(0.5, 0.5);
                    nameTf.setContentSize(LIST_W - 24, LIST_H - 20); // 636 × 100
                }
                // 注意：setPosition 是 Node 的方法，UITransform 没有该方法，必须挂在 node 上
                this.nameLabel.node.setPosition(0, 0, 0);
            } else {
                // 默认居中（还原 Widget + 恢复 prefab 原始布局）
                const widget = this.nameLabel.node.getComponent(Widget);
                if (widget) widget.enabled = false;
                this.nameLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
                this.nameLabel.verticalAlign = Label.VerticalAlign.CENTER;
                this.nameLabel.fontSize = 22;
                const nt = this.nameLabel.node.getComponent(UITransform);
                if (nt) {
                    nt.setAnchorPoint(0.5, 0.5);
                    nt.setContentSize(40, 50.4);
                }
                this.nameLabel.node.setPosition(0, -5, 0); // 恢复 prefab 原始位置
            }
        }

        // 列表模式下隐藏 countLabel/badge/cooldownMask（信息已在 name 里展示）
        if (isList) {
            if (this.countLabel) this.countLabel.node.active = false;
            if (this.badgeNode) this.badgeNode.active = false;
            if (this.cooldownMask) this.cooldownMask.active = false;
        } else {
            if (this.countLabel) {
                this.countLabel.string = d.count != null && d.count > 1 ? `×${d.count}` : '';
                this.countLabel.node.active = d.count != null && d.count > 1;
                if (d.count != null && d.count > 1) {
                    this.countLabel.color = C.cellCount;
                }
            }
            if (this.badgeNode) {
                this.badgeNode.active = !!d.badge;
            }
            if (this.cooldownMask) {
                this.cooldownMask.active = d.state === 'cooldown';
            }
        }

        // 红色「新」badge（地图未探索地点等）：默认隐藏，按需显示
        if (this._newBadge) this._newBadge.active = false;
        if (d.isNew) {
            const badge = this.ensureNewBadge();
            if (badge) badge.active = true;
        }

        this.applyState(d.state || 'normal');
    }

    /** 懒创建红色「新」badge（右上角，红底白字「新」） */
    private ensureNewBadge(): Node | null {
        if (this._newBadge) return this._newBadge;
        const w = this.node.getComponent(UITransform)?.width || 160;
        const h = this.node.getComponent(UITransform)?.height || 160;

        const node = new Node('NewBadge');
        node.layer = this.node.layer;
        const tf = node.addComponent(UITransform);
        tf.setContentSize(48, 28);
        tf.setAnchorPoint(1, 1);                  // 右上角锚点
        node.setPosition(w / 2 - 8, h / 2 - 8, 0); // 贴右上角内缩

        // 红底圆角
        const g = node.addComponent(Graphics);
        g.fillColor = C.danger;
        g.roundRect(-24, -14, 48, 28, 7);
        g.fill();

        // 「新」白字（居中）
        const lblNode = new Node('NewLbl');
        lblNode.parent = node;
        const ltf = lblNode.addComponent(UITransform);
        ltf.setContentSize(48, 28);
        ltf.setAnchorPoint(0.5, 0.5);
        const lbl = lblNode.addComponent(Label);
        lbl.string = '新';
        lbl.fontSize = 17;
        lbl.color = C.white;
        lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
        lbl.verticalAlign = Label.VerticalAlign.CENTER;
        lbl.overflow = Label.Overflow.CLAMP;

        this.node.addChild(node);
        node.setSiblingIndex(this.node.children.length - 1);
        this._newBadge = node;
        return node;
    }

    /** 用 Graphics 绘制矩形背景 + 描边（Cocos 3.8 不支持 roundRect） */
    private drawCellBg(bgColor: Color, outlineColor: Color): void {
        let gfx = this.node.getComponent(Graphics);
        if (!gfx) {
            gfx = this.node.addComponent(Graphics);
        }

        const w = this.node.getComponent(UITransform)?.width || 160;
        const h = this.node.getComponent(UITransform)?.height || 160;
        const lw = 2;

        gfx.clear();

        // 填充
        gfx.fillColor = bgColor;
        gfx.rect(-w / 2, -h / 2, w, h);
        gfx.fill();

        // 描边
        gfx.strokeColor = outlineColor;
        gfx.lineWidth = lw;
        gfx.rect(-w / 2, -h / 2, w, h);
        gfx.stroke();
    }

    /**
     * 列表模式文字截断防溢出
     * 列表格宽 636px、fontSize 20、约每行 31 个中文字；
     * 标签区高 100px、lineHeight 26 → 约 3.8 行可用；
     * 阈值按 4 行估算（~124 中文字宽度），留换行余量后设为 110
     */
    private truncateForList(text: string): string {
        if (!text) return text;
        // 计算文本显示宽度（中文=2，英文/数字/符号=1）
        let w = 0;
        for (let i = 0; i < text.length; i++) {
            const c = text.charCodeAt(i);
            w += (c > 0x4e00 && c < 0x9fff) || (c > 0xff00 && c < 0xffef) ? 2 : 1;
        }
        const MAX_W = 110; // 阈值（约 4 行，覆盖常见 3 行列表内容如建造/背包详情）
        if (w <= MAX_W) return text;
        // 从末尾截断到阈值范围内，追加省略号
        let cut = 0;
        w = 0;
        for (let i = 0; i < text.length; i++) {
            const c = text.charCodeAt(i);
            const cw = (c > 0x4e00 && c < 0x9fff) || (c > 0xff00 && c < 0xffef) ? 2 : 1;
            if (w + cw + 1 > MAX_W - 2) break; // -2 为 "…" 的宽度
            w += cw;
            cut = i + 1;
        }
        return text.slice(0, cut) + '…';
    }

    /** 应用状态样式（禁用状态不再降低整体透明度，避免文字看不清） */
    private applyState(state: string): void {
        const opacity = this.node.getComponent(UIOpacity) || this.node.addComponent(UIOpacity);
        switch (state) {
            case 'disabled':
                opacity.opacity = 255; // 保持完全不透明，颜色差异已足够区分
                break;
            case 'selected':
                opacity.opacity = 255;
                break;
            default:
                opacity.opacity = 255;
        }
    }

    /** 点击动画反馈 */
    playClickAnim(): void {
        const scale = this.node.scale;
        tween(this.node)
            .to(0.08, { scale: new Vec3(scale.x * 0.92, scale.y * 0.92, scale.z) })
            .to(0.08, { scale: new Vec3(scale.x, scale.y, scale.z) })
            .start();
    }

    // ===== 触摸事件（由 GridComponent 统一绑定，这里提供接口）=====

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
}
