/* @flow */

import { warn, nextTick, emptyObject, handleError, defineReactive } from '../util/index';

import { createElement } from '../vdom/create-element';
import { installRenderHelpers } from './render-helpers/index';
import { resolveSlots } from './render-helpers/resolve-slots';
import { normalizeScopedSlots } from '../vdom/helpers/normalize-scoped-slots';
import VNode, { createEmptyVNode } from '../vdom/vnode';

import { isUpdatingChildComponent } from './lifecycle';

export function initRender(vm: Component) {
  vm._vnode = null; // the root of the child tree => 子树的根
  vm._staticTrees = null; // v-once cached trees => v-once 缓存树

  const options = vm.$options;

  // the placeholder node in parent tree => 父树中的占位符节点
  const parentVnode = (vm.$vnode = options._parentVnode);

  const renderContext = parentVnode && parentVnode.context;
  vm.$slots = resolveSlots(options._renderChildren, renderContext);
  vm.$scopedSlots = emptyObject;

  // bind the createElement fn to this instance => 将 createElement fn 绑定到此实例
  // so that we get proper render context inside it. => 以便在其中获得正确的 render 上下文
  // args order: tag, data, children, normalizationType, alwaysNormalize => args 顺序：标记、数据、子项、规格化类型
  // internal version is used by render functions compiled from templates => alwaysNormalize 内部版本由从模板编译的 render 函数使用
  vm._c = (a, b, c, d) => createElement(vm, a, b, c, d, false);

  // normalization is always applied for the public version. => 规范化始终应用于公共版本
  // used in user-written render functions. => 用于用户编写的render函数
  vm.$createElement = (a, b, c, d) => createElement(vm, a, b, c, d, true);

  // $attrs & $listeners are exposed for easier HOC creation. => $attrs 和 $listeners 被公开，以便更轻松地创建 hook
  // they need to be reactive so that HOCs using them are always updated => 它们必须是被动的，这样使用它们的 hooks 总是更新的
  const parentData = parentVnode && parentVnode.data;

  defineReactive(vm, '$attrs', (parentData && parentData.attrs) || emptyObject, null, true);
  defineReactive(vm, '$listeners', options._parentListeners || emptyObject, null, true);
}

export let currentRenderingInstance: Component | null = null;

// for testing only => 仅用于测试
export function setCurrentRenderingInstance(vm: Component) {
  currentRenderingInstance = vm;
}

export function renderMixin(Vue: Class<Component>) {
  // install runtime convenience helpers => 注册运行时便利助手
  installRenderHelpers(Vue.prototype);

  Vue.prototype.$nextTick = function (fn: Function) {
    return nextTick(fn, this);
  };

  Vue.prototype._render = function (): VNode {
    /* => 缓存调用的上下文 */
    const vm: Component = this;

    /* => 解构在调用 $mount 方法时在 options 上挂载的 render 函数 */
    const { render, _parentVnode } = vm.$options;

    if (_parentVnode) {
      vm.$scopedSlots = normalizeScopedSlots(_parentVnode.data.scopedSlots, vm.$slots, vm.$scopedSlots);
    }

    // set parent vnode. this allows render functions to have access
    // to the data on the placeholder node. => 设置父级 vnode。这允许 render 函数访问占位符节点上的数据。
    vm.$vnode = _parentVnode;

    // render self => 渲染自我
    let vnode;
    try {
      /* => 不需要维护堆栈，因为所有渲染FN都是彼此独立调用的。在修补父组件时调用嵌套组件的渲染FN。 */
      // There's no need to maintain a stack because all render fns are called
      // separately from one another. Nested component's render fns are called
      // when parent component is patched.
      currentRenderingInstance = vm;

      /* => _renderProxy 在开发环境下为当前 vm 实例，$createElement 为用户指定的 render 函数的处理函数，最终返回一个 VNode */
      vnode = render.call(vm._renderProxy, vm.$createElement);
    } catch (e) {
      handleError(e, vm, `render`);

      /* => 返回错误 render 结果，或上一个 vnode 以防止 render 错误导致空白组件 */
      // return error render result,
      // or previous vnode to prevent render error causing blank component

      /* istanbul ignore else => 可忽略 */
      if (process.env.NODE_ENV !== 'production' && vm.$options.renderError) {
        try {
          vnode = vm.$options.renderError.call(vm._renderProxy, vm.$createElement, e);
        } catch (e) {
          handleError(e, vm, `renderError`);
          vnode = vm._vnode;
        }
      } else {
        vnode = vm._vnode;
      }
    } finally {
      currentRenderingInstance = null;
    }

    // if the returned array contains only a single node, allow it => 如果返回的数组只包含一个节点（ template 只有一个根节点），则允许它
    if (Array.isArray(vnode) && vnode.length === 1) {
      vnode = vnode[0];
    }

    // return empty vnode in case the render function errored out => 如果 render 函数出错，返回空vnode
    if (!(vnode instanceof VNode)) {
      if (process.env.NODE_ENV !== 'production' && Array.isArray(vnode)) {
        /* => 从 render 函数返回多个根节点。Render函数应该返回一个根节点。 */
        /* => 所以在 template 模板中只能指定一个根节点 */
        warn(`Multiple root nodes returned from render function. Render function should return a single root node.`, vm);
      }

      vnode = createEmptyVNode();
    }

    // set parent => 设置父级
    vnode.parent = _parentVnode;

    /* => 返回 VNode */
    return vnode;
  };
}
