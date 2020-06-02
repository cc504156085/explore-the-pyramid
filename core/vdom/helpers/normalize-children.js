import VNode, { createTextVNode } from 'core/vdom/vnode';
import { isFalse, isTrue, isDef, isUndef, isPrimitive } from 'shared/util';

/**
 * 模板编译器试图通过在编译时静态分析模板来最小化对标准化的需求。
 * 对于普通 HTML 标记，可以完全跳过标准化，因为生成的渲染函数保证返回数组。
 * 有两种情况需要额外的标准化：
 * 1.当子组件包含组件时，因为函数组件可能返回一个数组而不是单个根节点。
 *   在这种情况下，只需要一个简单的标准化，如果任何子元素是一个数组，
 *   那么我们就用 Array.prototype.concat 将其整平。
 *   它被保证只有 1 层的深度，因为功能组件已经将它们自己的子组件标准化了。
 * 2.当子元素包含总是生成嵌套数组的结构时，例如 <template> ， <slot> ， v-for ，
 *   或者当子元素由用户提供手工编写的渲染函数/ JSX 时。
 *   在这种情况下，需要进行充分的规范化，以满足所有可能类型的子值。
 */

/* => 1.规范化简单的子节点 */
export function simpleNormalizeChildren(children: any) {
  for (let i = 0; i < children.length; i++) {
    if (Array.isArray(children[i])) return Array.prototype.concat.apply([], children);
  }

  return children;
}

/* => 2.规范化嵌套结构子节点 */
export function normalizeChildren(children: any): ?Array<VNode> {
  return isPrimitive(children) ? [createTextVNode(children)] : Array.isArray(children) ? normalizeArrayChildren(children) : undefined;
}

/* => 是否是文本节点 */
function isTextNode(node): boolean {
  return isDef(node) && isDef(node.text) && isFalse(node.isComment);
}

/* => 规范化数组子节点 */
function normalizeArrayChildren(children: any, nestedIndex?: string): Array<VNode> {
  const res = [];
  let i, c, lastIndex, last;

  for (i = 0; i < children.length; i++) {
    c = children[i];

    if (isUndef(c) || typeof c === 'boolean') continue;

    lastIndex = res.length - 1;
    last = res[lastIndex];

    // => 嵌套的
    if (Array.isArray(c)) {
      if (c.length > 0) {
        c = normalizeArrayChildren(c, `${ nestedIndex || '' }_${ i }`);
        // => 合并相邻的文本节点
        if (isTextNode(c[0]) && isTextNode(last)) {
          res[lastIndex] = createTextVNode(last.text + (c[0]: any).text);
          c.shift();
        }

        res.push.apply(res, c);
      }
    } else if (isPrimitive(c)) {
      if (isTextNode(last)) {
        // => 合并相邻的文本节点，这对于 SSR 混合是必要的，因为文本节点在渲染为 HTML 字符串时本质上是合并的
        res[lastIndex] = createTextVNode(last.text + c);
      } else if (c !== '') {
        // => 将原生转换为 vnode
        res.push(createTextVNode(c));
      }
    } else {
      if (isTextNode(c) && isTextNode(last)) {
        // => 合并相邻的文本节点
        res[lastIndex] = createTextVNode(last.text + c.text);
      } else {
        // => 嵌套数组子元素的默认键(可能由 v-for 生成)
        if (isTrue(children._isVList) && isDef(c.tag) && isUndef(c.key) && isDef(nestedIndex)) c.key = `__vlist${ nestedIndex }_${ i }__`;

        res.push(c);
      }
    }
  }

  return res;
}
