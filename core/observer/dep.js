/* @flow */

import type Watcher from './watcher';
import { remove } from '../util/index';
import config from '../config';

let uid = 0;

/** => 一个 dep 是可以有多个订阅者（Watcher）。
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 */
export default class Dep {
  static target: ?Watcher;
  id: number;
  subs: Array<Watcher>;

  constructor() {
    this.id = uid++;

    /* => Object 依赖收集处 */
    this.subs = [];
  }

  /* => 添加订阅者 */
  addSub(sub: Watcher) {
    this.subs.push(sub);
  }

  /* => 删除订阅者 */
  removeSub(sub: Watcher) {
    /* => 使用了 splice 移除 */
    remove(this.subs, sub);
  }

  /* => 收集依赖 */
  depend() {
    /* => 如果 Watcher 存在，则将自己添加至 Watcher中 */
    if (Dep.target) {
      Dep.target.addDep(this);
    }
  }

  /* => 发布订阅模式 */
  /* => 通知订阅的依赖更新 */
  notify() {
    // stabilize the subscriber list first => 拷贝订阅列表
    const subs = this.subs.slice();

    if (process.env.NODE_ENV !== 'production' && !config.async) {
      /* => 如果不运行async，子命令就不会在调度程序中排序。我们现在需要对它们进行排序，以确保它们按正确的顺序触发 */
      // subs aren't sorted in scheduler if not running async
      // we need to sort them now to make sure they fire in correct
      // order
      subs.sort((a, b) => a.id - b.id);
    }

    for (let i = 0, l = subs.length; i < l; i++) {
      /* => 触发更新 */
      subs[i].update();
    }
  }
}

// The current target watcher being evaluated. => 正在评估的当前目标观察程序。
// This is globally unique because only one watcher => 这是全局唯一的，因为一次只能计算一个观察者。
// can be evaluated at a time.
Dep.target = null;
const targetStack = [];

export function pushTarget(target: ?Watcher) {
  targetStack.push(target);
  Dep.target = target;
}

export function popTarget() {
  targetStack.pop();
  Dep.target = targetStack[targetStack.length - 1];
}
