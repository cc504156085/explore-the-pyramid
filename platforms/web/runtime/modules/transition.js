import { inBrowser, isIE9, warn } from 'core/util/index';
import { mergeVNodeHook } from 'core/vdom/helpers/index';
import { activeInstance } from 'core/instance/lifecycle';

import { once, isDef, isUndef, isObject, toNumber } from 'shared/util';

import {
  nextFrame,
  resolveTransition,
  whenTransitionEnds,
  addTransitionClass,
  removeTransitionClass,
} from '../transition-util';

export function enter(vnode: VNodeWithData, toggleDisplay: ?() => void) {
  const el: any = vnode.elm;

  // 立即调用离开回调
  if (isDef(el._leaveCb)) {
    el._leaveCb.cancelled = true;
    el._leaveCb();
  }

  const data = resolveTransition(vnode.data.transition);
  if (isUndef(data)) return;

  if (isDef(el._enterCb) || el.nodeType !== 1) return;

  const {
    css,
    type,
    enterClass,
    enterToClass,
    enterActiveClass,
    appearClass,
    appearToClass,
    appearActiveClass,
    beforeEnter,
    enter,
    afterEnter,
    enterCancelled,
    beforeAppear,
    appear,
    afterAppear,
    appearCancelled,
    duration,
  } = data;

  // => activeInstance 将始终是管理此过渡的 <transition> 组件。
  // => 一个要检查的边缘情况是，何时将 <transition> 放置为子组件的根节点。
  // => 在这种情况下，我们需要检查 <transition> 的父项是否出现外观检查。
  let context = activeInstance;
  let transitionNode = activeInstance.$vnode;
  while (transitionNode && transitionNode.parent) {
    context = transitionNode.context;
    transitionNode = transitionNode.parent;
  }

  const isAppear = !context._isMounted || !vnode.isRootInsert;

  if (isAppear && !appear && appear !== '') return;

  const startClass = isAppear && appearClass ? appearClass : enterClass;
  const activeClass = isAppear && appearActiveClass ? appearActiveClass : enterActiveClass;
  const toClass = isAppear && appearToClass ? appearToClass : enterToClass;

  const beforeEnterHook = isAppear ? beforeAppear || beforeEnter : beforeEnter;
  const enterHook = isAppear ? (typeof appear === 'function' ? appear : enter) : enter;
  const afterEnterHook = isAppear ? afterAppear || afterEnter : afterEnter;
  const enterCancelledHook = isAppear ? appearCancelled || enterCancelled : enterCancelled;

  const explicitEnterDuration: any = toNumber(isObject(duration) ? duration.enter : duration);

  if (process.env.NODE_ENV !== 'production' && explicitEnterDuration != null) {
    checkDuration(explicitEnterDuration, 'enter', vnode);
  }

  const expectsCSS = css !== false && !isIE9;
  const userWantsControl = getHookArgumentsLength(enterHook);

  const cb = (el._enterCb = once(() => {
    if (expectsCSS) {
      removeTransitionClass(el, toClass);
      removeTransitionClass(el, activeClass);
    }
    if (cb.cancelled) {
      if (expectsCSS) removeTransitionClass(el, startClass);

      enterCancelledHook && enterCancelledHook(el);
    } else {
      afterEnterHook && afterEnterHook(el);
    }
    el._enterCb = null;
  }));

  if (!vnode.data.show) {
    // => 通过注入插入钩来删除回车中待处理的请假元素
    mergeVNodeHook(vnode, 'insert', () => {
      const parent = el.parentNode;
      const pendingNode = parent && parent._pending && parent._pending[vnode.key];
      if (pendingNode && pendingNode.tag === vnode.tag && pendingNode.elm._leaveCb) {
        pendingNode.elm._leaveCb();
      }
      enterHook && enterHook(el, cb);
    });
  }

  // => 开始进入过渡
  beforeEnterHook && beforeEnterHook(el);
  if (expectsCSS) {
    addTransitionClass(el, startClass);
    addTransitionClass(el, activeClass);
    nextFrame(() => {
      removeTransitionClass(el, startClass);
      if (!cb.cancelled) {
        addTransitionClass(el, toClass);
        if (!userWantsControl) {
          if (isValidDuration(explicitEnterDuration)) {
            setTimeout(cb, explicitEnterDuration);
          } else {
            whenTransitionEnds(el, type, cb);
          }
        }
      }
    });
  }

  if (vnode.data.show) {
    toggleDisplay && toggleDisplay();
    enterHook && enterHook(el, cb);
  }

  if (!expectsCSS && !userWantsControl) cb();
}

export function leave(vnode: VNodeWithData, rm: Function) {
  const el: any = vnode.elm;

  // 立即调用进入回调
  if (isDef(el._enterCb)) {
    el._enterCb.cancelled = true;
    el._enterCb();
  }

  const data = resolveTransition(vnode.data.transition);
  if (isUndef(data) || el.nodeType !== 1) return rm();

  if (isDef(el._leaveCb)) return;

  const {
    css,
    type,
    leaveClass,
    leaveToClass,
    leaveActiveClass,
    beforeLeave,
    leave,
    afterLeave,
    leaveCancelled,
    delayLeave,
    duration,
  } = data;

  const expectsCSS = css !== false && !isIE9;
  const userWantsControl = getHookArgumentsLength(leave);

  const explicitLeaveDuration: any = toNumber(isObject(duration) ? duration.leave : duration);

  if (process.env.NODE_ENV !== 'production' && isDef(explicitLeaveDuration)) {
    checkDuration(explicitLeaveDuration, 'leave', vnode);
  }

  const cb = (el._leaveCb = once(() => {
    if (el.parentNode && el.parentNode._pending) el.parentNode._pending[vnode.key] = null;

    if (expectsCSS) {
      removeTransitionClass(el, leaveToClass);
      removeTransitionClass(el, leaveActiveClass);
    }
    if (cb.cancelled) {
      if (expectsCSS) removeTransitionClass(el, leaveClass);
      leaveCancelled && leaveCancelled(el);
    } else {
      rm();
      afterLeave && afterLeave(el);
    }
    el._leaveCb = null;
  }));

  if (delayLeave) {
    delayLeave(performLeave);
  } else {
    performLeave();
  }

  function performLeave() {
    // => 延迟的离开可能已经被取消
    if (cb.cancelled) return;

    // => 记录离开元素
    if (!vnode.data.show && el.parentNode) {
      (el.parentNode._pending || (el.parentNode._pending = {}))[(vnode.key: any)] = vnode;
    }
    beforeLeave && beforeLeave(el);
    if (expectsCSS) {
      addTransitionClass(el, leaveClass);
      addTransitionClass(el, leaveActiveClass);
      nextFrame(() => {
        removeTransitionClass(el, leaveClass);
        if (!cb.cancelled) {
          addTransitionClass(el, leaveToClass);
          if (!userWantsControl) {
            if (isValidDuration(explicitLeaveDuration)) {
              setTimeout(cb, explicitLeaveDuration);
            } else {
              whenTransitionEnds(el, type, cb);
            }
          }
        }
      });
    }
    leave && leave(el, cb);
    if (!expectsCSS && !userWantsControl) cb();
  }
}

// => 仅在开发模式下使用
function checkDuration(val, name, vnode) {
  if (typeof val !== 'number') {
    warn(`<transition> explicit ${ name } duration is not a valid number - ` + `got ${ JSON.stringify(val) }.`, vnode.context);
  } else if (isNaN(val)) {
    warn(`<transition> explicit ${ name } duration is NaN - ` + 'the duration expression might be incorrect.', vnode.context);
  }
}

function isValidDuration(val) {
  return typeof val === 'number' && !isNaN(val);
}

/**
 * Normalize a transition hook's argument length. The hook may be:
 * - a merged hook (invoker) with the original in .fns
 * - a wrapped component method (check ._length)
 * - a plain function (.length)
 */
function getHookArgumentsLength(fn: Function): boolean {
  if (isUndef(fn)) return false;

  const invokerFns = fn.fns;
  if (isDef(invokerFns)) {
    // 调用者
    return getHookArgumentsLength(Array.isArray(invokerFns) ? invokerFns[0] : invokerFns);
  } else {
    return (fn._length || fn.length) > 1;
  }
}

function _enter(_: any, vnode: VNodeWithData) {
  if (vnode.data.show !== true) enter(vnode);
}

export default inBrowser
  ? {
    create: _enter,
    activate: _enter,
    remove(vnode: VNode, rm: Function) {
      if (vnode.data.show !== true) {
        leave(vnode, rm);
      } else {
        rm();
      }
    },
  }
  : {};
