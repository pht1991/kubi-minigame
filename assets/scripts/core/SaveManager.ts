/**
 * SaveManager.ts - 存档管理
 * 替代原项目 Cookie/localStorage，使用微信小游戏 wx.setStorageSync
 * 在非微信环境 fallback 到 localStorage
 */

import { GameManager } from './GameManager';
import { EventBus, GameEvents } from './EventBus';
import { SaveData } from '../data/types';
import { CloudSaveProvider } from './CloudSaveProvider';

const SAVE_KEY = 'kubi_save_data';
const SAVE_VERSION = '1.0.0';

export class SaveManager {
    private static _instance: SaveManager;
    private _gm: GameManager;
    private _eventBus: EventBus;
    private _autoSaveTimer: any = null;

    static get instance(): SaveManager {
        if (!this._instance) this._instance = new SaveManager();
        return this._instance;
    }

    private constructor() {
        this._gm = GameManager.instance;
        this._eventBus = EventBus.instance;
    }

    /** 是否在微信小游戏环境 */
    private get _isWechat(): boolean {
        return typeof wx !== 'undefined' && typeof wx.setStorageSync === 'function';
    }

    /** 写入存储 */
    private _setStorage(key: string, value: string): void {
        if (this._isWechat) {
            wx.setStorageSync(key, value);
        } else {
            try { localStorage.setItem(key, value); } catch (e) { console.error('localStorage failed', e); }
        }
    }

    /** 读取存储 */
    private _getStorage(key: string): string | null {
        if (this._isWechat) {
            return wx.getStorageSync(key) || null;
        }
        try { return localStorage.getItem(key); } catch { return null; }
    }

    /** 保存游戏（本地优先，成功后异步同步到云端） */
    save(): boolean {
        try {
            this._eventBus.emit(GameEvents.SAVE_START);
            const data = this._gm.toSaveData();
            data.version = SAVE_VERSION;
            data.savedAt = Date.now();
            const json = JSON.stringify(data);
            this._setStorage(SAVE_KEY, json);
            this._eventBus.emit(GameEvents.SAVE_COMPLETE, data.savedAt);
            this._syncToCloud(json, data.savedAt);
            return true;
        } catch (e) {
            console.error('[SaveManager] save failed:', e);
            this._eventBus.emit(GameEvents.SAVE_COMPLETE, 0, false);
            return false;
        }
    }

    /** 本地存档的保存时间戳（ms），无则 0 */
    get localSavedAt(): number {
        const raw = this._getStorage(SAVE_KEY);
        if (!raw) return 0;
        try {
            const d = JSON.parse(raw);
            return typeof d.savedAt === 'number' ? d.savedAt : 0;
        } catch {
            return 0;
        }
    }

    /** 非阻塞地把存档推送到云端 */
    private _syncToCloud(json: string, savedAt: number): void {
        if (!CloudSaveProvider.instance.enabled) return;
        void CloudSaveProvider.instance.upload(json, savedAt);
    }

    /** 是否有「云端存档比本地更新（或本地无存档）」需要提示恢复 */
    async shouldOfferCloudRestore(): Promise<boolean> {
        if (!CloudSaveProvider.instance.enabled) return false;
        const meta = await CloudSaveProvider.instance.fetchMeta();
        if (!meta || !meta.updatedAt) return false;
        return meta.updatedAt > this.localSavedAt;
    }

    /** 从云端下载并覆盖本地（同时落本地，保持两者一致） */
    async downloadFromCloud(): Promise<boolean> {
        if (!CloudSaveProvider.instance.enabled) return false;
        const json = await CloudSaveProvider.instance.download();
        if (!json) return false;
        try {
            const data: SaveData = JSON.parse(json);
            if (!data.version || typeof data.playerState?.hp !== 'number' || Number.isNaN(data.playerState.hp)) {
                console.warn('[SaveManager] 云端存档格式不兼容，已忽略');
                return false;
            }
            this._setStorage(SAVE_KEY, json);
            this._gm.fromSaveData(data);
            return true;
        } catch (e) {
            console.error('[SaveManager] cloud restore failed:', e);
            return false;
        }
    }

    /** 手动触发一次云端上传 */
    async uploadToCloud(): Promise<boolean> {
        if (!CloudSaveProvider.instance.enabled) return false;
        const data = this._gm.toSaveData();
        data.version = SAVE_VERSION;
        data.savedAt = Date.now();
        const json = JSON.stringify(data);
        const ok = await CloudSaveProvider.instance.upload(json, data.savedAt);
        if (ok) this._setStorage(SAVE_KEY, json);
        return ok;
    }

    /** 云存档状态文本（用于菜单展示） */
    cloudStatusText(): string {
        if (!CloudSaveProvider.instance.enabled) return '云存档未启用';
        const err = CloudSaveProvider.instance.lastError;
        if (err) return '云存档出错';
        const t = CloudSaveProvider.instance.lastSyncAt;
        if (t) return `已同步 ${this._fmtTime(t)}`;
        return '云存档就绪';
    }

    private _fmtTime(t: number): string {
        const d = new Date(t);
        const p = (n: number) => (n < 10 ? '0' + n : '' + n);
        return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }

    /** 加载游戏 */
    load(): boolean {
        const raw = this._getStorage(SAVE_KEY);
        if (!raw) return false;
        try {
            const data: SaveData = JSON.parse(raw);
            // 存档格式校验：playerState.hp 必须是数字，且不能是 NaN
            if (!data.version || typeof data.playerState?.hp !== 'number' || Number.isNaN(data.playerState.hp)) {
                console.warn('[SaveManager] 存档格式不兼容，删除旧存档');
                this.deleteSave();
                return false;
            }
            this._gm.fromSaveData(data);
            return true;
        } catch (e) {
            console.error('[SaveManager] load failed:', e);
            return false;
        }
    }

    /** 是否有存档 */
    hasSave(): boolean {
        return this._getStorage(SAVE_KEY) !== null;
    }

    /** 删除存档 */
    deleteSave(): void {
        if (this._isWechat) {
            wx.removeStorageSync(SAVE_KEY);
        } else {
            try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
        }
    }

    /** 启动自动存档 */
    startAutoSave(intervalMs: number = 60000): void {
        this.stopAutoSave();
        this._autoSaveTimer = setInterval(() => {
            if (this._gm.settings.autoSave) {
                this.save();
            }
        }, intervalMs);
    }

    /** 停止自动存档 */
    stopAutoSave(): void {
        if (this._autoSaveTimer) {
            clearInterval(this._autoSaveTimer);
            this._autoSaveTimer = null;
        }
    }
}
