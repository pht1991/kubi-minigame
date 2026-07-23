import { Node, UITransform, Graphics, NodeEventType, EventTouch, Vec3 } from 'cc';
import { C } from './ModalPanel';
import { UIShape } from './widgets';

/**
 * QSlider.ts - 通用横向数量选择滑块（公共组件）
 *
 * 从 TradePanel 私有内部类抽离，供任意面板复用（购买 / 易物 / 批量消耗等
 * 需要「边调边看预览」的场景：滑动时实时回调 onChange 更新预览）。
 *
 * 用法：
 *   const s = new QSlider(parentNode, y, (v) => { ... });
 *   s.setRange(min, max, val);
 *   s.value;        // 当前值
 *   s.destroy();    // 释放节点
 */

export class QSlider {
    public node: Node;
    private fillGfx: Graphics;
    private handleNode: Node;
    private _min = 1;
    private _max = 1;
    private _value = 1;
    private _onChange: (v: number) => void;
    private readonly W = 480;
    private readonly H = 44;

    constructor(parent: Node, y: number, onChange: (v: number) => void) {
        this._onChange = onChange;
        this.node = new Node('Slider');
        const t = this.node.addComponent(UITransform);
        t.setContentSize(this.W, this.H + 16);
        t.setAnchorPoint(0.5, 0.5);
        this.node.setPosition(0, y, 0);
        this.node.setParent(parent);

        const track = new UIShape('Trk').rect(this.W, this.H, C.track, this.H / 2);
        track.pos(0, 0).mount(this.node);

        const fn = new Node('Fl');
        const ftu = fn.addComponent(UITransform);
        ftu.setContentSize(this.W, this.H); ftu.setAnchorPoint(0.5, 0.5);
        fn.setPosition(0, 0, 0); fn.setParent(track.node);
        this.fillGfx = fn.addComponent(Graphics);

        this.handleNode = new Node('Hdl');
        const ht = this.handleNode.addComponent(UITransform);
        ht.setContentSize(40, 40); ht.setAnchorPoint(0.5, 0.5);
        this.handleNode.setParent(track.node);
        const hg = this.handleNode.addComponent(Graphics);
        hg.fillColor = C.handle; hg.circle(0, 0, 20); hg.fill();
        hg.lineWidth = 2; hg.strokeColor = C.white; hg.circle(0, 0, 20); hg.stroke();

        track.node.on(NodeEventType.TOUCH_START, (e) => this._onT(e), this);
        track.node.on(NodeEventType.TOUCH_MOVE, (e) => this._onT(e), this);
        track.node.on(NodeEventType.TOUCH_END, () => this._onChange(this._value), this);
        track.node.on(NodeEventType.TOUCH_CANCEL, () => this._onChange(this._value), this);
    }

    setRange(min: number, max: number, val: number): void {
        this._min = Math.max(1, min); this._max = Math.max(this._min, max);
        this._value = Math.min(this._max, Math.max(this._min, val)); this._draw();
    }
    get value(): number { return this._value; }
    setValue(v: number): void { this.setRange(this._min, this._max, v); }

    private _onT(e: EventTouch): void {
        const loc = e.getUILocation();
        const local = this.node.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(loc.x, loc.y, 0));
        const ratio = Math.min(1, Math.max(0, (local.x + this.W / 2) / this.W));
        this._value = Math.round(this._min + ratio * (this._max - this._min));
        this._draw(); this._onChange(this._value);
    }
    private _draw(): void {
        const r = this._max > this._min ? (this._value - this._min) / (this._max - this._min) : 0;
        const hx = -this.W / 2 + r * this.W;
        this.handleNode.setPosition(hx, 0, 0);
        this.fillGfx.clear(); this.fillGfx.fillColor = C.fill;
        const fw = this.W / 2 + hx;
        if (fw > 0.5) { this.fillGfx.roundRect(-this.W / 2, -this.H / 2, fw, this.H, Math.min(this.H / 2, fw / 2)); this.fillGfx.fill(); }
    }
    destroy(): void { this.node.destroy(); }
}
