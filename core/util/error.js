import config from '../config';
import { warn } from './debug';
import { inBrowser, inWeex } from './env';
import { isPromise } from 'shared/util';
import { pushTarget, popTarget } from '../observer/dep';

export function handleError(err: Error, vm: any, info: string) {
  // => 在处理错误处理程序时停用 deps 跟踪，以避免可能的无限渲染
  pushTarget();
  try {
    if (vm) {
      let cur = vm;
      while ((cur = cur.$parent)) {
        const hooks = cur.$options.errorCaptured;
        if (hooks) {
          for (let i = 0; i < hooks.length; i++) {
            try {
              const capture = hooks[i].call(cur, err, vm, info) === false;
              if (capture) return;
            } catch (e) {
              globalHandleError(e, cur, 'errorCaptured hook');
            }
          }
        }
      }
    }
    globalHandleError(err, vm, info);
  } finally {
    popTarget();
  }
}

export function invokeWithErrorHandling(handler: Function, context: any, args: null | any[], vm: any, info: string) {
  let res;
  try {
    /* => 依次调用事件回调函数，接受返回值 */
    res = args ? handler.apply(context, args) : handler.call(context);

    if (res && !res._isVue && isPromise(res) && !res._handled) {
      res.catch((e) => handleError(e, vm, info + ` (Promise/async)`));
      // => 避免在嵌套调用时多次触发catch
      res._handled = true;
    }
  } catch (e) {
    handleError(e, vm, info);
  }

  /* => 返回回调函数的返回值 */
  return res;
}

function globalHandleError(err, vm, info) {
  if (config.errorHandler) {
    try {
      return config.errorHandler.call(null, err, vm, info);
    } catch (e) {
      // => 如果用户有意在处理程序中抛出原始错误，则不要记录两次
      if (e !== err) logError(e, null, 'config.errorHandler');
    }
  }
  logError(err, vm, info);
}

function logError(err, vm, info) {
  if (process.env.NODE_ENV !== 'production') warn(`Error in ${info}: "${err.toString()}"`, vm);

  if ((inBrowser || inWeex) && typeof console !== 'undefined') {
    console.error(err);
  } else {
    throw err;
  }
}
