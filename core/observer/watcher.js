import { warn, remove, isObject, parsePath, _Set as Set, handleError, noop } from '../util/index';
import { traverse } from './traverse';
import { queueWatcher } from './scheduler';
import Dep, { pushTarget, popTarget } from './dep';
import type { SimpleSet } from '../util/index';

let uid = 0;

/**
 * => 一个 Watcher 解析表达式，收集依赖项
 * => 并在表达式值更改时触发回调。
 * => 这用于 $watch() api 和指令。
 */
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;
  lazy: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean;
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  before: ?Function;
  getter: Function;
  value: any;

  /* => 实例、表达式、回调函数、配置选项、是否为渲染 Watcher */
  constructor(vm: Component, expOrFn: string | Function, cb: Function, options?: ?Object, isRenderWatcher?: boolean) {
    this.vm = vm;

    /* => 如果是渲染 Watcher ，在实例上添加 _watcher 私有属性 */
    if (isRenderWatcher) vm._watcher = this;

    /* => 给每个实例创建一个 watchers 收集池，当前实例下，每创建一个 watcher ，就将自己存入（ $watch 方法） */
    vm._watchers.push(this);

    // => 选项，使用 $watch 时传入
    if (options) {
      this.deep = !!options.deep; // => 深度监听
      this.user = !!options.user;
      this.lazy = !!options.lazy; // => 计算属性
      this.sync = !!options.sync;
      this.before = options.before;
    } else {
      this.deep = this.user = this.lazy = this.sync = false;
    }
    this.cb = cb;
    this.id = ++uid; // => 用于批处理的 uid
    this.active = true;
    this.dirty = this.lazy; // => 对于懒惰的观察者
    this.deps = [];
    this.newDeps = [];
    this.depIds = new Set();
    this.newDepIds = new Set();
    this.expression = process.env.NODE_ENV !== 'production' ? expOrFn.toString() : '';

    // => getter 的解析表达式
    /* => 判断渲染 Watcher 传入的 updateComponent 是否是一个函数 */
    if (typeof expOrFn === 'function') {
      /* => 将 updateComponent 回调函数赋值给 getter 属性 => 用于 this.get() 处获取数据 */
      this.getter = expOrFn;
    } else {
      /* => 如果不是函数，则包装成函数形式 */
      this.getter = parsePath(expOrFn);

      if (!this.getter) {
        this.getter = noop;

        /* => 监视路径失败：expOrFn 监视程序只接受简单的点分隔路径。对于完全控制，请改用函数。 */
        process.env.NODE_ENV !== 'production' &&
          warn(
            `Failed watching path: "${expOrFn}" Watcher only accepts simple dot-delimited paths. For full control, use a function instead.`,
            vm,
          );
      }
    }

    /* => 对于计算属性，默认先不执行 */
    this.value = this.lazy ? undefined : this.get();
  }

  /* => 计算 getter ，然后重新收集依赖项 */
  get() {
    /* => 将当前 Watcher 挂载到全局（计算属性由此可以进行依赖收集） Dep.target = this */
    pushTarget(this);

    let value;
    const vm = this.vm;
    try {
      /* => 取值 */
      value = this.getter.call(vm, vm);
    } catch (e) {
      if (this.user) {
        /* => 获取观察者 this.expression */
        handleError(e, vm, `getter for watcher "${this.expression}"`);
      } else {
        throw e;
      }
    } finally {
      // => 触摸每一个属性，这样它们都被跟踪为深度监视的依赖项
      /* => 递归循环该 value 里面的每一项，{ msg: { err: "s" } }，默认只观测 msg ，加上 deep 选项可观测到 err */
      if (this.deep) traverse(value);

      popTarget();
      this.cleanupDeps();
    }

    /* => 返回取值结果 */
    return value;
  }

  /* => 添加一个依赖项 */
  addDep(dep: Dep) {
    const id = dep.id;

    /* => 防止重复订阅 */
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id);

      /* => 将已订阅的 dep 添加到订阅列表（因为当前 Watcher 可能订阅多个 dep） */
      this.newDeps.push(dep);

      /* => 如果订阅 id 列表中没有当前 id，则向 dep 添加自己 */
      if (!this.depIds.has(id)) dep.addSub(this);
    }
  }

  /* => 清理依赖项集合 */
  cleanupDeps() {
    let i = this.deps.length;
    while (i--) {
      const dep = this.deps[i];
      if (!this.newDepIds.has(dep.id)) dep.removeSub(this);
    }
    let tmp = this.depIds;
    this.depIds = this.newDepIds;
    this.newDepIds = tmp;
    this.newDepIds.clear();
    tmp = this.deps;
    this.deps = this.newDeps;
    this.newDeps = tmp;
    this.newDeps.length = 0;
  }

  /* => 当依赖项更改时将调用订阅接口 */
  update() {
    /* => 对于计算属性，不会立即更新，而是标识为 true 当用户取值时，再执行取值操作。且优先于 DOM 渲染，由此渲染时才可以拿到最新的计算属性值 */
    if (this.lazy) {
      this.dirty = true;
    } else if (this.sync) {
      this.run();
    } else {
      /* => 将调用 update 的订阅者添加到 Watcher 异步队列 */
      queueWatcher(this);
    }
  }

  /* => 调度程序作业接口，将由调度程序调用 */
  run() {
    if (this.active) {
      const value = this.get();

      /* => 即使值相同，对象/数组上的深度观察程序和观察程序也应该启动，因为该值可能已发生变化。 */
      if (value !== this.value || isObject(value) || this.deep) {
        // => 设置新值
        const oldValue = this.value;

        this.value = value;
        if (this.user) {
          try {
            this.cb.call(this.vm, value, oldValue);
          } catch (e) {
            /* => 监视程序 this.expression 的回调 */
            handleError(e, this.vm, `callback for watcher "${this.expression}"`);
          }
        } else {
          this.cb.call(this.vm, value, oldValue);
        }
      }
    }
  }

  /* => 评估观察者的价值，这只适用于懒惰的观察者 */
  evaluate() {
    this.value = this.get();
    this.dirty = false;
  }

  /* => 取决于此监视程序收集的所有 Dep */
  depend() {
    let i = this.deps.length;
    while (i--) this.deps[i].depend();
  }

  /* => 从所有依赖项的订阅列表中删除自己 */
  teardown() {
    if (this.active) {
      /* => 从 vm 的观察者列表中删除自己这是一个有点昂贵的操作，因此如果 vm 被销毁，我们将跳过它。 */
      /* => 从观察者列表中移除自己 */
      if (!this.vm._isBeingDestroyed) remove(this.vm._watchers, this);

      let i = this.deps.length;
      /* => 从每个依赖列表中移除自己 */

      while (i--) this.deps[i].removeSub(this);

      this.active = false;
    }
  }
}
