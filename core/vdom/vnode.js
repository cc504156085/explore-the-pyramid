/* @flow */

export default class VNode {
  tag: string | void;
  data: VNodeData | void;
  children: ?Array<VNode>;
  text: string | void;
  elm: Node | void;
  ns: string | void;
  context: Component | void; // rendered in this component's scope => 在此组件范围内渲染
  key: string | number | void;
  componentOptions: VNodeComponentOptions | void;
  componentInstance: Component | void; // component instance => 组件实例
  parent: VNode | void; // component placeholder node => 组件占位符节点

  // strictly internal => 严格内部
  raw: boolean; // contains raw HTML? (server only) => 包含原始HTML？（仅服务器）
  isStatic: boolean; // hoisted static node => 吊装静态节点
  isRootInsert: boolean; // necessary for enter transition check => 进入过渡检查所必需的
  isComment: boolean; // empty comment placeholder? => 空注释占位符？
  isCloned: boolean; // is a cloned node? => 是克隆节点吗？
  isOnce: boolean; // is a v-once node? => 是v-once节点吗？
  asyncFactory: Function | void; // async component factory function => 异步组件工厂函数
  asyncMeta: Object | void;
  isAsyncPlaceholder: boolean;
  ssrContext: Object | void;
  fnContext: Component | void; // real context vm for functional nodes => 功能节点的真实上下文vm
  fnOptions: ?ComponentOptions; // for SSR caching => 用于SSR缓存
  devtoolsMeta: ?Object; // used to store functional render context for devtools => 用于存储devtools的函数render上下文
  fnScopeId: ?string; // functional scope id support => 功能范围id支持

  constructor(
    tag?: string,
    data?: VNodeData,
    children?: ?Array<VNode>,
    text?: string,
    elm?: Node,
    context?: Component,
    componentOptions?: VNodeComponentOptions,
    asyncFactory?: Function,
  ) {
    this.tag = tag;
    this.data = data;
    this.children = children;
    this.text = text;
    this.elm = elm;
    this.ns = undefined;
    this.context = context;
    this.fnContext = undefined;
    this.fnOptions = undefined;
    this.fnScopeId = undefined;
    this.key = data && data.key;
    this.componentOptions = componentOptions;
    this.componentInstance = undefined;
    this.parent = undefined;
    this.raw = false;
    this.isStatic = false;
    this.isRootInsert = true;
    this.isComment = false;
    this.isCloned = false;
    this.isOnce = false;
    this.asyncFactory = asyncFactory;
    this.asyncMeta = undefined;
    this.isAsyncPlaceholder = false;
  }

  // DEPRECATED: alias for componentInstance for backwards compat. => 已弃用：用于向后兼容的组件安装的别名。
  /* istanbul ignore next => 可忽略 */
  get child(): Component | void {
    return this.componentInstance;
  }
}

export const createEmptyVNode = (text: string = '') => {
  const node = new VNode();
  node.text = text;
  node.isComment = true;
  return node;
};

export function createTextVNode(val: string | number) {
  return new VNode(undefined, undefined, undefined, String(val));
}

/* => 优化的浅克隆。用于静态节点和插槽节点，因为它们可以在多个渲染中重用，克隆它们可以避免 DOM 操作依赖于 elm 引用时的错误。 */
// optimized shallow clone
// used for static nodes and slot nodes because they may be reused across
// multiple renders, cloning them avoids errors when DOM manipulations rely
// on their elm reference.
export function cloneVNode(vnode: VNode): VNode {
  const cloned = new VNode(
    vnode.tag,
    vnode.data,

    // #7975 => 克隆子数组以避免在克隆子数组时对原始数组进行变异。
    // clone children array to avoid mutating original in case of cloning
    // a child.
    vnode.children && vnode.children.slice(),
    vnode.text,
    vnode.elm,
    vnode.context,
    vnode.componentOptions,
    vnode.asyncFactory,
  );
  cloned.ns = vnode.ns;
  cloned.isStatic = vnode.isStatic;
  cloned.key = vnode.key;
  cloned.isComment = vnode.isComment;
  cloned.fnContext = vnode.fnContext;
  cloned.fnOptions = vnode.fnOptions;
  cloned.fnScopeId = vnode.fnScopeId;
  cloned.asyncMeta = vnode.asyncMeta;
  cloned.isCloned = true;
  return cloned;
}
