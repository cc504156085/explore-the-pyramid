/* @flow */

import { warn } from 'core/util/index';

export * from './attrs';
export * from './class';
export * from './element';

/** => 如果元素选择器不是元素，则获取它
 * Query an element selector if it's not an element already.
 */
export function query(el: string | Element): Element {
  /* => 如果el是字符串，则说明并没有获取 */
  if (typeof el === 'string') {
    const selected = document.querySelector(el);

    /* => 找不到该元素就创建一个空div标签 */
    if (!selected) {
      process.env.NODE_ENV !== 'production' && warn('Cannot find element: ' + el);
      return document.createElement('div');
    }

    /* => 找到了就返回 */
    return selected;
  } else {
    /* => 说明用户已经获取了元素 */
    return el;
  }
}
