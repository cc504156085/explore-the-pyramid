import { cached, extend, toObject } from 'shared/util';

export const parseStyleText = cached(function (cssText) {
  const res = {};
  const listDelimiter = /;(?![^(]*\))/g;
  const propertyDelimiter = /:(.+)/;
  cssText.split(listDelimiter).forEach(function (item) {
    if (item) {
      const tmp = item.split(propertyDelimiter);
      tmp.length > 1 && (res[tmp[0].trim()] = tmp[1].trim());
    }
  });
  return res;
});

// => 在同一 vnode 上合并静态和动态样式数据
function normalizeStyleData(data: VNodeData): ?Object {
  const style = normalizeStyleBinding(data.style);
  // => 静态样式在编译过程中已预处理为一个对象，并且始终是新鲜对象，因此可以安全地合并到其中
  return data.staticStyle ? extend(data.staticStyle, style) : style;
}

// => 将可能的数组/字符串值标准化为对象
export function normalizeStyleBinding(bindingStyle: any): ?Object {
  if (Array.isArray(bindingStyle)) return toObject(bindingStyle);
  if (typeof bindingStyle === 'string') return parseStyleText(bindingStyle);
  return bindingStyle;
}

/* => 父组件的样式应在 child 之后，以便父组件的样式可以覆盖它 */
export function getStyle(vnode: VNodeWithData, checkChild: boolean): Object {
  const res = {};
  let styleData;

  if (checkChild) {
    let childNode = vnode;
    while (childNode.componentInstance) {
      childNode = childNode.componentInstance._vnode;
      if (childNode && childNode.data && (styleData = normalizeStyleData(childNode.data))) {
        extend(res, styleData);
      }
    }
  }

  if ((styleData = normalizeStyleData(vnode.data))) extend(res, styleData);

  let parentNode = vnode;
  while ((parentNode = parentNode.parent)) {
    if (parentNode.data && (styleData = normalizeStyleData(parentNode.data))) {
      extend(res, styleData);
    }
  }
  return res;
}
