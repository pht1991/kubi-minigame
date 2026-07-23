/**
 * UINode.ts - 纯代码 UI 的基础包装（脱离 cc 编辑器）
 *
 * 把所有 cc 低层细节（Node / UITransform / 锚点 / 尺寸 / 父子关系）收敛到一个类，
 * 暴露链式、声明式的 API。所有上层组件（UILabel / UIButton / 布局容器）都继承它。
 *
 * 内建的 cc 坑（本项目血泪史总结）：
 *  - 每个 UINode 自带 UITransform（Graphics/Label 依赖它定位，缺则渲染异常）
 *  - 默认锚点 (0.5,0.5)，与「可点击节点居中绘制」铁律一致
 *  - 布局容器在 mount 时自动 layout()，子节点位置由容器算，业务不再写绝对 y
 */

import { Node, UITransform, NodeEventType, EventTouch } from 'cc';

export class UINode {
    readonly node: Node;
    protected _w = 0;
    protected _h = 0;
    protected _ax = 0.5;
    protected _ay = 0.5;

    /** 布局子节点列表（仅 UINode 实例被记录，供布局容器遍历） */
    protected _kids: UINode[] = [];

    constructor(name = 'UI') {
        this.node = new Node(name);
        this.node.addComponent(UITransform);
    }

    get ut(): UITransform { return this.node.getComponent(UITransform)!; }
    get w(): number { return this._w; }
    get h(): number { return this._h; }

    // ── 声明式尺寸 / 锚点 / 位置 ──
    size(w: number, h: number): this {
        this._w = w; this._h = h;
        this.ut.setContentSize(w, h);
        return this;
    }
    width(w: number): this { this._w = w; this.ut.setContentSize(w, this._h); return this; }
    height(h: number): this { this._h = h; this.ut.setContentSize(this._w, h); return this; }
    anchor(ax: number, ay: number): this {
        this._ax = ax; this._ay = ay;
        this.ut.setAnchorPoint(ax, ay);
        return this;
    }

    pos(x: number, y: number, z = 0): this { this.node.setPosition(x, y, z); return this; }
    posX(x: number): this { const p = this.node.position; this.node.setPosition(x, p.y, p.z); return this; }
    posY(y: number): this { const p = this.node.position; this.node.setPosition(p.x, y, p.z); return this; }

    /** 添加子节点（UINode 或裸 Node 都行；UINode 会被记录到布局列表） */
    add(...kids: Array<UINode | Node>): this {
        for (const k of kids) {
            const ui = k instanceof UINode ? k : null;
            const n = ui ? ui.node : k;
            n.setParent(this.node);
            if (ui) this._kids.push(ui);
        }
        return this;
    }

    /** 挂载到父节点（Node 或 UINode）。布局容器会在此自动 layout */
    mount(parent: Node | UINode): this {
        const p = parent instanceof UINode ? parent.node : parent;
        this.node.setParent(p);
        if (this._needsLayout) this.layout();
        return this;
    }

    /** 主动重排（add 完子节点后、或动态增删后调用） */
    relayout(): this { this.layout(); return this; }

    // ══ 布局协议 ══
    protected _needsLayout = false;
    /** 递归布局，返回自身最终尺寸。叶子节点回报声明尺寸即可。 */
    layout(): { w: number; h: number } {
        return { w: this._w, h: this._h };
    }

    /** 便捷：绑定点击并阻止冒泡（所有可点击组件复用） */
    protected _bindTap(cb: () => void): void {
        this.node.on(NodeEventType.TOUCH_END, (e: EventTouch) => {
            e.propagationStopped = true;
            cb();
        });
    }
}
