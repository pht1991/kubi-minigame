/**
 * cloudConfig.ts - 云存档配置
 *
 * 启用步骤：
 * 1. 在微信开发者工具中为小游戏开通「云开发」，创建一个环境（获取环境 ID，形如 'kubi-1gxxxx'）。
 * 2. 部署仓库 cloudfunctions/kubiSave 下的云函数（右键 → 上传并部署）。
 * 3. 在云开发控制台创建集合 `kubi_saves`。
 * 4. 把下方 env 填为你的环境 ID，并将 enabled 改为 true。
 *
 * env 留空或 enabled=false 时，云存档自动关闭，游戏退化为纯本地存档，不影响任何现有逻辑。
 */
export const CLOUD_CONFIG = {
    /** 云开发环境 ID */
    env: '',
    /** 填好 env 后改为 true 即可启用云存档同步 */
    enabled: false,
};
