import { initMixin } from './init';
import { stateMixin } from './state';
import { renderMixin } from './render';
import { eventsMixin } from './events';
import { lifecycleMixin } from './lifecycle';
import { warn } from '../util/index';

/* Vue 的构造函数 */
function Vue(options) {
  /* => 判断Vue实例是否是 new 出来的 */
  if (process.env.NODE_ENV !== 'production' && !(this instanceof Vue)) {
    /* => Vue是构造函数，应使用“new”关键字调用 */
    warn('Vue is a constructor and should be called with the `new` keyword');
  }

  /* => 初始化 调用 Vue.prototype._init() 方法 */
  this._init(options);
}

initMixin(Vue); // => 定义 _init
stateMixin(Vue); // => 定义 $set / $delete / $watch，给 $data / $props 设置响应式监听
eventsMixin(Vue); // => 定义 $on / $once / $off / $emit
lifecycleMixin(Vue); // => 定义 $forceUpdate / $destroy / _update
renderMixin(Vue); // => 定义 $nextTick / _render，注册运行时助手

export default Vue;
