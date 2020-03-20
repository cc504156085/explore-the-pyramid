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

  // bind the createElement fn to this instance => 将createElement fn绑定到此实例
  // so that we get proper render context inside it. => 以便在其中获得正确的render上下文
  // args order: tag, data, children, normalizationType, alwaysNormalize => args顺序：标记、数据、子项、规格化类型
  // internal version is used by render functions compiled from templates => alwaysNormalize内部版本由从模板编译的render函数使用
  vm._c = (a, b, c, d) => createElement(vm, a, b, c, d, false);

  // normalization is always applied for the public version. => 规范化始终应用于公共版本
  // used in user-written render functions. => 用于用户编写的render函数
  vm.$createElement = (a, b, c, d) => createElement(vm, a, b, c, d, true);

  // $attrs & $listeners are exposed for easier HOC creation. => $attrs和$listeners被公开，以便更轻松地创建hook
  // they need to be reactive so that HOCs using them are always updated => 它们必须是被动的，这样使用它们的hooks总是更新的
  const parentData = parentVnode && parentVnode.data;

  /* istanbul ignore else => 可忽略 else */
  if (process.env.NODE_ENV !== 'production') {
    defineReactive(
      vm,
      '$attrs',
      (parentData && parentData.attrs) || emptyObject,
      () => {
        !isUpdatingChildComponent && warn(`$attrs is readonly.`, vm);
      },
      true,
    );
    defineReactive(
      vm,
      '$listeners',
      options._parentListeners || emptyObject,
      () => {
        !isUpdatingChildComponent && warn(`$listeners is readonly.`, vm);
      },
      true,
    );
  } else {
    defineReactive(vm, '$attrs', (parentData && parentData.attrs) || emptyObject, null, true);
    defineReactive(vm, '$listeners', options._parentListeners || emptyObject, null, true);
  }
}

export let currentRenderingInstance: Component | null = null;

// for testing only => 仅用于测试
export function setCurrentRenderingInstance(vm: Component) {
  currentRenderingInstance = vm;
}

export function renderMixin(Vue: Class<Component>) {
  // install runtime convenience helpers => 注册运行时便利助手
  installRenderHelpers(Vue.prototype);

  Vue.prototype.$nextTick = function(fn: Function) {
    return nextTick(fn, this);
  };

  Vue.prototype._render = function(): VNode {
    const vm: Component = this;
    const { render, _parentVnode } = vm.$options;

    if (_parentVnode) {
      vm.$scopedSlots = normalizeScopedSlots(
        _parentVnode.data.scopedSlots,
        vm.$slots,
        vm.$scopedSlots,
      );
    }

    // set parent vnode. this allows render functions to have access
    // to the data on the placeholder node.
    vm.$vnode = _parentVnode;
    // render self
    let vnode;
    try {
      // There's no need to maintain a stack because all render fns are called
      // separately from one another. Nested component's render fns are called
      // when parent component is patched.
      currentRenderingInstance = vm;
      vnode = render.call(vm._renderProxy, vm.$createElement);
    } catch (e) {
      handleError(e, vm, `render`);
      // return error render result,
      // or previous vnode to prevent render error causing blank component
      /* istanbul ignore else */
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
    // if the returned array contains only a single node, allow it
    if (Array.isArray(vnode) && vnode.length === 1) {
      vnode = vnode[0];
    }
    // return empty vnode in case the render function errored out
    if (!(vnode instanceof VNode)) {
      if (process.env.NODE_ENV !== 'production' && Array.isArray(vnode)) {
        warn(
          'Multiple root nodes returned from render function. Render function ' +
            'should return a single root node.',
          vm,
        );
      }
      vnode = createEmptyVNode();
    }
    // set parent
    vnode.parent = _parentVnode;
    return vnode;
  };
}
