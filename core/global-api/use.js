import { toArray } from '../util/index';

export function initUse(Vue: GlobalAPI) {
  // => 接收一个插件函数或者对象 | 全局注册一个插件，供全局使用
  Vue.use = function (plugin: Function | Object) {
    // => 获取已安装的插件集合
    const installedPlugins = this._installedPlugins || (this._installedPlugins = []);

    // => 如果安装的插件集合里已经有了该插件，即该插件已经安装，则直接返回（防止重复安装）
    if (installedPlugins.indexOf(plugin) > -1) return this;

    // additional parameters => 额外的参数，将类数组转换为真实数组（第一个之后的参数）
    const args = toArray(arguments, 1);

    // => 在最前面插入 Vue 构造函数，保证插件执行时的第一个参数是 Vue
    args.unshift(this);

    // => 如果插件是一个对象，则必须含有 install 方法
    if (typeof plugin.install === 'function') {
      plugin.install.apply(plugin, args);
    } else if (typeof plugin === 'function') {
      // => 否则必须是一个函数（此函数就被当成 install 方法）
      plugin.apply(null, args);
    }

    // => 存入已安装的插件集合中
    installedPlugins.push(plugin);

    return this;
  };
}
