/* @flow */

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

/** => 重置调度程序的状态。
 * Reset the scheduler's state.
 */
function resetSchedulerState() {
  index = queue.length = activatedChildren.length = 0;
  has = {};
  if (process.env.NODE_ENV !== 'production') {
    circular = {};
  }
  waiting = flushing = false;
}

/** => 异步边缘情况要求在附加事件监听器时保存时间戳。
 *  但是，调用 performance.now() 会产生性能开销，特别是当页面有数千个事件侦听器时。
 *  相反，我们在每次调度程序刷新时获取一个时间戳，并将其用于在刷新期间附加的所有事件侦听器。
 */
// Async edge case #6566 requires saving the timestamp when event listeners are
// attached. However, calling performance.now() has a perf overhead especially
// if the page has thousands of event listeners. Instead, we take a timestamp
// every time the scheduler flushes and use that for all event listeners
// attached during that flush.
export let currentFlushTimestamp = 0;

// Async edge case fix requires storing an event listener's attach timestamp. => 异步边缘情况修复需要存储事件监听器的附加时间戳。
let getNow: () => number = Date.now;

/** => 确定浏览器正在使用什么事件时间戳。
 *  令人恼火的是，时间戳可以是高分辨率的(相对于页面加载)，也可以是低分辨率的(相对于 UNIX epoch)
 *  所以为了比较时间，我们必须在保存刷新时间戳时使用相同的时间戳类型。所有的 IE 版本都使用低分辨率事件时间戳
 *  并且有问题的时钟实现
 */
// Determine what event timestamp the browser is using. Annoyingly, the
// timestamp can either be hi-res (relative to page load) or low-res
// (relative to UNIX epoch), so in order to compare time we have to use the
// same timestamp type when saving the flush timestamp.
// All IE versions use low-res event timestamps, and have problematic clock
// implementations (#9632)
if (inBrowser && !isIE) {
  const performance = window.performance;
  if (performance && typeof performance.now === 'function' && getNow() > document.createEvent('Event').timeStamp) {
    /* => 如果事件时间戳(虽然是在 Date.now() 之后计算的)比它小，这意味着事件使用的是高分辨率时间戳，我们还需要使用事件监听器时间戳的高分辨率版本。 */
    // if the event timestamp, although evaluated AFTER the Date.now(), is
    // smaller than it, it means the event is using a hi-res timestamp,
    // and we need to use the hi-res version for event listener timestamps as
    // well.
    getNow = () => performance.now();
  }
}

/** => 刷新队列并运行观察程序。
 * Flush both queues and run the watchers.
 */
function flushSchedulerQueue() {
  currentFlushTimestamp = getNow();
  flushing = true;
  let watcher, id;

  // Sort queue before flush. => 在刷新之前对队列排序
  // This ensures that:       => 这将确保
  // 1. Components are updated from parent to child. (because parent is always => 组件从父组件更新到子组件。(因为父节点总是在子节点之前创建的)
  //    created before the child)
  // 2. A component's user watchers are run before its render watcher (because => 组件的用户观察者在其渲染观察者之前运行(因为用户观察者是在渲染观察者之前创建的)
  //    user watchers are created before the render watcher)
  // 3. If a component is destroyed during a parent component's watcher run,   => 如果一个组件在父组件的监视程序运行期间被销毁，则可以跳过它的监视程序。
  //    its watchers can be skipped.
  queue.sort((a, b) => a.id - b.id);

  // do not cache length because more watchers might be pushed => 不要缓存长度，因为在运行现有的监视程序时可能会推送更多的监视程序
  // as we run existing watchers
  for (index = 0; index < queue.length; index++) {
    watcher = queue[index];
    if (watcher.before) {
      watcher.before();
    }
    id = watcher.id;
    has[id] = null;
    watcher.run();

    // in dev build, check and stop circular updates. => 在开发构建中，检查并停止循环更新。
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

  // keep copies of post queues before resetting state => 在重置状态之前保留 post 队列的副本
  const activatedQueue = activatedChildren.slice();
  const updatedQueue = queue.slice();

  resetSchedulerState();

  // call component updated and activated hooks => 调用更新和激活的钩子组件
  callActivatedHooks(activatedQueue);
  callUpdatedHooks(updatedQueue);

  // devtool hook
  /* istanbul ignore if */
  if (devtools && config.devtools) {
    devtools.emit('flush');
  }
}

function callUpdatedHooks(queue) {
  let i = queue.length;
  while (i--) {
    const watcher = queue[i];
    const vm = watcher.vm;
    if (vm._watcher === watcher && vm._isMounted && !vm._isDestroyed) {
      callHook(vm, 'updated');
    }
  }
}

/**
 * Queue a keep-alive component that was activated during patch.       => 对在补丁期间激活的 keep-alive 组件进行排队。
 * The queue will be processed after the entire tree has been patched. => 队列将在整个树被修补后被处理。
 */
export function queueActivatedComponent(vm: Component) {
  /* => 将 _inactive 设置为 false ，这样渲染函数就可以检查它是否在一个非活动的树中(例如 router-view ) */
  // setting _inactive to false here so that a render function can
  // rely on checking whether it's in an inactive tree (e.g. router-view)
  vm._inactive = false;

  activatedChildren.push(vm);
}

function callActivatedHooks(queue) {
  for (let i = 0; i < queue.length; i++) {
    queue[i]._inactive = true;
    activateChildComponent(queue[i], true /* true */);
  }
}

/** => 将观察程序推入观察程序队列。具有重复ID的作业将被跳过，除非在刷新队列时将其推入。
 * Push a watcher into the watcher queue.
 * Jobs with duplicate IDs will be skipped unless it's
 * pushed when the queue is being flushed.
 */
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
      // if already flushing, splice the watcher based on its id  => 如果已经刷新，则根据观察程序的 id 将其拼接
      // if already past its id, it will be run next immediately. => 如果已经超过了它的 id ，它将立即运行
      let i = queue.length - 1;
      while (i > index && queue[i].id > watcher.id) {
        i--;
      }
      queue.splice(i + 1, 0, watcher);
    }

    // queue the flush => 清空队列
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
