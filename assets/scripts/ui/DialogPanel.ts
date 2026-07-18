import { _decorator, Component, Node, Label, UITransform, Color, Graphics, ScrollView, Mask } from 'cc';

const { ccclass } = _decorator;

export interface DialogOption {
    label: string;
    desc?: string;
    disabled?: boolean;
    data: any;
}

@ccclass('DialogPanel')
export class DialogPanel extends Component {
    private _maskNode: Node | null = null;
    private _panelNode: Node | null = null;
    private _titleLabel: Label | null = null;
    private _contentNode: Node | null = null;
    private _scrollView: ScrollView | null = null;
    private _panelGfx: Graphics | null = null;
    private _titleNode: Node | null = null;
    private _closeBtn: Node | null = null;
    private _scrollNode: Node | null = null;
    private _scrollT: UITransform | null = null;
    private _options: DialogOption[] = [];
    private _selectedIndex: number = -1;
    private _onSelect: ((data: any) => void) | null = null;
    private _onCancel: (() => void) | null = null;

    onLoad(): void {
        this.createUI();
    }

    private createUI(): void {
        // 全屏遮罩（点击关闭）—— 半透明暗色，更柔和
        this._maskNode = new Node('Mask');
        const maskT = this._maskNode.addComponent(UITransform);
        maskT.setContentSize(750, 1334);
        this._maskNode.setParent(this.node);
        const maskGfx = this._maskNode.addComponent(Graphics);
        maskGfx.fillColor = new Color(0, 0, 0, 90); // 更透明，减少压抑感
        maskGfx.rect(-375, -667, 750, 1334);
        maskGfx.fill();
        // 只有点击遮罩本身（非面板区域）才关闭
        this._maskNode.on(Node.EventType.TOUCH_END, (event) => {
            if (event.target === this._maskNode) {
                event.propagationStopped = true; // 拦截，防止穿透到底层按钮(底栏/页面)
                this.hide();
            }
        });

        // 面板——暖白底 + 明显棕色边框，与主页风格统一
        this._panelNode = new Node('Panel');
        const panelT = this._panelNode.addComponent(UITransform);
        panelT.setContentSize(640, 900);
        panelT.setAnchorPoint(0.5, 0.5);
        this._panelNode.setPosition(0, 0, 0);
        this._panelNode.setParent(this.node);
        const panelGfx = this._panelNode.addComponent(Graphics);
        panelGfx.fillColor = new Color(255, 248, 240, 255); // 暖白
        panelGfx.rect(-320, -450, 640, 900);
        panelGfx.fill();
        panelGfx.lineWidth = 3;
        panelGfx.strokeColor = new Color(200, 168, 130, 255); // 暖棕边框
        panelGfx.rect(-320, -450, 640, 900);
        panelGfx.stroke();
        this._panelGfx = panelGfx;
        // 面板拦截事件，防止点击面板内部关闭弹窗
        this._panelNode.on(Node.EventType.TOUCH_END, (event) => {
            event.propagationStopped = true;
        });

        // 标题
        const titleNode = new Node('Title');
        const titleT = titleNode.addComponent(UITransform);
        titleT.setContentSize(560, 60);
        this._titleLabel = titleNode.addComponent(Label);
        this._titleLabel.fontSize = 32;
        this._titleLabel.lineHeight = 40;
        this._titleLabel.color = new Color(92, 61, 30, 255); // 深棕（与主页标题统一）
        this._titleLabel.string = '';
        titleNode.setPosition(-30, 415, 0);
        titleNode.setParent(this._panelNode);
        this._titleNode = titleNode;

        // 关闭按钮（×）
        const closeBtn = new Node('CloseBtn');
        const closeT = closeBtn.addComponent(UITransform);
        closeT.setContentSize(44, 44);
        closeBtn.setPosition(295, 420, 0);
        closeBtn.setParent(this._panelNode);
        this._closeBtn = closeBtn;
        const closeGfx = closeBtn.addComponent(Graphics);
        closeGfx.fillColor = new Color(200, 160, 130, 200);
        closeGfx.circle(0, 0, 20);
        closeGfx.fill();
        closeGfx.strokeColor = new Color(160, 120, 90, 255);
        closeGfx.lineWidth = 1.5;
        closeGfx.circle(0, 0, 20);
        closeGfx.stroke();
        const closeLbl = new Node('CloseLbl');
        closeLbl.setParent(closeBtn);
        const closeLblT = closeLbl.addComponent(UITransform);
        closeLblT.setContentSize(44, 44);
        const closeLblComp = closeLbl.addComponent(Label);
        closeLblComp.string = '×';
        closeLblComp.fontSize = 28;
        closeLblComp.color = new Color(255, 255, 255, 255);
        closeLblComp.isBold = true;
        closeBtn.on(Node.EventType.TOUCH_END, (event) => {
            event.propagationStopped = true;
            this.hide();
        });

        // 滚动视图（限制可视区域并支持滚动）
        const scrollNode = new Node('ScrollView');
        const scrollT = scrollNode.addComponent(UITransform);
        scrollT.setContentSize(600, 700);
        scrollT.setAnchorPoint(0.5, 1);
        scrollNode.setPosition(0, 340, 0);
        scrollNode.setParent(this._panelNode);
        this._scrollNode = scrollNode;
        this._scrollT = scrollT;

        // Mask 限制可视区域
        scrollNode.addComponent(Mask);

        // ScrollView 组件
        const scrollView = scrollNode.addComponent(ScrollView);
        scrollView.horizontal = false;
        scrollView.vertical = true;
        scrollView.inertia = true;
        scrollView.brake = 0.3;
        scrollView.elastic = true;
        scrollView.elasticBounceTime = 0.5;
        this._scrollView = scrollView;

        // 内容区域
        this._contentNode = new Node('Content');
        const contentT = this._contentNode.addComponent(UITransform);
        contentT.setContentSize(600, 700);
        contentT.setAnchorPoint(0.5, 1);
        this._contentNode.setPosition(0, 0, 0);
        this._contentNode.setParent(scrollNode);
        scrollView.content = this._contentNode;

        // 隐藏滚动条（保持简洁）
        scrollView.verticalScrollBar = null;
        scrollView.horizontalScrollBar = null;

        this.node.active = false;
    }

    /**
     * 根据内容高度自适应面板与滚动区域尺寸：
     * 选项少时面板收紧、底部不留大块空白；选项多时面板撑到上限并滚动。
     * @returns 实际滚动可视区高度（用于内容节点撑高）
     */
    private updateLayout(contentTotal: number): number {
        const titleReserve = 110;   // 顶部给标题预留的高度
        const bottomReserve = 30;   // 滚动区底部距面板底边的间距
        const minScrollH = 200;
        const minPanelH = 300;
        const maxPanelH = 900;

        const scrollH = Math.max(contentTotal, minScrollH);
        let panelH = titleReserve + scrollH + bottomReserve;
        if (panelH < minPanelH) panelH = minPanelH;
        if (panelH > maxPanelH) panelH = maxPanelH;
        const actualScrollH = Math.min(scrollH, panelH - titleReserve - bottomReserve);

        // 面板尺寸 + 重绘边框
        const panelT = this._panelNode ? this._panelNode.getComponent(UITransform) : null;
        if (panelT) panelT.setContentSize(640, panelH);
        if (this._panelGfx) {
            this._panelGfx.clear();
            this._panelGfx.fillColor = new Color(255, 248, 240, 255);
            this._panelGfx.rect(-320, -panelH / 2, 640, panelH);
            this._panelGfx.fill();
            this._panelGfx.lineWidth = 3;
            this._panelGfx.strokeColor = new Color(200, 168, 130, 255);
            this._panelGfx.rect(-320, -panelH / 2, 640, panelH);
            this._panelGfx.stroke();
        }

        // 标题 / 关闭按钮随面板顶边下移
        const topY = panelH / 2 - 40;
        if (this._titleNode) this._titleNode.setPosition(-30, topY, 0);
        if (this._closeBtn) this._closeBtn.setPosition(295, topY, 0);

        // 滚动区从标题下方开始，高度撑满到面板底边附近
        if (this._scrollT) this._scrollT.setContentSize(600, actualScrollH);
        if (this._scrollNode) this._scrollNode.setPosition(0, panelH / 2 - titleReserve, 0);

        return actualScrollH;
    }

    show(title: string, options: DialogOption[], onSelect: (data: any) => void, onCancel?: () => void): void {
        this._options = options;
        this._selectedIndex = -1;
        this._onSelect = onSelect;
        this._onCancel = onCancel || null;

        if (this._titleLabel) {
            this._titleLabel.string = title;
        }

        this.renderOptions();
        this.node.active = true;
        // 置顶：确保盖在背包弹窗等其它面板之上
        this.node.setSiblingIndex(this.node.parent ? this.node.parent.children.length - 1 : 0);
    }

    hide(): void {
        this.node.active = false;
        if (this._onCancel) this._onCancel();
        this._onCancel = null;
        this._onSelect = null;
    }

    private renderOptions(): void {
        if (!this._contentNode) return;

        // 清除旧选项
        for (const child of [...this._contentNode.children]) {
            child.destroy();
        }

        const optionHeight = 70;
        const spacing = 8;
        const topPadding = 36;      // 首行与 content 顶部的间距
        const bottomPadding = 24;   // 末行与 content 底部的间距（避免滚动到底被遮挡）
        const totalHeight = this._options.length * (optionHeight + spacing) + spacing + topPadding + bottomPadding;

        // 自适应面板高度（消除底部大块空白）
        const actualScrollH = this.updateLayout(totalHeight);

        const contentT = this._contentNode.getComponent(UITransform);
        if (contentT) {
            contentT.setContentSize(600, Math.max(totalHeight, actualScrollH));
        }

        for (let i = 0; i < this._options.length; i++) {
            const opt = this._options[i];
            const rowNode = new Node(`Option_${i}`);
            const rowT = rowNode.addComponent(UITransform);
            rowT.setContentSize(580, optionHeight); // 左右留边距
            rowT.setAnchorPoint(0.5, 1);
            // 第一行从 topPadding 开始，向下排列
            rowNode.setPosition(0, -topPadding - i * (optionHeight + spacing), 0);
            rowNode.setParent(this._contentNode);

            // 背景 + 边框（使用同一 Graphics）
            const bg = new Node('Bg');
            const bgGfx = bg.addComponent(Graphics);
            const isDisabled = opt.disabled;
            // 背景色：normal 暖白，disabled 浅灰（全部不透明）
            const bgColor = isDisabled
                ? new Color(232, 228, 222, 255)
                : new Color(253, 248, 240, 255);
            bgGfx.fillColor = bgColor;
            bgGfx.rect(-290, -optionHeight / 2, 580, optionHeight);
            bgGfx.fill();
            // 描边
            bgGfx.lineWidth = 1;
            bgGfx.strokeColor = isDisabled
                ? new Color(200, 196, 190, 255)
                : new Color(212, 196, 176, 255);
            bgGfx.rect(-290, -optionHeight / 2, 580, optionHeight);
            bgGfx.stroke();
            bg.setParent(rowNode);

            // 文字（全部不透明，深灰/深棕确保可读性）
            const lbl = new Node('Label');
            const lblT = lbl.addComponent(UITransform);
            lblT.setContentSize(540, 60);
            lblT.setAnchorPoint(0, 0.5);
            lbl.setPosition(-260, 0, 0);
            const lblComp = lbl.addComponent(Label);
            lblComp.string = opt.label;
            lblComp.fontSize = 22;
            lblComp.lineHeight = 30;
            lblComp.color = isDisabled
                ? new Color(90, 85, 80, 255)   // 深灰（不透明）
                : new Color(50, 40, 30, 255); // 深棕（不透明）
            lbl.setParent(rowNode);

            if (!isDisabled) {
                // 使用 TOUCH_END 代替 TOUCH_START，避免手指滑动时误触
                rowNode.on(Node.EventType.TOUCH_END, (event) => {
                    event.propagationStopped = true; // 阻止冒泡到遮罩
                    this._selectedIndex = i;
                    if (this._onSelect) {
                        this._onSelect(this._options[i].data);
                    }
                    this.hide();
                });
            }
        }

        // 重置 content 位置到顶部（确保首行可见，避免 scrollToTop 在 view.anchorY=0.5 时计算错误）
        if (this._contentNode) {
            this._contentNode.setPosition(0, 0, 0);
        }
    }
}
