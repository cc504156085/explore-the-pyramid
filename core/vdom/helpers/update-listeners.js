/* @flow */

import { warn, invokeWithErrorHandling } from 'core/util/index';
import { cached, isUndef, isTrue, isPlainObject } from 'shared/util';

/* => 解析事件修饰符 */
const normalizeEvent = cached((name: string): {
  name: string,
  once: boolean,
  capture: boolean,
  passive: boolean,
  handler?: Function,
  params?: Array<any>,
} => {
  const passive = name.charAt(0) === '&';
  name = passive ? name.slice(1) : name;

  const once = name.charAt(0) === '~'; // => 前缀最后，先检查
  name = once ? name.slice(1) : name;

  const capture = name.charAt(0) === '!';
  name = capture ? name.slice(1) : name;
  return { name, once, capture, passive };
});

/* => 创建 Fn 调用程序 */
export function createFnInvoker(fns: Function | Array<Function>, vm: ?Component): Function {
  function invoker() {
    const fns = invoker.fns;
    if (Array.isArray(fns)) {
      const cloned = fns.slice();
      for (let i = 0; i < cloned.length; i++) {
        invokeWithErrorHandling(cloned[i], null, arguments, vm, `v-on handler`);
      }
    } else {
      // => 返回处理程序的返回值
      return invokeWithErrorHandling(fns, null, arguments, vm, `v-on handler`);
    }
  }
  invoker.fns = fns;
  return invoker;
}

/* => 父级传入的事件、上一次的事件、$on 方法、$off 方法、$once 方法、当前实例 */
export function updateListeners(on: Object, oldOn: Object, add: Function, remove: Function, createOnceHandler: Function, vm: Component) {
  let name, def, cur, old, event;

  /* => 遍历新事件池 */
  for (name in on) {
    /* => 拿到当前事件 */
    def = cur = on[name];

    /* => 拿到旧事件池里的与之对应的当前的事件 */
    old = oldOn[name];

    /* => 事件规格化 */
    event = normalizeEvent(name);

    if (__WEEX__ && isPlainObject(def)) {
      cur = def.handler;
      event.params = def.params;
    }

    /* => 如果事件是 undefined / null */
    if (isUndef(cur)) {
      /* => 事件 event.name 的处理程序获取无效： */
      process.env.NODE_ENV !== 'production' && warn(`Invalid handler for event "${event.name}": got ` + String(cur), vm);
    } else if (isUndef(old)) {
      /* => 如果旧事件池中不存在，说明是新增 */
      if (isUndef(cur.fns)) cur = on[name] = createFnInvoker(cur, vm);

      /* => 判断是否是一次性触发事件 */
      if (isTrue(event.once)) cur = on[name] = createOnceHandler(event.name, cur, event.capture);

      /* => 注册事件 */
      add(event.name, cur, event.capture, event.passive, event.params);
    } else if (cur !== old) {
      /* => 如果都存在但不相同。以新事件为准 */
      old.fns = cur;

      /* => 将回调引用指向真实的事件 */
      on[name] = old;
    }
  }

  /* => 遍历旧事件池 */
  for (name in oldOn) {
    /* => 如果在新的事件池里不存在，说明要移除事件 */
    if (isUndef(on[name])) {
      /* => 规格化事件 */
      event = normalizeEvent(name);

      /* => 移除事件 */
      remove(event.name, oldOn[name], event.capture);
    }
  }
}
