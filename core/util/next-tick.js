/* @flow */
/* globals MutationObserver */

import { noop } from 'shared/util';
import { handleError } from './error';
import { isIE, isIOS, isNative } from './env';

/* => 是否使用微任务 */
export let isUsingMicroTask = false;

/* => 存储注册回调 */
const callbacks = [];

/* => 标识任务队列中是否已经有了任务 */
let pending = false;

function flushCallbacks() {
  /* => 标识任务队列已执行，可以继续添加任务 */
  pending = false;

  /* => 拷贝数组 */
  const copies = callbacks.slice(0);

  /* => 清空集合 */
  callbacks.length = 0;

  /* => 挨个执行 */
  for (let i = 0; i < copies.length; i++) {
    copies[i]();
  }
}

// Here we have async deferring wrappers using microtasks.                    => 这里我们有使用微任务的异步延迟包装器
// In 2.5 we used (macro) tasks (in combination with microtasks).             => 在2.5中，我们使用（宏）任务（结合微任务）
// However, it has subtle problems when state is changed right before repaint => 然而，当状态在重新绘制之前更改时，它有一些微妙的问题
// (e.g. #6813, out-in transitions).
// Also, using (macro) tasks in event handler would cause some weird behaviors
// that cannot be circumvented (e.g. #7109, #7153, #7546, #7834, #8109).      => 另外，在事件处理程序中使用（宏）任务会导致一些无法避免的奇怪行为
// So we now use microtasks everywhere, again.                                => 所以我们现在在任何地方都使用微任务
// A major drawback of this tradeoff is that there are some scenarios         => 这种折衷的一个主要缺点是，在某些场景中，微任务的优先级太高，并在假定的顺序事件之间触发
// where microtasks have too high a priority and fire in between supposedly
// sequential events (e.g. #4521, #6690, which have workarounds)
// or even between bubbling of the same event (#6566).                        => 甚至在同一事件的冒泡之间
let timerFunc;

// The nextTick behavior leverages the microtask queue, which can be accessed
// via either native Promise.then or MutationObserver.                        => nextTick 行为利用微任务队列机制，可以通过任何一个原生 Promise 或 MutationObserver 访问它。
// MutationObserver has wider support, however it is seriously bugged in      => MutationObserver 有更广泛的支持，但是在iOS >= 9.3.3的 UIWebView 中，
// UIWebView in iOS >= 9.3.3 when triggered in touch event handlers. It       => 当在触摸事件处理程序中触发时，MutationObserver 会出现严重的 bug
// completely stops working after triggering a few times... so, if native     => 触发几次之后，它就完全停止工作了。
// Promise is available, we will use it:                                      => 所以，如果原生 Promise 是可用的，我们将使用它

/* => 降级处理 */
if (typeof Promise !== 'undefined' && isNative(Promise)) {
  const p = Promise.resolve();
  timerFunc = () => {
    p.then(flushCallbacks);

    /* => 在有问题的 UIWebview 中，Promise.then 不会完全中断，但它会陷入一种奇怪的状态
     * 回调被推入微任务队列，但队列没有被刷新，直到浏览器需要做一些其他的工作，例如处理一个计时器。
     * 因此，我们可以通过添加一个空计时器来“强制”刷新微任务队列。
     */
    // In problematic UIWebViews, Promise.then doesn't completely break, but
    // it can get stuck in a weird state where callbacks are pushed into the
    // microtask queue but the queue isn't being flushed, until the browser
    // needs to do some other work, e.g. handle a timer. Therefore we can
    // "force" the microtask queue to be flushed by adding an empty timer.
    if (isIOS) setTimeout(noop);
  };

  /* => 标识为微任务 */
  isUsingMicroTask = true;
} else if (
  !isIE &&
  typeof MutationObserver !== 'undefined' &&
  (isNative(MutationObserver) ||
    // PhantomJS and iOS 7.x
    MutationObserver.toString() === '[object MutationObserverConstructor]')
) {
  // Use MutationObserver where native Promise is not available,  => 在原生 Promise 不可用的地方使用 MutationObserver
  // e.g. PhantomJS, iOS7, Android 4.4
  // (#6466 MutationObserver is unreliable in IE11)               => MutationObserver 在 IE11 中是不可靠的
  let counter = 1;
  const observer = new MutationObserver(flushCallbacks);
  const textNode = document.createTextNode(String(counter));
  observer.observe(textNode, { characterData: true });
  timerFunc = () => {
    counter = (counter + 1) % 2;
    textNode.data = String(counter);
  };

  /* => 标识为微任务 */
  isUsingMicroTask = true;
} else if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) {
  // Fallback to setImmediate. => 降级为 setImmediate
  // Technically it leverages the (macro) task queue, => 从技术上讲，它利用了(宏)任务队列，
  // but it is still a better choice than setTimeout. => 但它仍然是比 setTimeout 更好的选择。
  timerFunc = () => {
    setImmediate(flushCallbacks);
  };
} else {
  // Fallback to setTimeout. => 最后降级为 setTimeout
  timerFunc = () => {
    setTimeout(flushCallbacks, 0);
  };
}

export function nextTick(cb?: Function, ctx?: Object) {
  let _resolve;

  /* => 每调用一次该方法，就向回调集合中存储回调 */
  callbacks.push(() => {
    /* => 如果回调存在，则尝试调用 */
    if (cb) {
      try {
        cb.call(ctx);
      } catch (e) {
        handleError(e, ctx, 'nextTick');
      }
    } else if (_resolve) {
      /* => 如果 cb 不存在且 Promise 存在，可调用 Promise */
      _resolve(ctx);
    }
  });

  /* => 标识已经有已经开始了（控制多个 nextTick） */
  /* => 例如更改了数据，则有一个 Watcher 添加至异步队列等待渲染
   * 随后调用了 this.$nextTick() 方法，他会添加到 callbacks 中先缓存。每次事件循环只会执行一次任务，就可以按顺序执行所有回调
   */
  if (!pending) {
    pending = true;
    timerFunc();
  }

  // 如果没有传入参数，则返回一个 Promise
  if (!cb && typeof Promise !== 'undefined') {
    return new Promise((resolve) => {
      _resolve = resolve;
    });
  }
}
