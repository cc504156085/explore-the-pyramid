/* @flow */

export default class VNode {
  tag: string | void;
  data: VNodeData | void;
  children: ?Array<VNode>;
  text: string | void;
  elm: Node | void;
  ns: string | void;
  context: Component | void; // => 在此组件范围内渲染
  key: string | number | void;
  componentOptions: VNodeComponentOptions | void;
  componentInstance: Component | void; // => 组件实例
  parent: VNode | void; // => 组件占位符节点

  // => 严格内部
  raw: boolean; // => 包含原始 HTML ？（仅服务器）
  isStatic: boolean; // => 吊装静态节点
  isRootInsert: boolean; // => 进入过渡检查所必需的
  isComment: boolean; // => 空注释占位符？
  isCloned: boolean; // => 是克隆节点吗？
  isOnce: boolean; // => 是 v-once 节点吗？
  asyncFactory: Function | void; // => 异步组件工厂函数
  asyncMeta: Object | void;
  isAsyncPlaceholder: boolean;
  ssrContext: Object | void;
  fnContext: Component | void; // => 功能节点的真实上下文 vm
  fnOptions: ?ComponentOptions; // => 用于 SSR 缓存
  devtoolsMeta: ?Object; // => 用于存储 devtools 的函数 render 上下文
  fnScopeId: ?string; // => 功能范围 id 支持

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

  // => 已弃用：用于向后兼容的组件安装的别名。
  get child(): Component | void {
    return this.componentInstance;
  }
}

/* => 创建注释节点（空节点） */
export const createEmptyVNode = (text: string = '') => {
  const node = new VNode();
  node.text = text;
  node.isComment = true;
  return node;
};

/* => 创建文本节点 */
export function createTextVNode(val: string | number) {
  return new VNode(undefined, undefined, undefined, String(val));
}

/* => 优化的浅克隆。用于静态节点和插槽节点，因为它们可以在多个渲染中重用，克隆它们可以避免 DOM 操作依赖于 elm 引用时的错误。 */
export function cloneVNode(vnode: VNode): VNode {
  // => 将当前节点上的属性复制，创建新节点
  const cloned = new VNode(
    vnode.tag,
    vnode.data,

    // => 克隆子数组以避免在克隆子数组时对原始数组进行变异。
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

  // => 标识为克隆节点
  cloned.isCloned = true;
  return cloned;
}
