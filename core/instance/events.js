/* @flow */

import { tip, toArray, hyphenate, formatComponentName, invokeWithErrorHandling } from '../util/index';
import { updateListeners } from '../vdom/helpers/index';

export function initEvents(vm: Component) {
  /* => 创建事件池对象，存储事件 */
  vm._events = Object.create(null);
  vm._hasHookEvent = false;

  // init parent attached events => 初始化父组件附加的事件（父组件传给子组件的事件）
  const listeners = vm.$options._parentListeners;

  if (listeners) {
    /* => 更新组件监听器（向子组件注册事件） */
    updateComponentListeners(vm, listeners);
  }
}

let target: any;

/* => 注册事件 */
function add(event, fn) {
  target.$on(event, fn);
}

/* => 移除事件 */
function remove(event, fn) {
  target.$off(event, fn);
}

/* => 创建一次性事件处理函数 */
function createOnceHandler(event, fn) {
  const _target = target;
  return function onceHandler() {
    const res = fn.apply(null, arguments);
    if (res !== null) {
      _target.$off(event, onceHandler);
    }
  };
}

export function updateComponentListeners(vm: Component, listeners: Object, oldListeners: ?Object) {
  target = vm;
  updateListeners(listeners, oldListeners || {}, add, remove, createOnceHandler, vm);
  target = undefined;
}

export function eventsMixin(Vue: Class<Component>) {
  const hookRE = /^hook:/;

  /* => 订阅 */
  Vue.prototype.$on = function (event: string | Array<string>, fn: Function): Component {
    const vm: Component = this;

    /* => 如果是一个数组，遍历绑定 */
    if (Array.isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$on(event[i], fn);
      }
    } else {
      /* => 在事件池对象，创建该事件的空间，并添加事件回调 */
      (vm._events[event] || (vm._events[event] = [])).push(fn);

      /* => 优化钩子：使用在注册时标记的布尔标志而不是哈希查找的事件开销 */
      // optimize hook:event cost by using a boolean flag marked at registration
      // instead of a hash lookup
      if (hookRE.test(event)) {
        vm._hasHookEvent = true;
      }
    }

    return vm;
  };

  /* => 触发后就卸载 */
  Vue.prototype.$once = function (event: string, fn: Function): Component {
    const vm: Component = this;

    /* => 新建一个函数 */
    function on() {
      /* => 触发事件后卸载该事件 */
      vm.$off(event, on);

      /* => 利用闭包，手动调用回调函数（参数传入） */
      fn.apply(vm, arguments);
    }

    /* => 赋予属性 fn ，值为传入回调函数 */
    on.fn = fn;

    /* => 注册事件 */
    vm.$on(event, on);

    return vm;
  };

  /* => 卸载 */
  Vue.prototype.$off = function (event?: string | Array<string>, fn?: Function): Component {
    const vm: Component = this;

    // all => 如果没有提供参数，则清空事件池（新赋值为一个空对象）
    if (!arguments.length) {
      vm._events = Object.create(null);
      return vm;
    }

    // array of events => 如果是一个数组，遍历卸载
    if (Array.isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$off(event[i], fn);
      }
      return vm;
    }

    // specific event => 若只提供事件名
    /* => 获取该事件名存储的回调 */
    const cbs = vm._events[event];

    /* => 没有注册该事件则终止 */
    if (!cbs) {
      return vm;
    }

    /* => 如果只提供第一个参数（事件名） */
    if (!fn) {
      /* => 清空该事件的所有回调 */
      vm._events[event] = null;

      return vm;
    }

    // specific handler => 说明同时传入事件名与事件回调函数
    let cb;
    let i = cbs.length;

    /* => 从后往前遍历，防止数组塌陷 */
    while (i--) {
      cb = cbs[i];

      /* => 若当前回调池里的回调与传入的回调相同（或 fn 属性是否相同，该属性在 $once 时有效） */
      if (cb === fn || cb.fn === fn) {
        /* => 切除并跳出循环 */
        cbs.splice(i, 1);

        break;
      }
    }

    return vm;
  };

  /* => 发布 */
  Vue.prototype.$emit = function (event: string): Component {
    const vm: Component = this;

    if (process.env.NODE_ENV !== 'production') {
      const lowerCaseEvent = event.toLowerCase();
      if (lowerCaseEvent !== event && vm._events[lowerCaseEvent]) {
        /* => 事件已在组件中触发，但是处理程序为 event 注册。
         * 注意，HTML属性是不区分大小写的，在使用 DOM 模板时不能使用 v-on 侦听驼峰命名的事件
         * 应该使用 XXX - XXX 的形式
         */
        tip(
          `Event "${lowerCaseEvent}" is emitted in component ` +
            `${formatComponentName(vm)} but the handler is registered for "${event}". ` +
            `Note that HTML attributes are case-insensitive and you cannot use ` +
            `v-on to listen to camelCase events when using in-DOM templates. ` +
            `You should probably use "${hyphenate(event)}" instead of "${event}".`,
        );
      }
    }

    /* => 取出当前事件的回调函数池 */
    let cbs = vm._events[event];

    /* => 如果回调列表存在 */
    if (cbs) {
      /* => 将类数组转化成数组 */
      cbs = cbs.length > 1 ? toArray(cbs) : cbs;

      /* => 截取剩余的参数，并将类数组转化成数组 */
      const args = toArray(arguments, 1);

      const info = `event handler for "${event}"`;

      /* => 遍历列表依次执行回调 */
      for (let i = 0, l = cbs.length; i < l; i++) {
        /* => 用错误处理调用 */
        invokeWithErrorHandling(cbs[i], vm, args, vm, info);
      }
    }

    return vm;
  };
}
