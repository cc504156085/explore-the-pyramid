/* @flow */

/**
 * => 虚拟节点类：节点描述对象，描述了应该怎么样去创建真实的 DOM 节点
 * 可创建以下类型节点：
 * 1.注释节点（空节点）
 * 2.文本节点
 * 3.克隆节点
 * 4.元素节点
 * 5.组件节点
 * 6.函数式组件
 */
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

/* => 创建注释节点（空节点） <!-- text --> */
export const createEmptyVNode = (text: string = '') => {
  const node = new VNode();

  // => 没有强转为字符串
  node.text = text;

  // => 标识为注释节点
  node.isComment = true;

  return node;
};

/* => 创建文本节点 */
export function createTextVNode(val: string | number) {
  // => 强转为字符串
  return new VNode(undefined, undefined, undefined, String(val));
}

/**
 * => 优化的浅克隆。用于静态节点和插槽节点，因为它们可以在多个渲染中重用，克隆它们可以避免 DOM 操作依赖于 elm 引用时的错误。
 *
 * 1.由于组件内的某个状态发生改变，组件就会通过虚拟 DOM 重新渲染
 * 2.静态节点的内容不会改变，只有首次渲染时需要执行 render 函数获取 VNode
 * 3.后续的 DOM 更新，这些静态节点不需要执行 render 函数重新生成 VNode
 * 4.使用克隆节点的方式将 VNode 浅克隆一份，使用克隆节点（主要有静态节点、插槽节点）进行渲染
 */
export function cloneVNode(vnode: VNode): VNode {
  // => 将当前节点上的属性复制（浅克隆），创建新节点
  const cloned = new VNode(
    vnode.tag,
    vnode.data,

    // => 克隆子元素数组，以避免在克隆节点时发生对于原数组的意外情况。
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

  // => 标识为克隆节点（原始节点该属性为 false ）
  cloned.isCloned = true;

  return cloned;
}
