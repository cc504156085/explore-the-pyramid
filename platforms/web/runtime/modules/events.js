/* @flow */

import { isDef, isUndef } from 'shared/util';
import { updateListeners } from 'core/vdom/helpers/index';
import { isIE, isFF, supportsPassive, isUsingMicroTask } from 'core/util/index';
import { RANGE_TOKEN, CHECKBOX_RADIO_TOKEN } from 'web/compiler/directives/model';
import { currentFlushTimestamp } from 'core/observer/scheduler';

/**
 * 规范化只能在运行时确定的 v-model 事件标记。
 * 将事件放在数组的第一个位置非常重要，因为关键是要确保在用户附加处理程序之前调用 v-model 回调。
 */
function normalizeEvents(on) {
  if (isDef(on[RANGE_TOKEN])) {
    // IE input[type=range] 只支持 `change` 事件
    const event = isIE ? 'change' : 'input';
    on[event] = [].concat(on[RANGE_TOKEN], on[event] || []);
    delete on[RANGE_TOKEN];
  }

  // 这最初是为了修复 #4521 ，但在 2.5 之后就没有必要了。保持它与 < 2.4 生成的代码的向后兼容
  if (isDef(on[CHECKBOX_RADIO_TOKEN])) {
    on.change = [].concat(on[CHECKBOX_RADIO_TOKEN], on.change || []);
    delete on[CHECKBOX_RADIO_TOKEN];
  }
}

let target: any;

/* => 创建一次性事件处理程序 */
function createOnceHandler(event, handler, capture) {
  // => 在闭包中保存当前目标元素
  const _target = target;

  return function onceHandler() {
    const res = handler.apply(null, arguments);

    // => 只有返回值不是 null 时才进行解绑
    if (res !== null) remove(event, onceHandler, capture, _target);
  };
}

// => Firefox <= 53(特别是 esr52 )有不正确的事件。时间戳实现，并且不会在事件传播之间触发微任务，所以可以安全排除。
const useMicrotaskFix = isUsingMicroTask && !(isFF && Number(isFF[1]) <= 53);

function add(name: string, handler: Function, capture: boolean, passive: boolean) {
  /**
   * 异步边缘情况：内部点击事件触发补丁，事件处理程序附加到外部元素在补丁期间，并再次触发。
   * 这是因为浏览器在事件传播之间触发微任务。
   * 解决方案很简单：我们在附加处理程序时保存时间戳，并且只有当传递给它的事件在附加后被触发时，处理程序才会触发。
   */
  if (useMicrotaskFix) {
    const attachedTimestamp = currentFlushTimestamp;
    const original = handler;

    // => 为回调函数做包装：当事件触发时，若回调中修改了数据而触发更新 DOM 操作，那么该更新操作将会被推送到微任务队列中
    handler = original._wrapper = function (e) {
      /**
       * 1.不要冒泡，要随时开火。这只是以防万一的安全网。在某些奇怪的环境中，时间戳是不可靠的 ……
       * 2.事件在处理程序连接后触发
       * 3.保释有 bug 事件的环境。时间戳的实现：
       *    IOS 9 Bug：事件时间戳在 history.pushState 之后为 0
       *    QtWebEngine：事件时间戳是负值
       * 4.如果事件在一个 multi-page electron / nw.js 应用程序的另一个文档中被触发，则保释，因为事件时间戳将使用不同的起始引用
       */
      if (e.target === e.currentTarget || e.timeStamp >= attachedTimestamp || e.timeStamp <= 0 || e.target.ownerDocument !== document) {
        return original.apply(this, arguments);
      }
    };
  }

  // => 调用浏览器原生 API 给 target 这个 DOM 元素注册事件
  target.addEventListener(name, handler, supportsPassive ? { capture, passive } : capture);
}

function remove(name: string, handler: Function, capture: boolean, _target?: HTMLElement) {
  // => 调用浏览器原生 API 给 target 这个 DOM 元素移除事件（优先解绑已包装的事件处理程序）
  (_target || target).removeEventListener(name, handler._wrapper || handler, capture);
}

/* => 更新 DOM 事件监听器 */
function updateDOMListeners(oldVnode: VNodeWithData, vnode: VNodeWithData) {
  // => 没有任何事件，终止程序
  if (isUndef(oldVnode.data.on) && isUndef(vnode.data.on)) return;

  // => 模板解析到生成 VNode 时，事件会保存在 VNode.data.on 对象中
  const on = vnode.data.on || {};
  const oldOn = oldVnode.data.on || {};

  // => 当前 VNode 对应的 DOM 元素
  target = vnode.elm;

  // => 规范化事件对象
  normalizeEvents(on);

  // => 更新事件监听器
  updateListeners(on, oldOn, add, remove, createOnceHandler, vnode.context);

  target = undefined;
}

export default { create: updateDOMListeners, update: updateDOMListeners };
