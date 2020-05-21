import type Watcher from './watcher';
import config from '../config';
import { callHook, activateChildComponent } from '../instance/lifecycle';

import { warn, nextTick, devtools, inBrowser, isIE } from '../util/index';

export const MAX_UPDATE_COUNT = 100;

const queue: Array<Watcher> = [];
const activatedChildren: Array<Component> = [];
let has: { [key: number]: ?true } = {};
let circular: { [key: number]: number } = {};
let waiting = false;
let flushing = false;
let index = 0;

/* => 重置调度程序的状态 */
function resetSchedulerState() {
  index = queue.length = activatedChildren.length = 0;
  has = {};
  if (process.env.NODE_ENV !== 'production') circular = {};

  waiting = flushing = false;
}

/** => 异步边缘情况要求在附加事件监听器时保存时间戳。
 *  但是，调用 performance.now() 会产生性能开销，特别是当页面有数千个事件侦听器时。
 *  相反，我们在每次调度程序刷新时获取一个时间戳，并将其用于在刷新期间附加的所有事件侦听器。
 */
export let currentFlushTimestamp = 0;

// => 异步边缘情况修复需要存储事件监听器的附加时间戳。
let getNow: () => number = Date.now;

/** => 确定浏览器正在使用什么事件时间戳。
 *  令人恼火的是，时间戳可以是高分辨率的(相对于页面加载)，也可以是低分辨率的(相对于 UNIX epoch)
 *  所以为了比较时间，我们必须在保存刷新时间戳时使用相同的时间戳类型。所有的 IE 版本都使用低分辨率事件时间戳
 *  并且有问题的时钟实现
 */
if (inBrowser && !isIE) {
  const performance = window.performance;
  if (performance && typeof performance.now === 'function' && getNow() > document.createEvent('Event').timeStamp) {
    /* => 如果事件时间戳(虽然是在 Date.now() 之后计算的)比它小，这意味着事件使用的是高分辨率时间戳，我们还需要使用事件监听器时间戳的高分辨率版本。 */
    getNow = () => performance.now();
  }
}

/* => => 刷新队列并运行观察程序 */
function flushSchedulerQueue() {
  currentFlushTimestamp = getNow();
  flushing = true;
  let watcher, id;

  // => 在刷新之前对队列排序
  // => 这将确保
  // 1. => 组件从父组件更新到子组件。(因为父节点总是在子节点之前创建的)
  // 2. => 组件的用户观察者在其渲染观察者之前运行(因为用户观察者是在渲染观察者之前创建的)
  // 3. => 如果一个组件在父组件的监视程序运行期间被销毁，则可以跳过它的监视程序。
  queue.sort((a, b) => a.id - b.id);

  // => 不要缓存长度，因为在运行现有的监视程序时可能会推送更多的监视程序
  for (index = 0; index < queue.length; index++) {
    watcher = queue[index];
    if (watcher.before) watcher.before();

    id = watcher.id;
    has[id] = null;
    watcher.run();

    // => 在开发构建中，检查并停止循环更新。
    if (process.env.NODE_ENV !== 'production' && has[id] != null) {
      circular[id] = (circular[id] || 0) + 1;
      if (circular[id] > MAX_UPDATE_COUNT) {
        warn(
          'You may have an infinite update loop ' +
            (watcher.user ? `in watcher with expression "${watcher.expression}"` : `in a component render function.`),
          watcher.vm,
        );
        break;
      }
    }
  }

  // => 在重置状态之前保留 post 队列的副本
  const activatedQueue = activatedChildren.slice();
  const updatedQueue = queue.slice();

  resetSchedulerState();

  // => 调用更新和激活的钩子组件
  callActivatedHooks(activatedQueue);
  callUpdatedHooks(updatedQueue);

  // devtool hook
  if (devtools && config.devtools) devtools.emit('flush');
}

function callUpdatedHooks(queue) {
  let i = queue.length;
  while (i--) {
    const watcher = queue[i];
    const vm = watcher.vm;
    if (vm._watcher === watcher && vm._isMounted && !vm._isDestroyed) callHook(vm, 'updated');
  }
}

/* => 对在补丁期间激活的 keep-alive 组件进行排队。队列将在整个树被修补后被处理 */
export function queueActivatedComponent(vm: Component) {
  /* => 将 _inactive 设置为 false ，这样渲染函数就可以检查它是否在一个非活动的树中(例如 router-view ) */
  vm._inactive = false;

  activatedChildren.push(vm);
}

function callActivatedHooks(queue) {
  for (let i = 0; i < queue.length; i++) {
    queue[i]._inactive = true;
    activateChildComponent(queue[i], true /* true */);
  }
}

/* => 将观察程序推入观察程序队列。具有重复ID的作业将被跳过，除非在刷新队列时将其推入 */
export function queueWatcher(watcher: Watcher) {
  const id = watcher.id;

  /* => 判断 has 对象中是否存在该 watcher */
  if (has[id] == null) {
    /* => 不存在，标识为 true */
    has[id] = true;

    /* => 判断是否已经刷新 */
    if (!flushing) {
      /* => 将当前 watcher 压入队列 */
      queue.push(watcher);
    } else {
      // => 如果已经刷新，则根据观察程序的 id 将其拼接，如果已经超过了它的 id ，它将立即运行
      let i = queue.length - 1;
      while (i > index && queue[i].id > watcher.id) i--;

      queue.splice(i + 1, 0, watcher);
    }

    // => 清空队列
    if (!waiting) {
      waiting = true;

      if (process.env.NODE_ENV !== 'production' && !config.async) {
        flushSchedulerQueue();
        return;
      }

      /* 再下一次事件循环时再更新 */
      nextTick(flushSchedulerQueue);
    }
  }
}
