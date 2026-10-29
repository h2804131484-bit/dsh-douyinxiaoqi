// lib/pluginLoader.js
// 合并 dafeiyu‑hub 与本项目的插件目录
// dafeiyu‑hub 的插件目录位于 ./lib/hubCatalog.js（需要自行复制）
// 本项目原有的插件目录位于 ./lib/pluginCatalog.js

const hubCatalog = (() => {
  try { return require('./hubCatalog'); } catch (_) { return { getPlugins: () => [], getPlugin: () => null }; }
})();
const localCatalog = (() => {
  try { return require('./pluginCatalog'); } catch (_) { return { getPlugins: () => [], getPlugin: () => null }; }
})();

module.exports = {
  /**
   * 返回所有插件的数组
   */
  getAllPlugins() {
    const hub = hubCatalog.getPlugins ? hubCatalog.getPlugins() : [];
    const local = localCatalog.getPlugins ? localCatalog.getPlugins() : [];
    return [...hub, ...local];
  },
  /**
   * 根据插件名称返回单个插件对象
   */
  getPlugin(name) {
    return hubCatalog.getPlugin?.(name) || localCatalog.getPlugin?.(name) || null;
  },
};
