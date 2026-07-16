/**
 * GridNavigator.ts - 网格导航栈管理
 * 管理网格页面层级，支持 push/pop/replace
 * 通过 EventBus 通知 UI 层渲染当前网格页
 */

import { EventBus, GameEvents } from './EventBus';
import { GridPage, GridCellData } from '../data/types';

export class GridNavigator {
    private static _instance: GridNavigator;
    private _eventBus: EventBus;
    private _stack: GridPage[] = [];
    /** 导航变化回调（push/pop/popTo/replace/setRoot 后触发），用于 MainScene 同步状态（如底栏按钮） */
    onChange?: () => void;

    static get instance(): GridNavigator {
        if (!this._instance) this._instance = new GridNavigator();
        return this._instance;
    }

    private constructor() {
        this._eventBus = EventBus.instance;
    }

    /** 当前页 */
    get current(): GridPage | undefined {
        return this._stack.length > 0 ? this._stack[this._stack.length - 1] : undefined;
    }

    /** 栈深度 */
    get depth(): number {
        return this._stack.length;
    }

    /** 面包屑路径（取每项 breadcrumb 最后一段短名，避免拼接重复） */
    get breadcrumbs(): string[] {
        return this._stack.map(p => {
            const parts = p.breadcrumb.split('>');
            return parts[parts.length - 1].trim();
        });
    }

    /** 是否可以返回 */
    get canGoBack(): boolean {
        return this._stack.length > 1;
    }

    /** 压入新网格页 */
    push(page: GridPage): void {
        this._stack.push(page);
        this._notify();
        this._eventBus.emit(GameEvents.GRID_PUSH, page);
    }

    /** 弹出当前页，返回上一页 */
    pop(): GridPage | undefined {
        if (this._stack.length <= 1) return undefined;
        const page = this._stack.pop();
        this._notify();
        this._eventBus.emit(GameEvents.GRID_POP, this.current);
        return page;
    }

    /** 替换当前页（不改变栈深度） */
    replace(page: GridPage): void {
        if (this._stack.length === 0) {
            this._stack.push(page);
        } else {
            this._stack[this._stack.length - 1] = page;
        }
        this._notify();
    }

    /** 清空栈并设置根页 */
    setRoot(page: GridPage): void {
        this._stack = [page];
        this._notify();
    }

    /** 清空到指定深度 */
    popTo(depth: number): void {
        while (this._stack.length > Math.max(1, depth)) {
            this._stack.pop();
        }
        this._notify();
    }

    /** 清空整个栈 */
    clear(): void {
        this._stack = [];
    }

    /** 通知 UI 层刷新当前网格 */
    private _notify(): void {
        this._eventBus.emit(GameEvents.UI_REFRESH, this.current);
        this.onChange?.();
    }
}
