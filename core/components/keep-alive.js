import { isRegExp, remove } from 'shared/util';
import { getFirstComponentChild } from 'core/vdom/helpers/index';

type VNodeCache = { [key: string]: ?VNode };

/* => 获取组件名 */
function getComponentName(opts: ?VNodeComponentOptions): ?string {
  return opts && (opts.Ctor.options.name || opts.tag);
}

/* => 检查 name 是否匹配 */
function matches(pattern: string | RegExp | Array<string>, name: string): boolean {
  if (Array.isArray(pattern)) {
    return pattern.indexOf(name) > -1;
  } else if (typeof pattern === 'string') {
    // => 字符串情况，如：a,b,c
    return pattern.split(',').indexOf(name) > -1;
  } else if (isRegExp(pattern)) {
    // => 正则情况
    return pattern.test(name);
  }

  return false;
}

/* => 维持（修正）缓存 */
function pruneCache(keepAliveInstance: any, filter: Function) {
  const { cache, keys, _vnode } = keepAliveInstance;
  for (const key in cache) {
    // => 取出缓存中的 VNode
    const cachedNode: ?VNode = cache[key];
    if (cachedNode) {
      const name: ?string = getComponentName(cachedNode.componentOptions);

      // => 若 name 不符合 filter 条件
      if (name && !filter(name)) pruneCacheEntry(cache, key, keys, _vnode);
    }
  }
}

/* => 删除缓存条目 */
function pruneCacheEntry(cache: VNodeCache, key: string, keys: Array<string>, current?: VNode) {
  // => 获取属性值（组件实例 VNode）
  const cached = cache[key];

  // => 销毁组件实例
  if (cached && (!current || cached.tag !== current.tag)) cached.componentInstance.$destroy();

  // => 置空并从缓存中移除（会被垃圾回收机制回收）
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
    max: [String, Number],
    include: patternTypes,
    exclude: patternTypes,
  },

  created() {
    // => 实例创建时 | 创建缓存对象与键集合数组
    this.keys = [];
    this.cache = Object.create(null);
  },

  destroyed() {
    // => 实例销毁时 | 挨个删除缓存条目
    for (const key in this.cache) pruneCacheEntry(this.cache, key, this.keys);
  },

  mounted() {
    // => 实例挂载时 |
    this.$watch('include', (val) => pruneCache(this, (name) => matches(val, name)));
    this.$watch('exclude', (val) => pruneCache(this, (name) => !matches(val, name)));
  },

  render() {
    // => keep-alive 组件包含的内容
    const slot = this.$slots.default;

    // => 获得内容中的第一个子组件节点（不是普通元素节点）
    const vnode: VNode = getFirstComponentChild(slot);

    // => 拿到该子组件选项
    const componentOptions: ?VNodeComponentOptions = vnode && vnode.componentOptions;
    if (componentOptions) {
      // => 检查且获取组件名
      const name: ?string = getComponentName(componentOptions);
      const { include, exclude } = this;

      // => 匹配组件名是否包含在 props 的 include 与 exclude 内，来决定要不要缓存
      if ((include && (!name || !matches(include, name))) || (exclude && name && matches(exclude, name))) return vnode;

      const { cache, keys } = this;

      // => 若组件的 key 未定义，则使用组件的 cid 与标签名拼接一个
      const key: ?string =
        vnode.key == null
          ? // => 相同的构造函数可能被注册为不同的本地组件，因此仅使用 cid 是不够的
          componentOptions.Ctor.cid + (componentOptions.tag ? `::${ componentOptions.tag }` : '')
          : vnode.key;

      // => LRU 缓存策略
      if (cache[key]) {

        // => 用于调研销毁组件 hook
        vnode.componentInstance = cache[key].componentInstance;

        // => 使当前 key 为最新（放到最后）
        remove(keys, key);
        keys.push(key);
      } else {
        // => 缓存 VNode 与 key
        cache[key] = vnode;
        keys.push(key);

        // => 删除最老的条目
        if (this.max && keys.length > parseInt(this.max)) pruneCacheEntry(cache, keys[0], keys, this._vnode);
      }

      // => 标识为缓存组件
      vnode.data.keepAlive = true;
    }

    // => 返回不需要缓存 VNode 或缓存的第一个子组件
    return vnode || (slot && slot[0]);
  },
};
