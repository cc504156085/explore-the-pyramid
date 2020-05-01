/* => Vue 构造函数 */
import Vue from './instance/index';

import { initGlobalAPI } from './global-api/index';
import { isServerRendering } from 'core/util/env';
import { FunctionalRenderContext } from 'core/vdom/create-functional-component';

/* => 初始化全局API  set / delete / nextTick / observable / options / config / use / mixin / extend */
initGlobalAPI(Vue);

/* => 作用于服务端渲染 */
Object.defineProperty(Vue.prototype, '$isServer', { get: isServerRendering });

Object.defineProperty(Vue.prototype, '$ssrContext', {
  get() {
    return this.$vnode && this.$vnode.ssrContext;
  },
});

// => 用于 ssr 运行时帮助程序安装的 FunctionalRenderContext
Object.defineProperty(Vue, 'FunctionalRenderContext', { value: FunctionalRenderContext });

/* => 第三方库可针对版本做特定的处理 */
Vue.version = '__VERSION__';

export default Vue;
