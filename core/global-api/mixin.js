import { mergeOptions } from '../util/index';

export function initMixin(Vue: GlobalAPI) {
  // => 接受一个对象 | 全局注册一个混入，注册之后创建的每个实例都可以使用
  Vue.mixin = function (mixin: Object) {
    // => 将要混入的对象与当前实例上的 options 选项合并，并覆盖
    this.options = mergeOptions(this.options, mixin);

    return this;
  };
}
