/* @flow */

import VNode from '../vnode';
import { createFnInvoker } from './update-listeners';
import { remove, isDef, isUndef, isTrue } from 'shared/util';

/* => 合并 VNode 钩子 */
export function mergeVNodeHook(def: Object, hookKey: string, hook: Function) {
  if (def instanceof VNode) def = def.data.hook || (def.data.hook = {});

  let invoker;
  const oldHook = def[hookKey];

  function wrappedHook() {
    hook.apply(this, arguments);
    // => 重要提示：删除合并的钩子，以确保它只被调用一次，并防止内存泄漏
    remove(invoker.fns, wrappedHook);
  }

  if (isUndef(oldHook)) {
    // => 没有现有的钩子
    invoker = createFnInvoker([wrappedHook]);
  } else {
    if (isDef(oldHook.fns) && isTrue(oldHook.merged)) {
      // => 已经合并的调用程序
      invoker = oldHook;
      invoker.fns.push(wrappedHook);
    } else {
      // => 现有普通钩子
      invoker = createFnInvoker([oldHook, wrappedHook]);
    }
  }

  invoker.merged = true;
  def[hookKey] = invoker;
}
