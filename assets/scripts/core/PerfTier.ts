/**
 * PerfTier.ts - 设备性能分级
 * 基于微信 benchmarkLevel(安卓) / 内存 / CPU 核心数 将设备分为 low/mid/high 三档，
 * 供运行时做降帧、布局降级等适配。本模块无循环依赖，可被任意页面安全 import。
 */

export type PerfTier = 'low' | 'mid' | 'high';

let _tier: PerfTier = 'high';
let _initialized = false;

function detect(): PerfTier {
    try {
        const g: any = globalThis;
        // 微信小游戏环境
        if (g.wx && typeof g.wx.getDeviceInfo === 'function') {
            const info = g.wx.getDeviceInfo();
            const bench = info.benchmarkLevel;
            if (typeof bench === 'number') {
                // benchmarkLevel: 安卓 1~100，越高越强（iOS 通常无此字段）
                if (bench <= 20) return 'low';
                if (bench <= 50) return 'mid';
                return 'high';
            }
            // iOS 无 benchmarkLevel，用内存粗估（memorySize 单位 MB）
            const mem = info.memorySize || 0;
            if (mem > 0) return mem < 2048 ? 'mid' : 'high';
        }
        // H5 / 编辑器预览：用 CPU 核心数粗估
        const cores = g.navigator?.hardwareConcurrency || 4;
        return cores <= 4 ? 'mid' : 'high';
    } catch (e) {
        return 'high';
    }
}

/** 初始化性能档（幂等）。进入游戏前调用一次即可。 */
export function initPerfTier(): PerfTier {
    if (_initialized) return _tier;
    _initialized = true;
    _tier = detect();
    return _tier;
}

export function getPerfTier(): PerfTier {
    return _tier;
}

export function isLowPerf(): boolean {
    return _tier === 'low';
}

export function isHighPerf(): boolean {
    return _tier === 'high';
}
