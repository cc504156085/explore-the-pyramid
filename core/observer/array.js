import { def } from '../util/index';

/* => 缓存数组的原型 */
const arrayProto = Array.prototype;

/* => 创建一个新对象，将数组的原型作为其原型 */
export const arrayMethods = Object.create(arrayProto);

/* => 可以改变数组内部的 7 种方法 */
const methodsToPatch = ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse'];

/* => 拦截变异方法并发出事件 */
methodsToPatch.forEach(function (method) {
  // => 缓存原生方法
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

    /* => 调用 Observer 实例上的观测数组方法对新增的项进行侦测 */
    if (inserted) ob.observeArray(inserted);

    // => 通知更改
    ob.dep.notify();

    /* => 返回结果 */
    return result;
  });
});
