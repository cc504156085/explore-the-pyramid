/* @flow */

import { warn, once, isDef, isUndef, isTrue, isObject, hasSymbol, isPromise, remove } from 'core/util/index';

import { createEmptyVNode } from 'core/vdom/vnode';
import { currentRenderingInstance } from 'core/instance/render';

function ensureCtor(comp: any, base) {
  if (comp.__esModule || (hasSymbol && comp[Symbol.toStringTag] === 'Module')) comp = comp.default;

  return isObject(comp) ? base.extend(comp) : comp;
}

/* => 创建异步占位符 */
export function createAsyncPlaceholder(
  factory: Function,
  data: ?VNodeData,
  context: Component,
  children: ?Array<VNode>,
  tag: ?string,
): VNode {
  const node = createEmptyVNode();
  node.asyncFactory = factory;
  node.asyncMeta = { data, context, children, tag };
  return node;
}

/* => 解析异步组件 */
export function resolveAsyncComponent(factory: Function, baseCtor: Class<Component>): Class<Component> | void {
  if (isTrue(factory.error) && isDef(factory.errorComp)) return factory.errorComp;

  if (isDef(factory.resolved)) return factory.resolved;

  const owner = currentRenderingInstance;

  // => 已经等待
  if (owner && isDef(factory.owners) && factory.owners.indexOf(owner) === -1) factory.owners.push(owner);

  if (isTrue(factory.loading) && isDef(factory.loadingComp)) return factory.loadingComp;

  if (owner && !isDef(factory.owners)) {
    const owners = (factory.owners = [owner]);
    let sync = true;
    let timerLoading = null;
    let timerTimeout = null;

    owner.$on('hook:destroyed', () => remove(owners, owner));

    const forceRender = (renderCompleted: boolean) => {
      for (let i = 0, l = owners.length; i < l; i++) {
        (owners[i]: any).$forceUpdate();
      }

      if (renderCompleted) {
        owners.length = 0;
        if (timerLoading !== null) {
          clearTimeout(timerLoading);
          timerLoading = null;
        }
        if (timerTimeout !== null) {
          clearTimeout(timerTimeout);
          timerTimeout = null;
        }
      }
    };

    const resolve = once((res: Object | Class<Component>) => {
      // => 缓存决议
      factory.resolved = ensureCtor(res, baseCtor);

      // => 只有在这不是同步解析时才调用回调(异步解析在 SSR 期间被设置为同步)
      if (!sync) {
        forceRender(true);
      } else {
        owners.length = 0;
      }
    });

    const reject = once((reason) => {
      process.env.NODE_ENV !== 'production' &&
        warn(`Failed to resolve async component: ${String(factory)}` + (reason ? `\nReason: ${reason}` : ''));
      if (isDef(factory.errorComp)) {
        factory.error = true;
        forceRender(true);
      }
    });

    const res = factory(resolve, reject);

    if (isObject(res)) {
      if (isPromise(res)) {
        // () => Promise
        if (isUndef(factory.resolved)) res.then(resolve, reject);
      } else if (isPromise(res.component)) {
        res.component.then(resolve, reject);

        if (isDef(res.error)) factory.errorComp = ensureCtor(res.error, baseCtor);

        if (isDef(res.loading)) {
          factory.loadingComp = ensureCtor(res.loading, baseCtor);
          if (res.delay === 0) {
            factory.loading = true;
          } else {
            timerLoading = setTimeout(() => {
              timerLoading = null;
              if (isUndef(factory.resolved) && isUndef(factory.error)) {
                factory.loading = true;
                forceRender(false);
              }
            }, res.delay || 200);
          }
        }

        if (isDef(res.timeout)) {
          timerTimeout = setTimeout(() => {
            timerTimeout = null;
            if (isUndef(factory.resolved)) reject(process.env.NODE_ENV !== 'production' ? `timeout (${res.timeout}ms)` : null);
          }, res.timeout);
        }
      }
    }

    sync = false;

    // => 如果同步解析，返回
    return factory.loading ? factory.loadingComp : factory.resolved;
  }
}
