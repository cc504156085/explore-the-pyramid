import { _Set as Set, isObject } from '../util/index';
import type { SimpleSet } from '../util/index';
import VNode from '../vdom/vnode';

const seenObjects = new Set();

/**
 * => 递归遍历对象以调用所有转换的 getter
 * => 以便对象中的每个嵌套属性都作为深层依赖项收集。
 */
export function traverse(val: any) {
  _traverse(val, seenObjects);
  seenObjects.clear();
}

function _traverse(val: any, seen: SimpleSet) {
  let i, keys;
  const isA = Array.isArray(val);

  /* => 如果 val 既不是数组也不是对象，或者已经被冻结 */
  if ((!isA && !isObject(val)) || Object.isFrozen(val) || val instanceof VNode) return;

  /* => 保证不会重复收集依赖 */
  if (val.__ob__) {
    const depId = val.__ob__.dep.id;
    if (seen.has(depId)) return;
    seen.add(depId);
  }

  /* => 如果是数组，则递归侦测数组的每一项 */
  if (isA) {
    i = val.length;
    while (i--) _traverse(val[i], seen);
  } else {
    /* => 如果是对象，则递归侦测对象的每一个属性值 */
    keys = Object.keys(val);
    i = keys.length;
    while (i--) _traverse(val[keys[i]], seen);
  }
}
