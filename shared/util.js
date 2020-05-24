/* @flow */

export const emptyObject = Object.freeze({});

/* => 这些工具含食宿由于其明确性和函数内联性，在JS引擎中生成了更好的VM代码。 */
// These helpers produce better VM code in JS engines due to their
// explicitness and function inlining.

/* => 是否未定义（null） */
export function isUndef(v: any): boolean %checks {
  return v === undefined || v === null;
}

/* => 是否已定义（非null） */
export function isDef(v: any): boolean %checks {
  return v !== undefined && v !== null;
}

/* => 是否是true */
export function isTrue(v: any): boolean %checks {
  return v === true;
}

/* => 是否是false */
export function isFalse(v: any): boolean %checks {
  return v === false;
}

/** => 检查值是否为原始值。
 * Check if value is primitive.
 */
export function isPrimitive(value: any): boolean %checks {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'symbol' || typeof value === 'boolean';
}

/** => 快速对象（数组、正则、函数）检查，当我们知道值是符合 JSON 的类型时，它主要用于区分对象和原始值。
 * Quick object check - this is primarily used to tell
 * Objects from primitive values when we know the value
 * is a JSON-compliant type.
 */
export function isObject(obj: mixed): boolean %checks {
  return obj !== null && typeof obj === 'object';
}

/** => 获取值的原始类型字符串，例如，[object Object]。
 * Get the raw type string of a value, e.g., [object Object].
 */
const _toString = Object.prototype.toString;

/* => 拿到原始类型，例如： [object Number] 中的 Number */
export function toRawType(value: any): string {
  return _toString.call(value).slice(8, -1);
}

/** => 严格的对象类型检查。仅对纯 JavaScript 对象返回 true。
 * Strict object type check. Only returns true
 * for plain JavaScript objects.
 */
export function isPlainObject(obj: any): boolean {
  return _toString.call(obj) === '[object Object]';
}

/* => 是否是正则 */
export function isRegExp(v: any): boolean {
  return _toString.call(v) === '[object RegExp]';
}

/** => 检查 val 是否是有效的数组索引。
 * Check if val is a valid array index.
 */
export function isValidArrayIndex(val: any): boolean {
  const n = parseFloat(String(val));
  return n >= 0 && Math.floor(n) === n && isFinite(val);
}

/* => 是否是 Promise */
export function isPromise(val: any): boolean {
  return isDef(val) && typeof val.then === 'function' && typeof val.catch === 'function';
}

/** => 将值转换为实际的字符串。
 * Convert a value to a string that is actually rendered.
 */
export function toString(val: any): string {
  return val == null
    ? ''
    : Array.isArray(val) || (isPlainObject(val) && val.toString === _toString)
    ? JSON.stringify(val, null, 2)
    : String(val);
}

/**
 * Convert an input value to a number for persistence. => 将输入值转换为数字以进行持久化
 * If the conversion fails, return original string.    => 如果转换失败，则返回原始字符串
 */
export function toNumber(val: string): number | string {
  const n = parseFloat(val);
  return isNaN(n) ? val : n;
}

/** => 生成一个 map 并返回一个函数，用于检查该 map 中是否有 key
 * Make a map and return a function for checking if a key
 * is in that map.
 */
export function makeMap(str: string, expectsLowerCase?: boolean): (key: string) => true | void {
  const map = Object.create(null);
  const list: Array<string> = str.split(',');
  for (let i = 0; i < list.length; i++) {
    map[list[i]] = true;
  }
  return expectsLowerCase ? (val) => map[val.toLowerCase()] : (val) => map[val];
}

/** => 检查标记是否为内置标记
 * Check if a tag is a built-in tag.
 */
export const isBuiltInTag = makeMap('slot,component', true);

/** => 检查属性是否为保留属性。
 * Check if an attribute is a reserved attribute.
 */
export const isReservedAttribute = makeMap('key,ref,slot,slot-scope,is');

/** => 从数组中移除项。
 * Remove an item from an array.
 */
export function remove(arr: Array<any>, item: any): Array<any> | void {
  if (arr.length) {
    const index = arr.indexOf(item);
    if (index > -1) {
      return arr.splice(index, 1);
    }
  }
}

/** => 检查对象是否具有属性。
 * Check whether an object has the property.
 */
const hasOwnProperty = Object.prototype.hasOwnProperty;
export function hasOwn(obj: Object | Array<*>, key: string): boolean {
  return hasOwnProperty.call(obj, key);
}

/** => 创建纯函数的缓存版本。
 * Create a cached version of a pure function.
 */
export function cached<F: Function>(fn: F): F {
  const cache = Object.create(null);
  return (function cachedFn(str: string) {
    const hit = cache[str];
    return hit || (cache[str] = fn(str));
  }: any);
}

/** => 将连字符变量转化成驼峰变量。
 * Camelize a hyphen-delimited string.
 */
const camelizeRE = /-(\w)/g;
export const camelize = cached((str: string): string => {
  return str.replace(camelizeRE, (_, c) => (c ? c.toUpperCase() : ''));
});

/** => 将首字母大写。
 * Capitalize a string.
 */
export const capitalize = cached((str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1);
});

/** => 用连字符连接camelCase字符串
 * Hyphenate a camelCase string.
 */
const hyphenateRE = /\B([A-Z])/g;
export const hyphenate = cached((str: string): string => {
  return str.replace(hyphenateRE, '-$1').toLowerCase();
});

/**
 * Simple bind polyfill for environments that do not support it,    => 简单绑定polyfill适用于不支持它的环境，例如PhantomJS 1.x。
 * e.g., PhantomJS 1.x. Technically, we don't need this anymore     => 从技术上讲，我们不再需要它了，
 * since native bind is now performant enough in most browsers.     => 因为本机绑定现在在大多数浏览器中已经有足够的性能了。
 * But removing it would mean breaking code that was able to run in => 但是删除它将意味着破坏能够在PhantomJS 1.x中运行的代码，
 * PhantomJS 1.x, so this must be kept for backward compatibility.  => 因此必须保留这些代码以实现向后兼容。
 */

/* istanbul ignore next */
/* => 扩展（补充、兼容、全方面）bind方法 */
function polyfillBind(fn: Function, ctx: Object): Function {
  function boundFn(a) {
    const l = arguments.length;
    return l ? (l > 1 ? fn.apply(ctx, arguments) : fn.call(ctx, a)) : fn.call(ctx);
  }

  boundFn._length = fn.length;
  return boundFn;
}

/* => 原生 bind 方法 */
function nativeBind(fn: Function, ctx: Object): Function {
  return fn.bind(ctx);
}

/* => bind 方法兼容选取 */
export const bind = Function.prototype.bind ? nativeBind : polyfillBind;

/** => 将类数组对象转换为真实数组。
 * Convert an Array-like object to a real Array.
 */
export function toArray(list: any, start?: number): Array<any> {
  start = start || 0;
  let i = list.length - start;
  const ret: Array<any> = new Array(i);
  while (i--) {
    ret[i] = list[i + start];
  }
  return ret;
}

/* => 将属性混合到目标对象中 */
export function extend(to: Object, _from: ?Object): Object {
  for (const key in _from) {
    to[key] = _from[key];
  }
  return to;
}

/** => 将对象数组合并为单个对象。
 * Merge an Array of Objects into a single Object.
 */
export function toObject(arr: Array<any>): Object {
  const res = {};
  for (let i = 0; i < arr.length; i++) {
    if (arr[i]) {
      extend(res, arr[i]);
    }
  }
  return res;
}

/**
 * Perform no operation. => 不执行任何操作。
 * Stubbing args to make Flow happy without leaving useless transpiled code => 在不留下无用的透明的代码的情况下使flow愉快的存根参数
 * with ...rest (https://flow.org/blog/2017/05/07/Strict-Function-Call-Arity/).
 */
export function noop(a?: any, b?: any, c?: any) {}

/** => 总是返回false。
 * Always return false.
 */
export const no = (a?: any, b?: any, c?: any) => false;

/** => 返回相同的值。
 * Return the same value.
 */
export const identity = (_: any) => _;

/** => 从编译器模块生成包含静态键的字符串。
 * Generate a string containing static keys from compiler modules.
 */
export function genStaticKeys(modules: Array<ModuleOptions>): string {
  return modules
    .reduce((keys, m) => {
      return keys.concat(m.staticKeys || []);
    }, [])
    .join(',');
}

/** => 检查两个值是否大致相等 — 也就是说，如果它们是普通对象，它们是否具有相同的形状？（内部是否相等）
 * Check if two values are loosely equal - that is,
 * if they are plain objects, do they have the same shape?
 */
export function looseEqual(a: any, b: any): boolean {
  /* => 1.如果两个值（原始值）相等，返回true */
  if (a === b) return true;

  /* => 2.判断两个值（非null）是否为对象 */
  const isObjectA = isObject(a);
  const isObjectB = isObject(b);

  if (isObjectA && isObjectB) {
    try {
      /* => 3.尝试转化为数组（有可能是对象数组） */
      const isArrayA = Array.isArray(a);
      const isArrayB = Array.isArray(b);

      /* => 如果能转化成数组，则判断原来的值的长度是否相等 */
      if (isArrayA && isArrayB) {
        /* => 如果相等且递归遍历每一项是否都相等 */
        return a.length === b.length && a.every((e, i) => looseEqual(e, b[i]));

        /* => 4.判断是否是日期类型 */
      } else if (a instanceof Date && b instanceof Date) {
        /* => 如果适合日期类型，则判断它们的时间戳是否相等 */
        return a.getTime() === b.getTime();

        /* => 5.如果它们不是对象数组（是纯粹对象） */
      } else if (!isArrayA && !isArrayB) {
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);

        /* => 比较两个值的属性个数是否相等，再递归比较属性值是否相等 */
        return keysA.length === keysB.length && keysA.every((key) => looseEqual(a[key], b[key]));
      } else {
        /* istanbul ignore next */
        return false;
      }
    } catch (e) {
      /* istanbul ignore next */
      return false;
    }

    /* => 6.如果他们都不是对象，则转化成字符串比较 */
  } else if (!isObjectA && !isObjectB) {
    return String(a) === String(b);
  } else {
    return false;
  }
}

/** => 返回第一个索引，在该索引处可以在数组中找到大致相等的值（如果值是普通对象，则数组必须包含相同形状的对象），如果不存在，则返回-1。
 * Return the first index at which a loosely equal value can be
 * found in the array (if value is a plain object, the array must
 * contain an object of the same shape), or -1 if it is not present.
 */

/* => 给定一个数组和一项，判断数组中是否存在该项，存在则返回索引，不存在则返回-1 */
export function looseIndexOf(arr: Array<mixed>, val: mixed): number {
  for (let i = 0; i < arr.length; i++) {
    if (looseEqual(arr[i], val)) return i;
  }
  return -1;
}

/** => 确保只调用一次函数。
 * Ensure a function is called only once.
 */
export function once(fn: Function): Function {
  /* => 利用闭包机制，初始化一个false标记 */
  let called = false;
  return function () {
    /* => 在调用该函数执行后，判断标记 */
    if (!called) {
      /* => 进入判断后将其标记为true，之后再调用都进不来该判断 */
      called = true;
      fn.apply(this, arguments);
    }
  };
}
