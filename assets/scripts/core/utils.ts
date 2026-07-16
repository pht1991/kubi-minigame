/**
 * utils.ts - 工具函数库
 * 从原项目 lib.js 迁移，去除 DOM/window 依赖
 */

/** 深克隆对象 */
export function clone<T>(obj: T): T {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    if (obj instanceof Array) {
        return (obj as any).map((item: any) => clone(item)) as any;
    }
    const o: any = {};
    for (const k in obj) {
        o[k] = clone((obj as any)[k]);
    }
    return o;
}

/** 克隆容器内物品并倍乘 */
export function cloneMul(obj: Record<string, number>, mul: number = 1, isRound: boolean = false): Record<string, number> {
    const o: Record<string, number> = {};
    for (const attr in obj) {
        const num = mul * obj[attr];
        o[attr] = isRound ? Math.round(num) : num;
    }
    return o;
}

/** 将属性累加到目标对象 */
export function addTo(obj: Record<string, number>, add: Record<string, number>): void {
    for (const attr in add) {
        if (obj[attr]) {
            obj[attr] += add[attr];
        } else {
            obj[attr] = add[attr];
        }
    }
}

/** 合并两个对象（累加数值），返回新对象 */
export function together(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
    const result = clone(a);
    const add = clone(b);
    for (const attr in add) {
        if (result[attr]) {
            result[attr] += add[attr];
        } else {
            result[attr] = add[attr];
        }
    }
    return result;
}

/** 计算对象成员属性数量 */
export function getLength(obj: object): number {
    let count = 0;
    for (const _ in obj) count++;
    return count;
}

/** 带权重的随机选择 */
export function getRandomThing(things: Record<string, any>): { attr: string | false; total: number } {
    let num = 0;
    for (const attr in things) {
        num += things[attr].amount == undefined ? things[attr] : things[attr].amount;
    }
    const total = num;
    num = Math.ceil(Math.random() * num);
    let flag = false;
    let picked: string | false = false;
    for (const attr in things) {
        num -= things[attr].amount == undefined ? things[attr] : things[attr].amount;
        if (num <= 0) {
            flag = true;
            picked = attr;
            break;
        }
    }
    if (flag === false || total === 0) {
        return { attr: false, total };
    }
    return { attr: picked, total };
}

/** 从对象中随机取一个成员 */
export function getRandom<T>(obj: Record<string, T>, props?: { noAttr?: string; haveValue?: [string, any] }): { attr: string; value: T } | false {
    let count = 0;
    for (const attr in obj) {
        if (props && props.noAttr) {
            if ((obj as any)[attr][props.noAttr]) continue;
        }
        if (props && props.haveValue) {
            if ((obj as any)[attr][props.haveValue[0]] !== props.haveValue[1]) continue;
        }
        count++;
    }
    const length = Math.random() * count;

    count = 0;
    for (const attr in obj) {
        if (props && props.noAttr) {
            if ((obj as any)[attr][props.noAttr]) continue;
        }
        if (props && props.haveValue) {
            if ((obj as any)[attr][props.haveValue[0]] !== props.haveValue[1]) continue;
        }
        count++;
        if (count >= length) {
            return { attr, value: obj[attr] };
        }
    }
    return false;
}

/** 创建单键对象 {attr: value} */
export function o(attr: string, value: number): Record<string, number> {
    const obj: Record<string, number> = {};
    obj[attr] = value;
    return obj;
}

/** 获取对象的第一个成员 */
export function getFirst<T>(obj: Record<string, T>): { attr: string; value: T } | undefined {
    for (const attr in obj) {
        return { attr, value: obj[attr] };
    }
    return undefined;
}
