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

  configDef.get = () => config;
  if (process.env.NODE_ENV !== 'production') {
    configDef.set = () => {
      /* => 不要替换 Vue.config 对象，而是设置单个字段。 */
      warn('Do not replace the Vue.config object, set individual fields instead.');
    };
  }
  Object.defineProperty(Vue, 'config', configDef);

  // exposed util methods. => 公开的 util 方法。
  // NOTE: these are not considered part of the public API. => 注意：这些不被视为公共 API 的一部分。
  // avoid relying on them unless you are aware of the risk. => 除非您意识到风险，否则请避免依赖它们。
  Vue.util = {
    warn,
    extend,
    mergeOptions,
    defineReactive,
  };

  Vue.set = set;
  Vue.delete = del;
  Vue.nextTick = nextTick;

  // 2.6 explicit observable API => 显式可观测API
  // Vue.observable = <T>(obj: T): T => {
  //   observe(obj);
  //   return obj;
  // };

  Vue.options = Object.create(null);
  ASSET_TYPES.forEach(type => {
    Vue.options[type + 's'] = Object.create(null);
  });

  /* => 这是用于标识“基本”构造函数，以在Weex的多实例方案中扩展所有纯对象组件。 */
  // this is used to identify the "base" constructor to extend all plain-object
  // components with in Weex's multi-instance scenarios.
  Vue.options._base = Vue;

  extend(Vue.options.components, builtInComponents);

  initUse(Vue);
  initMixin(Vue);
  initExtend(Vue);
  initAssetRegisters(Vue);
}
