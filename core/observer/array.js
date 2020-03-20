/** => 不检查此文件的类型，因为flow不能很好地处理数组原型上的动态访问方法
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import { def } from '../util/index';

/* => 创建一个新对象，将数组的原型作为其原型 */
const arrayProto = Array.prototype;
export const arrayMethods = Object.create(arrayProto);

const methodsToPatch = ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse'];

/**
 * Intercept mutating methods and emit events => 拦截变异方法并发出事件
 */
methodsToPatch.forEach(function(method) {
  // cache original method => 缓存原生方法
  const original = arrayProto[method];

  def(arrayMethods, method, function mutator(...args) {
    /* => 手动调用数组的原生方法 */
    const result = original.apply(this, args);

    /* => 拿到观测者 */
    const ob = this.__ob__;

    /* => 如果是新增的项，则将这些项设置响应式监听 */
    let inserted;
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args;
        break;
      case 'splice':
        inserted = args.slice(2);
        break;
    }
    if (inserted) ob.observeArray(inserted);

    // notify change => 通知更改
    ob.dep.notify();
    return result;
  });
});
