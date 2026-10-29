// lib/pluginCatalog.js
// 本项目原有插件目录（若有）
// 为了兼容 pluginLoader，我们导出空的插件列表。

module.exports = {
  getPlugins() { return []; },
  getPlugin() { return null; },
};
