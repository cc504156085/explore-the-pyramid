/* @flow */

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

export function initMixin(Vue: Class<Component>) {
  Vue.prototype._init = function(options?: Object) {
    /* 当前Vue实例 */
    const vm: Component = this;

    // a uid => 每个Vue实例对应一个ID
    vm._uid = uid++;

    /* => 用于测试性能 */
    let startTag, endTag;
    /* istanbul ignore if => 可忽略 */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`;
      endTag = `vue-perf-end:${vm._uid}`;
      mark(startTag);
    }

    // a flag to avoid this being observed => 标记该实例不需要被观测
    vm._isVue = true;

    // merge options => 合并选项
    if (options && options._isComponent) {
      /* => 优化内部组件实例化，因为动态选项合并速度很慢，而且没有一个内部组件选项需要特殊处理。 */
      // optimize internal component instantiation
      // since dynamic options merging is pretty slow, and none of the
      // internal component options needs special treatment.
      initInternalComponent(vm, options);
    } else {
      /* 若没有提供 options 则为 options 合并一些额外的属性 */
      vm.$options = mergeOptions(resolveConstructorOptions(vm.constructor), options || {}, vm);
    }

    /* istanbul ignore else => 可忽略if */
    if (process.env.NODE_ENV !== 'production') {
      initProxy(vm);
    } else {
      vm._renderProxy = vm;
    }

    // expose real self => 暴露真实的自我
    vm._self = vm;

    initLifecycle(vm); // => 初始化当前实例的属性、方法、父子关系
    initEvents(vm); // => 初始化事件
    initRender(vm); // => 初始化渲染
    callHook(vm, 'beforeCreate'); // => 调用第一个生命周期hook
    initInjections(vm); // resolve injections before data/props => 在初始化数据之前解析注入
    initState(vm); // => 初始化数据（data，props）
    initProvide(vm); // resolve provide after data/props => 在初始化数据之后解析注入的数据
    callHook(vm, 'created'); // => 调用第二个生命周期hook，到此，所有的数据、事件、状态相关的东西已经初始化完毕

    /* istanbul ignore if => 可忽略 */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      vm._name = formatComponentName(vm, false);
      mark(endTag);
      measure(`vue ${vm._name} init`, startTag, endTag);
    }

    /* => 以上代码用于创建组件（初始化一个组件所需要的各个东西） */
    if (vm.$options.el) {
      /* => 将组件挂载到 el 元素里 */
      vm.$mount(vm.$options.el);
    }
  };
}

export function initInternalComponent(vm: Component, options: InternalComponentOptions) {
  const opts = (vm.$options = Object.create(vm.constructor.options));
  // doing this because it's faster than dynamic enumeration.
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

export function resolveConstructorOptions(Ctor: Class<Component>) {
  let options = Ctor.options;
  if (Ctor.super) {
    const superOptions = resolveConstructorOptions(Ctor.super);
    const cachedSuperOptions = Ctor.superOptions;
    if (superOptions !== cachedSuperOptions) {
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions;
      // check if there are any late-modified/attached options (#4976)
      const modifiedOptions = resolveModifiedOptions(Ctor);
      // update base extend options
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions);
      }
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions);
      if (options.name) {
        options.components[options.name] = Ctor;
      }
    }
  }
  return options;
}

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
