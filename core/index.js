/* => Vue 构造函数 */
import Vue from './instance/index';

import { initGlobalAPI } from './global-api/index';
import { isServerRendering } from 'core/util/env';
import { FunctionalRenderContext } from 'core/vdom/create-functional-component';

/* => 初始化全局API  set / delete / nextTick / observable / options / config / use / mixin / extend */
initGlobalAPI(Vue);

/* => 作用于服务端渲染 */
Object.defineProperty(Vue.prototype, '$isServer', {
  get: isServerRendering,
});

Object.defineProperty(Vue.prototype, '$ssrContext', {
  get() {
    /* istanbul ignore next => 可忽略 */
    return this.$vnode && this.$vnode.ssrContext;
  },
});

// expose FunctionalRenderContext for ssr runtime helper installation => 用于 ssr 运行时帮助程序安装的 FunctionalRenderContext
Object.defineProperty(Vue, 'FunctionalRenderContext', {
  value: FunctionalRenderContext,
});

Vue.version = '__VERSION__';

export default Vue;
