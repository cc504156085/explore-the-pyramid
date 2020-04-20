/* @flow */

import config from '../config';
import { initUse } from './use';
import { initMixin } from './mixin';
import { initExtend } from './extend';
import { initAssetRegisters } from './assets';
import { set, del } from '../observer/index';
import { ASSET_TYPES } from 'shared/constants';
import builtInComponents from '../components/index';
import { observe } from 'core/observer/index';

import { warn, extend, nextTick, mergeOptions, defineReactive } from '../util/index';

export function initGlobalAPI(Vue: GlobalAPI) {
  // config => 配置
  const configDef = {};

  // => 获取时返回这个 config 对象，用户可以根据配置设置属性新值
  configDef.get = () => config;

  if (process.env.NODE_ENV !== 'production') {
    configDef.set = () => {
      /* => 不要替换 Vue.config 对象，而是设置单个字段。 */
      warn('Do not replace the Vue.config object, set individual fields instead.');
    };
  }

  // => 在构造函数上定义配置对象，且当用户尝试赋予新值时抛出警告
  Object.defineProperty(Vue, 'config', configDef);

  // exposed util methods. => 公开的 util 方法。
  // NOTE: these are not considered part of the public API.  => 注意：这些不被视为公共 API 的一部分。
  // avoid relying on them unless you are aware of the risk. => 除非您意识到风险，否则请避免依赖它们。
  Vue.util = { warn, extend, mergeOptions, defineReactive };

  // => 定义公共全局 API
  Vue.set = set;
  Vue.delete = del;
  Vue.nextTick = nextTick;

  // 2.6 explicit observable API => 显式可观测 API
  Vue.observable = (obj) => {
    observe(obj);
    return obj;
  };

  // => 初始化指令、过滤器、组件对象
  Vue.options = Object.create(null);
  ASSET_TYPES.forEach((type) => {
    Vue.options[type + 's'] = Object.create(null);
  });

  /* => 这是用于标识“基本”构造函数，以在 Weex 的多实例方案中扩展所有纯对象组件。 */
  // this is used to identify the "base" constructor to extend all plain-object
  // components with in Weex's multi-instance scenarios.
  Vue.options._base = Vue;

  // => 初始化内置组件 keep-alive ，将内置组件合并至 components 选项
  extend(Vue.options.components, builtInComponents);

  // => 初始化全局 API
  initUse(Vue); // => 初始化插件注册
  initMixin(Vue); // => 初始化混入
  initExtend(Vue); // => 初始化扩展
  initAssetRegisters(Vue); // => 初始化资源注册
}
