/* @flow */

import VNode, { cloneVNode } from './vnode';
import { createElement } from './create-element';
import { resolveInject } from '../instance/inject';
import { normalizeChildren } from '../vdom/helpers/normalize-children';
import { resolveSlots } from '../instance/render-helpers/resolve-slots';
import { normalizeScopedSlots } from '../vdom/helpers/normalize-scoped-slots';
import { installRenderHelpers } from '../instance/render-helpers/index';

import { isDef, isTrue, hasOwn, camelize, emptyObject, validateProp } from '../util/index';

/* => 功能渲染上下文 */
export function FunctionalRenderContext(
  data: VNodeData,
  props: Object,
  children: ?Array<VNode>,
  parent: Component,
  Ctor: Class<Component>,
) {
  const options = Ctor.options;

  // => 确保函数组件中的 createElement 函数获得唯一的上下文，这对于正确的命名插槽检查是必要的
  let contextVm;
  if (hasOwn(parent, '_uid')) {
    contextVm = Object.create(parent);
    contextVm._original = parent;
  } else {
    // => 传入的上下文 vm 也是一个功能上下文。在本例中，我们希望确保能够获得实际上下文实例。
    contextVm = parent;
    parent = parent._original;
  }
  const isCompiled = isTrue(options._compiled);
  const needNormalization = !isCompiled;

  this.data = data;
  this.props = props;
  this.children = children;
  this.parent = parent;
  this.listeners = data.on || emptyObject;
  this.injections = resolveInject(options.inject, parent);
  this.slots = () => {
    if (!this.$slots) normalizeScopedSlots(data.scopedSlots, (this.$slots = resolveSlots(children, parent)));

    return this.$slots;
  };

  Object.defineProperty(this, 'scopedSlots', {
    enumerable: true,
    get() {
      return normalizeScopedSlots(data.scopedSlots, this.slots());
    },
  });

  // => 支持编译的函数模板
  if (isCompiled) {
    // => 为 renderStatic() 函数提供 $options
    this.$options = options;
    // => renderSlot() 的预解析插槽
    this.$slots = this.slots();
    this.$scopedSlots = normalizeScopedSlots(data.scopedSlots, this.$slots);
  }

  if (options._scopeId) {
    this._c = (a, b, c, d) => {
      const vnode = createElement(contextVm, a, b, c, d, needNormalization);
      if (vnode && !Array.isArray(vnode)) {
        vnode.fnScopeId = options._scopeId;
        vnode.fnContext = parent;
      }
      return vnode;
    };
  } else {
    this._c = (a, b, c, d) => createElement(contextVm, a, b, c, d, needNormalization);
  }
}

installRenderHelpers(FunctionalRenderContext.prototype);

/* => 创建函数式组件 */
export function createFunctionalComponent(
  Ctor: Class<Component>,
  propsData: ?Object,
  data: VNodeData,
  contextVm: Component,
  children: ?Array<VNode>,
): VNode | Array<VNode> | void {
  const options = Ctor.options;
  const props = {};
  const propOptions = options.props;
  if (isDef(propOptions)) {
    for (const key in propOptions) {
      props[key] = validateProp(key, propOptions, propsData || emptyObject);
    }
  } else {
    if (isDef(data.attrs)) mergeProps(props, data.attrs);
    if (isDef(data.props)) mergeProps(props, data.props);
  }

  const renderContext = new FunctionalRenderContext(data, props, children, contextVm, Ctor);

  const vnode = options.render.call(null, renderContext._c, renderContext);

  if (vnode instanceof VNode) {
    return cloneAndMarkFunctionalResult(vnode, data, renderContext.parent, options, renderContext);
  } else if (Array.isArray(vnode)) {
    const vnodes = normalizeChildren(vnode) || [];
    const res = new Array(vnodes.length);
    for (let i = 0; i < vnodes.length; i++) {
      res[i] = cloneAndMarkFunctionalResult(vnodes[i], data, renderContext.parent, options, renderContext);
    }
    return res;
  }
}

/* => 克隆并标记功能结果 */
function cloneAndMarkFunctionalResult(vnode, data, contextVm, options, renderContext) {
  // => 在设置 fnContext 之前克隆节点，否则如果该节点被重用(例如它来自一个缓存的普通插槽) fnContext 导致命名槽不应该配来配去。
  const clone = cloneVNode(vnode);
  clone.fnContext = contextVm;
  clone.fnOptions = options;
  if (process.env.NODE_ENV !== 'production') (clone.devtoolsMeta = clone.devtoolsMeta || {}).renderContext = renderContext;

  if (data.slot) (clone.data || (clone.data = {})).slot = data.slot;

  return clone;
}

/* => 合并 props */
function mergeProps(to, from) {
  for (const key in from) {
    to[camelize(key)] = from[key];
  }
}
