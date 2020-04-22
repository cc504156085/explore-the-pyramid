/* @flow */

import { warn, remove, isObject, parsePath, _Set as Set, handleError, noop } from '../util/index';

import { traverse } from './traverse';
import { queueWatcher } from './scheduler';
import Dep, { pushTarget, popTarget } from './dep';

import type { SimpleSet } from '../util/index';

let uid = 0;

/**
 * A watcher parses an expression, collects dependencies, => 一个 Watcher 解析表达式，收集依赖项
 * and fires callback when the expression value changes.  => 并在表达式值更改时触发回调。
 * This is used for both the $watch() api and directives. => 这用于 $watch() api 和指令。
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
    if (isRenderWatcher) {
      vm._watcher = this;
    }

    /* => 给每个实例创建一个 watchers 收集池，当前实例下，每创建一个 watcher ，就将自己存入（ $watch 方法） */
    vm._watchers.push(this);

    // options => 选项，使用 $watch 时传入
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
    this.id = ++uid; // uid for batching => 用于批处理的 uid
    this.active = true;
    this.dirty = this.lazy; // for lazy watchers => 对于懒惰的观察者
    this.deps = [];
    this.newDeps = [];
    this.depIds = new Set();
    this.newDepIds = new Set();
    this.expression = process.env.NODE_ENV !== 'production' ? expOrFn.toString() : '';

    // parse expression for getter => getter 的解析表达式
    /* => 判断渲染 Watcher 传入的 updateComponent 是否是一个函数 */
    if (typeof expOrFn === 'function') {
      /* 将 updateComponent 回调函数赋值给 getter 属性 => 用于 this.get() 处获取数据 */
      this.getter = expOrFn;
    } else {
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
    this.value = this.lazy ? undefined : this.get();
  }

  /** => 计算 getter ，然后重新收集依赖项。
   * Evaluate the getter, and re-collect dependencies.
   */
  get() {
    pushTarget(this);
    let value;
    const vm = this.vm;
    try {
      value = this.getter.call(vm, vm);
    } catch (e) {
      if (this.user) {
        /* => 获取观察者 this.expression */
        handleError(e, vm, `getter for watcher "${this.expression}"`);
      } else {
        throw e;
      }
    } finally {
      // "touch" every property so they are all tracked as => 触摸 每一个属性，这样它们都被跟踪为
      // dependencies for deep watching => 深度监视的依赖项
      if (this.deep) {
        /* => 递归循环该 value 里面的每一项 */
        traverse(value);
      }
      popTarget();
      this.cleanupDeps();
    }
    return value;
  }

  /** => 添加一个依赖项
   * Add a dependency to this directive.
   */
  addDep(dep: Dep) {
    const id = dep.id;

    /* => 防止重复订阅 */
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id);

      /* => 将已订阅的 dep 添加到订阅列表（因为当前 Watcher 可能订阅多个 dep） */
      this.newDeps.push(dep);

      /* => 如果订阅 id 列表中没有当前 id，则向 dep 添加自己 */
      if (!this.depIds.has(id)) {
        dep.addSub(this);
      }
    }
  }

  /** => 清理依赖项集合。
   * Clean up for dependency collection.
   */
  cleanupDeps() {
    let i = this.deps.length;
    while (i--) {
      const dep = this.deps[i];
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this);
      }
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

  /** => 当依赖项更改时将调用订阅接口
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  update() {
    /* istanbul ignore else */
    if (this.lazy) {
      this.dirty = true;
    } else if (this.sync) {
      this.run();
    } else {
      /* => 将调用 update 的订阅者添加到 Watcher 异步队列 */
      queueWatcher(this);
    }
  }

  /**
   * Scheduler job interface. => 调度程序作业接口。
   * Will be called by the scheduler. => 将由调度程序调用。
   */
  run() {
    if (this.active) {
      const value = this.get();

      /* => 即使值相同，对象/数组上的深度观察程序和观察程序也应该启动，因为该值可能已发生变化。 */
      // Deep watchers and watchers on Object/Arrays should fire even
      // when the value is the same, because the value may
      // have mutated.
      if (value !== this.value || isObject(value) || this.deep) {
        // set new value => 设置新值
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

  /**
   * Evaluate the value of the watcher. => 评估观察者的价值
   * This only gets called for lazy watchers. => 这只适用于懒惰的观察者。
   */
  evaluate() {
    this.value = this.get();
    this.dirty = false;
  }

  /**
   * Depend on all deps collected by this watcher. => 取决于此监视程序收集的所有DEP。
   */
  depend() {
    let i = this.deps.length;
    while (i--) {
      this.deps[i].depend();
    }
  }

  /**
   * Remove self from all dependencies' subscriber list. => 从所有依赖项的订阅列表中删除自己。
   */
  teardown() {
    if (this.active) {
      /* => 从 vm 的观察者列表中删除自己这是一个有点昂贵的操作，因此如果 vm 被销毁，我们将跳过它。 */
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.

      /* => 从观察者列表中移除自己 */
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this);
      }

      let i = this.deps.length;
      while (i--) {
        /* => 从每个依赖列表中移除自己 */
        this.deps[i].removeSub(this);
      }

      this.active = false;
    }
  }
}
