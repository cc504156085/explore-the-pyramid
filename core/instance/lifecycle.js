import config from '../config';
import Watcher from '../observer/watcher';
import { mark, measure } from '../util/perf';
import { createEmptyVNode } from '../vdom/vnode';
import { updateComponentListeners } from './events';
import { resolveSlots } from './render-helpers/resolve-slots';
import { toggleObserving } from '../observer/index';
import { pushTarget, popTarget } from '../observer/dep';

import { warn, noop, remove, emptyObject, validateProp, invokeWithErrorHandling } from '../util/index';

export let activeInstance: any = null;
export let isUpdatingChildComponent: boolean = false;

export function setActiveInstance(vm: Component) {
  const prevActiveInstance = activeInstance;
  activeInstance = vm;
  return () => (activeInstance = prevActiveInstance);
}

export function initLifecycle(vm: Component) {
  const options = vm.$options;

  // => 定位第一个非抽象父级
  let parent = options.parent;
  if (parent && !options.abstract) {
    /* => 循环拿到父级，如果父级还是抽象类，则继续自底向上循环 */
    while (parent.$options.abstract && parent.$parent) {
      parent = parent.$parent;
    }

    /* => 将自己存入父级的子列表中 */
    parent.$children.push(vm);
  }

  /* => 说明子组件创建时，父组件已经存在 */
  vm.$parent = parent;

  /* => 当前组件树的根实例，如果没有父级，自己就是根实例 */
  vm.$root = parent ? parent.$root : vm;

  /* => 子实例列表 */
  vm.$children = [];

  /* => dom 列表 */
  vm.$refs = {};

  /* => 私有属性初始化 */
  vm._watcher = null;
  vm._inactive = null;
  vm._directInactive = false;
  vm._isMounted = false;
  vm._isDestroyed = false;
  vm._isBeingDestroyed = false;
}

export function lifecycleMixin(Vue: Class<Component>) {
  Vue.prototype._update = function (vnode: VNode, hydrating?: boolean) {
    const vm: Component = this;
    const prevEl = vm.$el;
    const prevVnode = vm._vnode;
    const restoreActiveInstance = setActiveInstance(vm);
    vm._vnode = vnode;

    // => 在入口点注入 Vue.prototype.__patch__
    // => 基于使用的渲染后端。
    if (!prevVnode) {
      // => 首次渲染
      vm.$el = vm.__patch__(vm.$el, vnode, hydrating, false /* removeOnly */);
    } else {
      // => 数据更新时
      vm.$el = vm.__patch__(prevVnode, vnode);
    }

    restoreActiveInstance();

    // => 更新参考
    if (prevEl) prevEl.__vue__ = null;

    if (vm.$el) vm.$el.__vue__ = vm;

    // => 如果父节点是 hook ，也更新其 $el
    // => 调度程序调用更新的钩子以确保在父级的更新挂钩中更新。
    if (vm.$vnode && vm.$parent && vm.$vnode === vm.$parent._vnode) vm.$parent.$el = vm.$el;
  };

  /* => 强制组件重新渲染（只影响实例本身以及插入插槽的子组件） */
  Vue.prototype.$forceUpdate = function () {
    const vm: Component = this;

    /* => 通知当前实例上的渲染 Watcher 更新 */
    if (vm._watcher) vm._watcher.update();
  };

  /* => 完全销毁一个 vm 实例 */
  Vue.prototype.$destroy = function () {
    const vm: Component = this;

    /* => 说明当前 vm 实例正在被销毁（防止重复销毁） */
    if (vm._isBeingDestroyed) return;

    /* => 调用 hook */
    callHook(vm, 'beforeDestroy');

    /* => 标识正在销毁中 */
    vm._isBeingDestroyed = true;

    // => 从父级移除自己（切断自己与父级的联系）
    const parent = vm.$parent;

    /* => 1.从父级的子列表中删除自己 */
    if (parent && !parent._isBeingDestroyed && !vm.$options.abstract) remove(parent.$children, vm);

    // => 卸载 Watcher
    /* => 2.调用渲染 Watcher 卸载自己（从 dep 依赖列表中移除自己，之后就不会再收到状态变化通知） */
    if (vm._watcher) vm._watcher.teardown();

    /* => 卸载通过 $watch 创建的 Watcher 实例 */
    let i = vm._watchers.length;
    while (i--) {
      vm._watchers[i].teardown();
    }

    /* => 3.从冻结对象中删除引用可能没有观察者 */
    if (vm._data.__ob__) vm._data.__ob__.vmCount--;

    // => 调用最后一个钩子。。。（标识已销毁）
    vm._isDestroyed = true;

    // => 4.调用当前 render 树上的销毁 hook （销毁 DOM ，销毁子节点）
    vm.__patch__(vm._vnode, null);

    // => 调用销毁 hook
    callHook(vm, 'destroyed');

    // => 5.关闭所有实例侦听器。
    vm.$off();

    // => 删除引用
    if (vm.$el) vm.$el.__vue__ = null;

    // => 发布循环引用
    if (vm.$vnode) vm.$vnode.parent = null;
  };
}

export function mountComponent(vm: Component, el: ?Element, hydrating?: boolean): Component {
  vm.$el = el;

  /* => 如果最终 render 函数不存在 */
  if (!vm.$options.render) {
    /* => 则指向一个创建空节点的函数 */
    vm.$options.render = createEmptyVNode;

    /* => 说明在使用了只有运行时的Vue版本时又使用了 template ，没有编译版本的文件帮助用户编译 */
    if (process.env.NODE_ENV !== 'production') {
      /* istanbul ignore if => 可忽略 */
      /* => 判断模板是否存在且模板字符串是否不以 # 开头/是否含有 el / el元素 */
      if ((vm.$options.template && vm.$options.template.charAt(0) !== '#') || vm.$options.el || el) {
        /* => 在模板编译器不可用的情况下，您使用的是仅运行时 build 的Vue。将模板预编译为 render 函数，或使用包含编译器的 build 文件 */
        warn(
          'You are using the runtime-only build of Vue where the template ' +
            'compiler is not available. Either pre-compile the templates into ' +
            'render functions, or use the compiler-included build.',
          vm,
        );
      } else {
        /* => 未能挂载组件：未定义 template 或 render 函数 */
        warn('Failed to mount component: template or render function not defined.', vm);
      }
    }
  }

  /* => 调用生命周期 hook */
  callHook(vm, 'beforeMount');

  /* => 执行 _render 方法，返回 VNode 作为第一个参数，执行 _update 更新 DOM */
  /* => 对新 VNode 和旧 VNode 进行 patch ，更新 DOM */
  const updateComponent = () => vm._update(vm._render(), hydrating);

  /* => 我们在 Watcher 的构造函数中将其设置为 vm._watcher
   * => 因为 Watcher 的初始补丁可能调用 $forceUpdate （例如，在子组件的 mount hook）
   * => 这依赖于已经定义的 vm._watcher
   */

  /* => 创建一个渲染相关的 Watcher，当状态发生改变时，触发 updateComponent 函数，再调用 VNode 进行比对，然后更新视图 */
  /* => @params：实例（组件）、表达式（函数）、回调函数（这里是空函数 no operation）、配置项、是否为渲染Watcher */
  new Watcher(
    vm,
    updateComponent,
    noop,
    {
      before() {
        if (vm._isMounted && !vm._isDestroyed) callHook(vm, 'beforeUpdate');
      },
    },
    true /* isRenderWatcher => 标识为渲染 Watcher （ true ） */,
  );

  hydrating = false;

  // => 手动挂载实例，调用挂载在自己身上 mounted 在其插入的钩子中调用渲染创建的子组件
  if (vm.$vnode == null) {
    /* => 标识已挂载 */
    vm._isMounted = true;

    /* => 调用生命周期 hook */
    callHook(vm, 'mounted');
  }

  /* => 返回实例 */
  return vm;
}

export function updateChildComponent(
  vm: Component,
  propsData: ?Object,
  listeners: ?Object,
  parentVnode: MountedComponentVNode,
  renderChildren: ?Array<VNode>,
) {
  if (process.env.NODE_ENV !== 'production') isUpdatingChildComponent = true;

  // determine whether component has slot children
  // we need to do this before overwriting $options._renderChildren.

  // check if there are dynamic scopedSlots (hand-written or compiled but with
  // dynamic slot names). Static scoped slots compiled from template has the
  // "$stable" marker.
  const newScopedSlots = parentVnode.data.scopedSlots;
  const oldScopedSlots = vm.$scopedSlots;
  const hasDynamicScopedSlot = !!(
    (newScopedSlots && !newScopedSlots.$stable) ||
    (oldScopedSlots !== emptyObject && !oldScopedSlots.$stable) ||
    (newScopedSlots && vm.$scopedSlots.$key !== newScopedSlots.$key)
  );

  // Any static slot children from the parent may have changed during parent's
  // update. Dynamic scoped slots may also have changed. In such cases, a forced
  // update is necessary to ensure correctness.
  const needsForceUpdate = !!(
    renderChildren || // has new static slots
    vm.$options._renderChildren || // has old static slots
    hasDynamicScopedSlot
  );

  vm.$options._parentVnode = parentVnode;
  vm.$vnode = parentVnode; // update vm's placeholder node without re-render

  // update child tree's parent
  if (vm._vnode) vm._vnode.parent = parentVnode;

  vm.$options._renderChildren = renderChildren;

  // update $attrs and $listeners hash
  // these are also reactive so they may trigger child update if the child
  // used them during render
  vm.$attrs = parentVnode.data.attrs || emptyObject;
  vm.$listeners = listeners || emptyObject;

  // update props
  if (propsData && vm.$options.props) {
    toggleObserving(false);
    const props = vm._props;
    const propKeys = vm.$options._propKeys || [];
    for (let i = 0; i < propKeys.length; i++) {
      const key = propKeys[i];
      const propOptions: any = vm.$options.props; // wtf flow?
      props[key] = validateProp(key, propOptions, propsData, vm);
    }
    toggleObserving(true);
    // keep a copy of raw propsData
    vm.$options.propsData = propsData;
  }

  // update listeners
  listeners = listeners || emptyObject;
  const oldListeners = vm.$options._parentListeners;
  vm.$options._parentListeners = listeners;
  updateComponentListeners(vm, listeners, oldListeners);

  // resolve slots + force update if has children
  if (needsForceUpdate) {
    vm.$slots = resolveSlots(renderChildren, parentVnode.context);
    vm.$forceUpdate();
  }

  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = false;
  }
}

function isInInactiveTree(vm) {
  while (vm && (vm = vm.$parent)) {
    if (vm._inactive) return true;
  }
  return false;
}

export function activateChildComponent(vm: Component, direct?: boolean) {
  if (direct) {
    vm._directInactive = false;
    if (isInInactiveTree(vm)) return;
  } else if (vm._directInactive) {
    return;
  }
  if (vm._inactive || vm._inactive === null) {
    vm._inactive = false;
    for (let i = 0; i < vm.$children.length; i++) {
      activateChildComponent(vm.$children[i]);
    }
    callHook(vm, 'activated');
  }
}

export function deactivateChildComponent(vm: Component, direct?: boolean) {
  if (direct) {
    vm._directInactive = true;
    if (isInInactiveTree(vm)) return;
  }
  if (!vm._inactive) {
    vm._inactive = true;
    for (let i = 0; i < vm.$children.length; i++) {
      deactivateChildComponent(vm.$children[i]);
    }
    callHook(vm, 'deactivated');
  }
}

export function callHook(vm: Component, hook: string) {
  // => 调用生命周期钩子时禁用 dep 集合
  pushTarget();
  const handlers = vm.$options[hook];
  const info = `${hook} hook`;
  if (handlers) {
    for (let i = 0, j = handlers.length; i < j; i++) {
      invokeWithErrorHandling(handlers[i], vm, null, vm, info);
    }
  }
  if (vm._hasHookEvent) vm.$emit('hook:' + hook);

  popTarget();
}
