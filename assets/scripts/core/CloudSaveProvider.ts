/**
 * CloudSaveProvider.ts - 云存档提供方（微信云开发）
 *
 * 通过单个云函数 kubiSave 存取整份存档 JSON，按 openid 自动隔离。
 * 设计为「可降级」：环境不支持 / 未配置时所有方法安全返回 false/null，不阻断本地游戏。
 *
 * 关键约定：上传时把本地存档时间戳 savedAt 一道传给云端（云端原样存为 updatedAt），
 * 这样本地与云端时间戳一致，启动比对时不会因「本地刚存、云端稍后回调」而误报冲突。
 */

import { CLOUD_CONFIG } from './cloudConfig';

interface CloudResult {
    ok: boolean;
    save?: string | null;
    updatedAt?: number;
    err?: string;
}

export class CloudSaveProvider {
    private static _inst: CloudSaveProvider;
    static get instance(): CloudSaveProvider {
        if (!this._inst) this._inst = new CloudSaveProvider();
        return this._inst;
    }

    private _inited = false;
    private _enabled = false;
    private _uploading = false;
    private _lastError: string | null = null;
    private _lastSyncAt = 0;

    private get _hasWxCloud(): boolean {
        return typeof wx !== 'undefined' && !!(wx as any).cloud;
    }

    private init(): void {
        if (this._inited) return;
        this._inited = true;
        if (!CLOUD_CONFIG.enabled || !CLOUD_CONFIG.env) {
            this._enabled = false;
            return;
        }
        if (!this._hasWxCloud) {
            this._enabled = false;
            console.warn('[CloudSave] 已启用但当前环境无 wx.cloud（非微信或基础库过低）');
            return;
        }
        try {
            (wx as any).cloud.init({ env: CLOUD_CONFIG.env, traceUser: true });
            this._enabled = true;
        } catch (e) {
            this._enabled = false;
            this._lastError = 'cloud init failed: ' + e;
            console.error('[CloudSave]', this._lastError);
        }
    }

    get enabled(): boolean { this.init(); return this._enabled; }
    get lastError(): string | null { return this._lastError; }
    get lastSyncAt(): number { return this._lastSyncAt; }

    private _call(name: string, data: any): Promise<any> {
        return new Promise((resolve, reject) => {
            (wx as any).cloud.callFunction({
                name,
                data,
                success: (res: any) => resolve(res),
                fail: (err: any) => reject(err),
            });
        });
    }

    /** 上传整份存档 JSON（非阻塞安全调用，合并并发上传） */
    async upload(json: string, savedAt: number): Promise<boolean> {
        this.init();
        if (!this._enabled) return false;
        if (this._uploading) return false;
        this._uploading = true;
        try {
            await this._call('kubiSave', { action: 'put', save: json, savedAt });
            this._lastSyncAt = Date.now();
            this._lastError = null;
            return true;
        } catch (e) {
            this._lastError = 'upload failed: ' + e;
            console.error('[CloudSave]', this._lastError);
            return false;
        } finally {
            this._uploading = false;
        }
    }

    /** 获取云端存档元信息（updatedAt），无则 null */
    async fetchMeta(): Promise<{ updatedAt: number } | null> {
        this.init();
        if (!this._enabled) return null;
        try {
            const res: any = await this._call('kubiSave', { action: 'meta' });
            const result: CloudResult | undefined = res && res.result;
            if (result && result.ok) return { updatedAt: result.updatedAt || 0 };
            return null;
        } catch (e) {
            this._lastError = 'meta failed: ' + e;
            return null;
        }
    }

    /** 下载云端存档 JSON 字符串，无则 null */
    async download(): Promise<string | null> {
        this.init();
        if (!this._enabled) return null;
        try {
            const res: any = await this._call('kubiSave', { action: 'get' });
            const result: CloudResult | undefined = res && res.result;
            if (result && result.ok && result.save) return String(result.save);
            return null;
        } catch (e) {
            this._lastError = 'download failed: ' + e;
            return null;
        }
    }
}
