/* @flow */

import { def } from 'core/util/lang';
import { normalizeChildren } from 'core/vdom/helpers/normalize-children';
import { emptyObject } from 'shared/util';

/* => 规范化作用域插槽（复数） */
export function normalizeScopedSlots(
  slots: { [key: string]: Function } | void,
  normalSlots: { [key: string]: Array<VNode> },
  prevSlots?: { [key: string]: Function } | void,
): any {
  let res;
  const hasNormalSlots = Object.keys(normalSlots).length > 0;
  const isStable = slots ? !!slots.$stable : !hasNormalSlots;
  const key = slots && slots.$key;
  if (!slots) {
    res = {};
  } else if (slots._normalized) {
    // => 快速路径 1 ：子组件只重新渲染，父组件没有改变
    return slots._normalized;
  } else if (isStable && prevSlots && prevSlots !== emptyObject && key === prevSlots.$key && !hasNormalSlots && !prevSlots.$hasNormal) {
    // => 快速路径 2 ：稳定作用域的插槽没有正常的插槽到代理，只需要规范化一次
    return prevSlots;
  } else {
    res = {};
    for (const key in slots) {
      if (slots[key] && key[0] !== '$') res[key] = normalizeScopedSlot(normalSlots, key, slots[key]);
    }
  }

  // => 在作用域插槽上公开普通插槽
  for (const key in normalSlots) {
    if (!(key in res)) res[key] = proxyNormalSlot(normalSlots, key);
  }

  // => 似乎模仿了一个不可扩展的 $scopedSlot 对象，当它被传递下去时，将会导致一个错误
  if (slots && Object.isExtensible(slots)) slots._normalized = res;

  def(res, '$stable', isStable);
  def(res, '$key', key);
  def(res, '$hasNormal', hasNormalSlots);

  return res;
}

/* => 规范化作用域插槽（单数） */
function normalizeScopedSlot(normalSlots, key, fn) {
  const normalized = function () {
    let res = arguments.length ? fn.apply(null, arguments) : fn({});

    // => 单个 VNode [ res ]
    res = res && typeof res === 'object' && !Array.isArray(res) ? [res] : normalizeChildren(res);

    return res && (res.length === 0 || (res.length === 1 && res[0].isComment)) ? undefined : res;
  };

  /**
   * 这是一个使用新 v-slot 语法的插槽，没有作用域。
   * 虽然它被编译为有作用域的插槽，但渲染函数用户会希望它出现 this.$slot 上，因为它的使用在语义上是一个规范的 slot 。
   */
  if (fn.proxy) Object.defineProperty(normalSlots, key, { get: normalized, enumerable: true, configurable: true });

  return normalized;
}

/* => 代理规范化后的插槽 */
function proxyNormalSlot(slots, key) {
  return () => slots[key];
}
