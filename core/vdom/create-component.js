/* @flow */

import VNode from './vnode';
import { resolveConstructorOptions } from 'core/instance/init';
import { queueActivatedComponent } from 'core/observer/scheduler';
import { createFunctionalComponent } from './create-functional-component';

import { warn, isDef, isUndef, isTrue, isObject } from '../util/index';

import { resolveAsyncComponent, createAsyncPlaceholder, extractPropsFromVNodeData } from './helpers/index';

import { callHook, activeInstance, updateChildComponent, activateChildComponent, deactivateChildComponent } from '../instance/lifecycle';

import { isRecyclableComponent, renderRecyclableComponentTemplate } from 'weex/runtime/recycle-list/render-component-template';

/* => 在修补期间在组件 vnode 上调用的内联钩子 */
const componentVNodeHooks = {
  init(vnode: VNodeWithData, hydrating: boolean): ?boolean {
    if (vnode.componentInstance && !vnode.componentInstance._isDestroyed && vnode.data.keepAlive) {
      // => 缓存组件当作补丁对待
      const mountedNode: any = vnode;
      componentVNodeHooks.prepatch(mountedNode, mountedNode);
    } else {
      const child = (vnode.componentInstance = createComponentInstanceForVnode(vnode, activeInstance));
      child.$mount(hydrating ? vnode.elm : undefined, hydrating);
    }
  },

  prepatch(oldVnode: MountedComponentVNode, vnode: MountedComponentVNode) {
    const options = vnode.componentOptions;
    const child = (vnode.componentInstance = oldVnode.componentInstance);

    /**
     * options.propsData => 更新 props
     * options.listeners => 更新 listeners
     * vnode             => 新的父级虚拟节点
     * options.children  => 新的子节点
     */
    updateChildComponent(child, options.propsData, options.listeners, vnode, options.children);
  },

  insert(vnode: MountedComponentVNode) {
    const { context, componentInstance } = vnode;
    if (!componentInstance._isMounted) {
      componentInstance._isMounted = true;
      callHook(componentInstance, 'mounted');
    }
    if (vnode.data.keepAlive) {
      if (context._isMounted) {
        /**
         * => 在更新期间， keep-alive 组件的子组件可能会更改，因此在这里直接遍历树可能会在不正确的子组件上调用激活的钩子。
         * 相反，我们将他们推入一个队列，将在整个补丁过程结束后处理。
         */
        queueActivatedComponent(componentInstance);
      } else {
        activateChildComponent(componentInstance, true /* direct => 直接 */);
      }
    }
  },

  destroy(vnode: MountedComponentVNode) {
    const { componentInstance } = vnode;
    if (!componentInstance._isDestroyed) {
      if (!vnode.data.keepAlive) {
        componentInstance.$destroy();
      } else {
        deactivateChildComponent(componentInstance, true /* direct => 直接 */);
      }
    }
  },
};

const hooksToMerge = Object.keys(componentVNodeHooks);

/* => 创建组件 */
export function createComponent(
  Ctor: Class<Component> | Function | Object | void,
  data: ?VNodeData,
  context: Component,
  children: ?Array<VNode>,
  tag?: string,
): VNode | Array<VNode> | void {
  if (isUndef(Ctor)) return;

  const baseCtor = context.$options._base;

  // => 普通选项对象：将其转换为构造函数
  if (isObject(Ctor)) Ctor = baseCtor.extend(Ctor);

  // => 如果在此阶段它不是构造函数或异步组件工厂，则拒绝。
  if (typeof Ctor !== 'function') {
    // => 无效的组件定义： Ctor
    if (process.env.NODE_ENV !== 'production') warn(`Invalid Component definition: ${String(Ctor)}`, context);

    return;
  }

  // => 异步组件
  let asyncFactory;
  if (isUndef(Ctor.cid)) {
    asyncFactory = Ctor;
    Ctor = resolveAsyncComponent(asyncFactory, baseCtor);
    if (Ctor === undefined) {
      /**
       * 返回一个异步组件的占位符节点，它作为一个注释节点呈现，但保留了该节点的所有原始信息。
       * 这些信息将用于异步服务器渲染和混合。
       */
      return createAsyncPlaceholder(asyncFactory, data, context, children, tag);
    }
  }

  data = data || {};

  // => 解析构造函数选项，以防组件构造函数创建后应用全局混合
  resolveConstructorOptions(Ctor);

  // => 将组件 v-model 的 data 转换为 props 和 events
  if (isDef(data.model)) transformModel(Ctor.options, data);

  // => 提取 props
  const propsData = extractPropsFromVNodeData(data, Ctor, tag);

  // => 函数式组件
  if (isTrue(Ctor.options.functional)) return createFunctionalComponent(Ctor, propsData, data, context, children);

  // => 提取 listeners ，因为这些侦听器需要被视为子组件侦听器，而不是 DOM 侦听器
  const listeners = data.on;

  // => 将 listeners 替换为 .native 修饰符，以便在父组件补丁期间处理它。
  data.on = data.nativeOn;

  // => 抽象组件不保留任何东西，除了 props 和 listeners 和 slot
  if (isTrue(Ctor.options.abstract)) {
    const slot = data.slot;
    data = {};
    if (slot) data.slot = slot;
  }

  // => 将组件管理钩子安装到占位符节点
  installComponentHooks(data);

  // => 返回一个占位符虚拟节点
  const name = Ctor.options.name || tag;
  const vnode = new VNode(
    `vue-component-${Ctor.cid}${name ? `-${name}` : ''}`,
    data,
    undefined,
    undefined,
    undefined,
    context,
    { Ctor, propsData, listeners, tag, children },
    asyncFactory,
  );

  /* => 特定于 Weex 平台：调用优化的 @render 函数来提取 cell-slot 模板。 */
  if (__WEEX__ && isRecyclableComponent(vnode)) return renderRecyclableComponentTemplate(vnode);

  return vnode;
}

/* => 为虚拟节点创建组件实例 */
export function createComponentInstanceForVnode(vnode: any, parent: any): Component {
  const options: InternalComponentOptions = { _isComponent: true, _parentVnode: vnode, parent };
  // => 检查内联模板渲染函数
  const inlineTemplate = vnode.data.inlineTemplate;
  if (isDef(inlineTemplate)) {
    options.render = inlineTemplate.render;
    options.staticRenderFns = inlineTemplate.staticRenderFns;
  }
  return new vnode.componentOptions.Ctor(options);
}

/* => 注册组件 hooks */
function installComponentHooks(data: VNodeData) {
  const hooks = data.hook || (data.hook = {});
  for (let i = 0; i < hooksToMerge.length; i++) {
    const key = hooksToMerge[i];
    const existing = hooks[key];
    const toMerge = componentVNodeHooks[key];
    if (existing !== toMerge && !(existing && existing._merged)) hooks[key] = existing ? mergeHook(toMerge, existing) : toMerge;
  }
}

/* => 合并钩子 */
function mergeHook(f1: any, f2: any): Function {
  const merged = (a, b) => {
    f1(a, b);
    f2(a, b);
  };
  merged._merged = true;
  return merged;
}

/* => 将组件 v-model 的信息(值和回调)分别转换为 prop 和事件处理程序。 */
function transformModel(options, data: any) {
  const prop = (options.model && options.model.prop) || 'value';
  const event = (options.model && options.model.event) || 'input';
  (data.attrs || (data.attrs = {}))[prop] = data.model.value;
  const on = data.on || (data.on = {});
  const existing = on[event];
  const callback = data.model.callback;
  if (isDef(existing)) {
    if (Array.isArray(existing) ? existing.indexOf(callback) === -1 : existing !== callback) on[event] = [callback].concat(existing);
  } else {
    on[event] = callback;
  }
}
