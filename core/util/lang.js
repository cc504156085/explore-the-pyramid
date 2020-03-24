/* @flow */

/** => 用于解析 html 标记、组件名称和属性路径的 unicode 字母。
 * unicode letters used for parsing html tags, component names and property paths.
 * using https://www.w3.org/TR/html53/semantics-scripting.html#potentialcustomelementname
 * skipping \u10000-\uEFFFF due to it freezing up PhantomJS
 */
export const unicodeRegExp = /a-zA-Z\u00B7\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u037D\u037F-\u1FFF\u200C-\u200D\u203F-\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD/;

/** => 检查字符串是否以 $ 或 _ 开头
 * Check if a string starts with $ or _
 */
export function isReserved(str: string): boolean {
  const c = (str + '').charCodeAt(0);
  return c === 0x24 || c === 0x5f;
}

/** => 定义一个属性
 * Define a property.
 */
export function def(obj: Object, key: string, val: any, enumerable?: boolean) {
  Object.defineProperty(obj, key, {
    value: val,
    enumerable: !!enumerable,
    writable: true,
    configurable: true,
  });
}

/** => 解析简单路径。例如访问 data.a.b.c 的属性值
 * Parse simple path.
 */
const bailRE = new RegExp(`[^${unicodeRegExp.source}.$_\\d]`);
export function parsePath(path: string): any {
  if (bailRE.test(path)) {
    return;
  }

  /* => 以 . 分割 */
  const segments = path.split('.');

  /* => 返回一个函数 */
  return function(obj) {
    for (let i = 0; i < segments.length; i++) {
      if (!obj) return;

      /* => 获取到子对象后重新赋值 */
      obj = obj[segments[i]];
    }
    return obj;
  };
}
