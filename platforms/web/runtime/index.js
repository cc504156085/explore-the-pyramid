/* @flow */

/*
 * 1.配置 __patch__ 方法
 * 2.定义原始的 $mount hook
 */

import Vue from 'core/index';
import config from 'core/config';
import { extend, noop } from 'shared/util';
import { mountComponent } from 'core/instance/lifecycle';
import { devtools, inBrowser } from 'core/util/index';

import {
  query,
  mustUseProp,
  isReservedTag,
  isReservedAttr,
  getTagNamespace,
  isUnknownElement,
} from 'web/util/index';

import { patch } from './patch';
import platformDirectives from './directives/index';
import platformComponents from './components/index';

// install platform specific utils => 注册特定的有用平台
Vue.config.mustUseProp = mustUseProp;
Vue.config.isReservedTag = isReservedTag;
Vue.config.isReservedAttr = isReservedAttr;
Vue.config.getTagNamespace = getTagNamespace;
Vue.config.isUnknownElement = isUnknownElement;

// install platform runtime directives & components => 注册平台运行时的指令和组件
extend(Vue.options.directives, platformDirectives);
extend(Vue.options.components, platformComponents);

/* => 使用虚拟 DOM 更新真正的 DOM （核心算法） */
// install platform patch function => 如果是在浏览器中运行，则挂载 patch 方法（服务端渲染，不会操作 DOM ）
Vue.prototype.__patch__ = inBrowser ? patch : noop;

// public mount method => 公共 $mount 方法，挂载到 Vue 的原型
Vue.prototype.$mount = function(el?: string | Element, hydrating?: boolean): Component {
  /* => 如果 el 元素存在且处于浏览器运行时，则获取该元素的内容 */
  el = el && inBrowser ? query(el) : undefined;

  /* => 执行该方法 */
  return mountComponent(this, el, hydrating);
};

// devtools global hook => devtools全局钩子（可忽略）
/* istanbul ignore next */
if (inBrowser) {
  setTimeout(() => {
    if (config.devtools) {
      if (devtools) {
        devtools.emit('init', Vue);
      } else if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
        /* => 下载Vue Devtools扩展以获得更好的开发体验 */
        console[console.info ? 'info' : 'log'](
          'Download the Vue Devtools extension for a better development experience:\n' +
            'https://github.com/vuejs/vue-devtools',
        );
      }
    }
    if (
      process.env.NODE_ENV !== 'production' &&
      process.env.NODE_ENV !== 'test' &&
      config.productionTip !== false &&
      typeof console !== 'undefined'
    ) {
      /* => 您正在开发模式下运行Vue。为生产部署时，请确保启用生产模式。查看更多提示。。。 */
      console[console.info ? 'info' : 'log'](
        `You are running Vue in development mode.\n` +
          `Make sure to turn on production mode when deploying for production.\n` +
          `See more tips at https://vuejs.org/guide/deployment.html`,
      );
    }
  }, 0);
}

export default Vue;
