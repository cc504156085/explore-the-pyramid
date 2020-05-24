import { warn, once, isDef, isUndef, isTrue, isObject, hasSymbol, isPromise, remove } from 'core/util/index';

import { createEmptyVNode } from 'core/vdom/vnode';
import { currentRenderingInstance } from 'core/instance/render';

// => 确保返回一个组件
function ensureCtor(comp: any, base) {
  // => 不管是通过何种模块方式导出的组件，确保能拿到它
  if (comp.__esModule || (hasSymbol && comp[Symbol.toStringTag] === 'Module')) comp = comp.default;

  return isObject(comp) ? base.extend(comp) : comp;
}

/* => 创建异步占位节点 */
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

/* => 解析异步组件，baseCtor 是 Vue */
export function resolveAsyncComponent(factory: Function, baseCtor: Class<Component>): Class<Component> | void {
  // => 错误优先级第一
  if (isTrue(factory.error) && isDef(factory.errorComp)) return factory.errorComp;

  // => 强制渲染更新时，再次执行到此，此时 factory.resolved 已经持有值，直接返回组件
  if (isDef(factory.resolved)) return factory.resolved;

  // => 当前渲染实例 Vue
  const owner = currentRenderingInstance;

  // => 已经等待（已经解析过了，将当前渲染实例存入即可，将异步组件解析结果缓存起来供未来重渲染）
  if (owner && isDef(factory.owners) && factory.owners.indexOf(owner) === -1) factory.owners.push(owner);

  // => 若标识 loading 为 true ，并且异步组件未决议，则渲染 loading 组件
  if (isTrue(factory.loading) && isDef(factory.loadingComp)) return factory.loadingComp;

  // => 第一次 factory 上没有 owners 属性
  if (owner && !isDef(factory.owners)) {
    // => 给 factory 加上这个属性，避免重复解析
    const owners = (factory.owners = [owner]);

    // => 同步标识符
    let sync = true;

    let timerLoading = null;
    let timerTimeout = null;

    owner.$on('hook:destroyed', () => remove(owners, owner));

    // => 强制渲染更新
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

    // => 保证只调用一次的一次性函数 once ，异步加载完成后调用该函数
    const resolve = once((res: Object | Class<Component>) => {
      // => 缓存决议（ res 为异步返回结果）
      factory.resolved = ensureCtor(res, baseCtor);

      // => 只有在这不是同步解析时才调用回调(异步解析在 SSR 期间被设置为同步)
      // => 当异步解析组件，调用 factory(resolve, reject) 的 resolve 方法时， sync 已经改成了 false ，然后强制渲染更新
      if (!sync) {
        forceRender(true);
      } else {
        owners.length = 0;
      }
    });

    const reject = once((reason) => {
      process.env.NODE_ENV !== 'production' &&
      // => 无法解析异步组件
      warn(`Failed to resolve async component: ${ String(factory) }` + (reason ? `Reason: ${ reason }` : ''));

      // => 如果配置了错误组件，直接强制渲染
      if (isDef(factory.errorComp)) {
        // => 标识为 true
        factory.error = true;

        // => 强制渲染更新，再次执行 resolveAsyncComponent() 方法时，factory.error 为 true ，直接渲染错误组件
        forceRender(true);
      }
    });

    // => factory 执行，在异步代码执行完成后，resolve 才调用，它包含组件相关的信息（组件路径 / template ）
    const res = factory(resolve, reject);

    // => 如果返回的 res 是一个对象，则使用的是 Promise 的方式来加载异步组件
    if (isObject(res)) {
      if (isPromise(res)) {
        // factory 是 () => import() 的形式，返回一个 Promise ，调用它的 then 方法，成功则执行 resolve ，失败则执行 reject
        if (isUndef(factory.resolved)) res.then(resolve, reject);
      } else if (isPromise(res.component)) {
        // => 高阶异步组件，factory 执行返回的是一个对象，而这个对象的 component 属性值是一个 Promise
        res.component.then(resolve, reject);

        // => 如果提供了错误组件
        if (isDef(res.error)) factory.errorComp = ensureCtor(res.error, baseCtor);

        // => 如果提供了 loading 组件
        if (isDef(res.loading)) {
          factory.loadingComp = ensureCtor(res.loading, baseCtor);

          // => 不延时，直接渲染 loading 组件
          if (res.delay === 0) {
            factory.loading = true;
          } else {
            // => 延时渲染
            timerLoading = setTimeout(() => {
              timerLoading = null;

              // => 如果加载的组件还未决议，并且没有错误发生
              if (isUndef(factory.resolved) && isUndef(factory.error)) {
                // => 标识需要渲染 loading 组件
                factory.loading = true;

                // => 强制渲染更新，再次执行 resolveAsyncComponent() 方法，此时 factory.loading 为 true，则渲染 loading 组件
                forceRender(false);
              }
            }, res.delay || 200); // => 默认延时 200ms
          }
        }

        // => 设定异步组件加载超时期限
        if (isDef(res.timeout)) {
          timerTimeout = setTimeout(() => {
            timerTimeout = null;

            // => 若超时后异步组件仍未决议，将 Promise 状态改为拒绝状态（调用 reject ）
            if (isUndef(factory.resolved)) reject(process.env.NODE_ENV !== 'production' ? `timeout (${ res.timeout }ms)` : null);
          }, res.timeout);
        }
      }
    }

    // => 同步标识符已经改成了 false ，因为 resolve 在异步的，所以在调用 resolve 时，将强制渲染更新视图
    sync = false;

    // => 如果同步解析（同步代码执行到此），返回 undefined 。
    // => 如果标识为渲染 loading ，则返回 loading 组件，就不会创建注释节点占位，而是直接渲染 loading 组件
    return factory.loading ? factory.loadingComp : factory.resolved;
  }
}
