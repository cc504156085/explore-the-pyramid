import config from '../config';
import { initProxy } from './proxy';
import { initState } from './state';
import { initRender } from './render';
import { initEvents } from './events';
import { mark, measure } from '../util/perf';
import { initLifecycle, callHook } from './lifecycle';
import { initProvide, initInjections } from './inject';
import { extend, mergeOptions, formatComponentName } from '../util/index';

let uid = 0;

/* => 初始化混入 */
export function initMixin(Vue: Class<Component>) {
  Vue.prototype._init = function (options?: Object) {
    /* => 当前Vue实例 */
    const vm: Component = this;

    // => 每个Vue实例对应一个ID
    vm._uid = uid++;

    // => 标记该实例不需要被观测
    vm._isVue = true;

    // => 合并选项
    if (options && options._isComponent) {
      /* => 优化内部组件实例化，因为动态选项合并速度很慢，而且没有一个内部组件选项需要特殊处理。 */
      initInternalComponent(vm, options);
    } else {
      /* 若没有提供 options 则为 options 合并一些额外的属性 */
      vm.$options = mergeOptions(resolveConstructorOptions(vm.constructor), options || {}, vm);
    }

    if (process.env.NODE_ENV !== 'production') {
      initProxy(vm);
    } else {
      vm._renderProxy = vm;
    }

    // => 暴露真实的 this
    vm._self = vm;

    initLifecycle(vm); // => 初始化当前实例的属性、方法、父子关系
    initEvents(vm); // => 初始化事件（父组件传给子组件的事件）、同时创建事件池对象，存储事件
    initRender(vm); // => 初始化渲染
    callHook(vm, 'beforeCreate'); // => 调用第一个生命周期 hook
    initInjections(vm); // => 在初始化数据之前解析注入
    initState(vm); // => 初始化数据（data，props）
    initProvide(vm); // => 在初始化数据之后解析注入的数据
    callHook(vm, 'created'); // => 调用第二个生命周期 hook，到此，所有的数据、事件、状态相关的东西已经初始化完毕

    /* => 以上代码用于创建组件（初始化一个组件所需要的各个东西） */
    /* => 如果提供了 el ，将组件挂载到 el 元素里。否则需要手动调用 $mount */
    vm.$options.el && vm.$mount(vm.$options.el);
  };
}

/* => 初始化内部组件 */
export function initInternalComponent(vm: Component, options: InternalComponentOptions) {
  const opts = (vm.$options = Object.create(vm.constructor.options));

  // => 这样做是因为它比动态枚举快。
  const parentVnode = options._parentVnode;
  opts.parent = options.parent;
  opts._parentVnode = parentVnode;

  const vnodeComponentOptions = parentVnode.componentOptions;
  opts.propsData = vnodeComponentOptions.propsData;
  opts._parentListeners = vnodeComponentOptions.listeners;
  opts._renderChildren = vnodeComponentOptions.children;
  opts._componentTag = vnodeComponentOptions.tag;

  if (options.render) {
    opts.render = options.render;
    opts.staticRenderFns = options.staticRenderFns;
  }
}

/* => 解析构造函数中的选项 */
export function resolveConstructorOptions(Ctor: Class<Component>) {
  let options = Ctor.options;
  if (Ctor.super) {
    const superOptions = resolveConstructorOptions(Ctor.super);
    const cachedSuperOptions = Ctor.superOptions;
    if (superOptions !== cachedSuperOptions) {
      // => 改变超类选项
      // => 需要解决新的选项。
      Ctor.superOptions = superOptions;

      // => 检查是否有任何后期修改/附加的选项
      const modifiedOptions = resolveModifiedOptions(Ctor);

      // => 更新基本扩展选项
      if (modifiedOptions) extend(Ctor.extendOptions, modifiedOptions);

      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions);
      if (options.name) options.components[options.name] = Ctor;
    }
  }
  return options;
}

/* => 解析修改过的选项 */
function resolveModifiedOptions(Ctor: Class<Component>): ?Object {
  let modified;
  const latest = Ctor.options;
  const sealed = Ctor.sealedOptions;
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {};
      modified[key] = latest[key];
    }
  }
  return modified;
}
