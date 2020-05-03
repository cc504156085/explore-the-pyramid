/* @flow */

import { identity, resolveAsset } from 'core/util/index';

/**
 * 解析过滤器的运行时助手
 */
export function resolveFilter(id: string): Function {
  // => 查找过滤器，如果找到了就返回该过滤器，找不到就返回函数（该函数返回与参数相同的值）
  return resolveAsset(this.$options, 'filters', id, true) || identity;
}
