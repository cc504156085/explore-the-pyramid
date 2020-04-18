/* @flow */

import { isRegExp, remove } from 'shared/util';
import { getFirstComponentChild } from 'core/vdom/helpers/index';

type VNodeCache = { [key: string]: ?VNode };

/* => 获取组件名 */
function getComponentName(opts: ?VNodeComponentOptions): ?string {
  return opts && (opts.Ctor.options.name || opts.tag);
}

/* => 匹配 */
function matches(pattern: string | RegExp | Array<string>, name: string): boolean {
  if (Array.isArray(pattern)) {
    return pattern.indexOf(name) > -1;
  } else if (typeof pattern === 'string') {
    return pattern.split(',').indexOf(name) > -1;
  } else if (isRegExp(pattern)) {
    return pattern.test(name);
  }
  /* istanbul ignore next */
  return false;
}

/* => 删除缓存 */
function pruneCache(keepAliveInstance: any, filter: Function) {
  const { cache, keys, _vnode } = keepAliveInstance;
  for (const key in cache) {
    const cachedNode: ?VNode = cache[key];
    if (cachedNode) {
      const name: ?string = getComponentName(cachedNode.componentOptions);
      if (name && !filter(name)) {
        pruneCacheEntry(cache, key, keys, _vnode);
      }
    }
  }
}

/* => 删除缓存条目 */
function pruneCacheEntry(cache: VNodeCache, key: string, keys: Array<string>, current?: VNode) {
  // => 获取属性值（组件实例 VNode）
  const cached = cache[key];

  if (cached && (!current || cached.tag !== current.tag)) {
    // => 销毁组件实例
    cached.componentInstance.$destroy();
  }

  // => 置空并从键数组中移除
  cache[key] = null;
  remove(keys, key);
}

// 接受一个数组，可支持 String 、RegExp、Array 类型
const patternTypes: Array<Function> = [String, RegExp, Array];

/* => LRU 最近最久未使用算法 */
export default {
  name: 'keep-alive',
  abstract: true, // => 抽象组件

  props: {
    include: patternTypes,
    exclude: patternTypes,
    max: [String, Number],
  },

  created() {
    // => 实例创建时 | 创建缓存对象与键集合数组
    this.cache = Object.create(null);
    this.keys = [];
  },

  destroyed() {
    // => 实例销毁时 | 挨个删除缓存条目
    for (const key in this.cache) {
      pruneCacheEntry(this.cache, key, this.keys);
    }
  },

  mounted() {
    // => 实例挂载时 |
    this.$watch('include', (val) => {
      pruneCache(this, (name) => matches(val, name));
    });
    this.$watch('exclude', (val) => {
      pruneCache(this, (name) => !matches(val, name));
    });
  },

  render() {
    const slot = this.$slots.default;
    const vnode: VNode = getFirstComponentChild(slot);
    const componentOptions: ?VNodeComponentOptions = vnode && vnode.componentOptions;
    if (componentOptions) {
      // check pattern => 检查模式
      const name: ?string = getComponentName(componentOptions);
      const { include, exclude } = this;
      if (
        // not included => 不包括
        (include && (!name || !matches(include, name))) ||
        // excluded => 被排除在外
        (exclude && name && matches(exclude, name))
      ) {
        return vnode;
      }

      const { cache, keys } = this;
      const key: ?string =
        vnode.key == null
          ? // same constructor may get registered as different local components
            // so cid alone is not enough (#3269) => 相同的构造函数可能被注册为不同的本地组件，因此仅使用 cid 是不够的
            componentOptions.Ctor.cid + (componentOptions.tag ? `::${componentOptions.tag}` : '')
          : vnode.key;
      if (cache[key]) {
        vnode.componentInstance = cache[key].componentInstance;
        // make current key freshest => 使当前键为最新
        remove(keys, key);
        keys.push(key);
      } else {
        cache[key] = vnode;
        keys.push(key);
        // prune oldest entry => 删除最老的条目（LRU 算法）
        if (this.max && keys.length > parseInt(this.max)) {
          pruneCacheEntry(cache, keys[0], keys, this._vnode);
        }
      }

      vnode.data.keepAlive = true;
    }
    return vnode || (slot && slot[0]);
  },
};
