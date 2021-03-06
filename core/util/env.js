// => 我们能用 __proto__ 吗？（非标准属性，某些浏览器不支持）
export const hasProto = '__proto__' in {};

// => 浏览器环境检测
export const inBrowser = typeof window !== 'undefined';
export const inWeex = typeof WXEnvironment !== 'undefined' && !!WXEnvironment.platform;
export const weexPlatform = inWeex && WXEnvironment.platform.toLowerCase();
export const UA = inBrowser && window.navigator.userAgent.toLowerCase();
export const isIE = UA && /msie|trident/.test(UA);
export const isIE9 = UA && UA.indexOf('msie 9.0') > 0;
export const isEdge = UA && UA.indexOf('edge/') > 0;
export const isAndroid = (UA && UA.indexOf('android') > 0) || weexPlatform === 'android';
export const isIOS = (UA && /iphone|ipad|ipod|ios/.test(UA)) || weexPlatform === 'ios';
export const isChrome = UA && /chrome\/\d+/.test(UA) && !isEdge;
export const isPhantomJS = UA && /phantomjs/.test(UA);
export const isFF = UA && UA.match(/firefox\/(\d+)/);

// => Firefox 在 Object.prototype 上有一个 watch 函数。。。
export const nativeWatch = {}.watch;

export let supportsPassive = false;
if (inBrowser) {
  try {
    const opts = {};
    Object.defineProperty(opts, 'passive', {
      get() {
        supportsPassive = true;
      },
    });
    window.addEventListener('test-passive', null, opts);
  } catch (e) {}
}

// => 这需要延迟评估，因为在 vue-server-renderer 设置 VUE_ENV 之前可能需要 vue
let _isServer;
export const isServerRendering = () => {
  if (_isServer === undefined) {
    if (!inBrowser && !inWeex && typeof global !== 'undefined') {
      // => 检测 vue-server-renderer 的存在，避免 Webpack 对进程的影响
      _isServer = global['process'] && global['process'].env.VUE_ENV === 'server';
    } else {
      _isServer = false;
    }
  }
  return _isServer;
};

// 检测 devtools
export const devtools = inBrowser && window.__VUE_DEVTOOLS_GLOBAL_HOOK__;

export function isNative(Ctor: any): boolean {
  return typeof Ctor === 'function' && /native code/.test(Ctor.toString());
}

export const hasSymbol = typeof Symbol !== 'undefined' && isNative(Symbol) && typeof Reflect !== 'undefined' && isNative(Reflect.ownKeys);

let _Set;
if (typeof Set !== 'undefined' && isNative(Set)) {
  _Set = Set;
} else {
  // => 一个非标准的集合填充，只对基本键起作用
  _Set = class Set implements SimpleSet {
    set: Object;
    constructor() {
      this.set = Object.create(null);
    }
    has(key: string | number) {
      return this.set[key] === true;
    }
    add(key: string | number) {
      this.set[key] = true;
    }
    clear() {
      this.set = Object.create(null);
    }
  };
}

export interface SimpleSet {
  has(key: string | number): boolean;
  add(key: string | number): mixed;
  clear(): void;
}

export { _Set };
