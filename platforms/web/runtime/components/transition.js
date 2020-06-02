// => 为单个元素/组件提供转换支持。支持转换模式( out-in / in-out )
import { warn } from 'core/util/index';
import { camelize, extend, isPrimitive } from 'shared/util';
import { mergeVNodeHook, isAsyncPlaceholder, getFirstComponentChild } from 'core/vdom/helpers/index';

export const transitionProps = {
  name: String,
  appear: Boolean,
  css: Boolean,
  mode: String,
  type: String,
  enterClass: String,
  leaveClass: String,
  enterToClass: String,
  leaveToClass: String,
  enterActiveClass: String,
  leaveActiveClass: String,
  appearClass: String,
  appearActiveClass: String,
  appearToClass: String,
  duration: [Number, String, Object],
};

// => 以防子组件也是一个抽象组件，例如：keep-alive，我们希望递归检索要渲染的实际组件
function getRealChild(vnode: ?VNode): ?VNode {
  const compOptions: ?VNodeComponentOptions = vnode && vnode.componentOptions;
  if (compOptions && compOptions.Ctor.options.abstract) {
    return getRealChild(getFirstComponentChild(compOptions.children));
  } else {
    return vnode;
  }
}

export function extractTransitionData(comp: Component): Object {
  const data = {};

  // => 将 props 复制到 data 中
  const options: ComponentOptions = comp.$options;
  for (const key in options.propsData) data[key] = comp[key];

  // => 提取侦听器并将它们直接传递给转换方法（驼峰化）后复制到 data 中
  const listeners: ?Object = options._parentListeners;
  for (const key in listeners) data[camelize(key)] = listeners[key];

  return data;
}

function placeholder(h: Function, rawChild: VNode): ?VNode {
  if (/\d-keep-alive$/.test(rawChild.tag)) return h('keep-alive', { props: rawChild.componentOptions.propsData });

}

function hasParentTransition(vnode: VNode): ?boolean {
  while ((vnode = vnode.parent)) if (vnode.data.transition) return true;
}

function isSameChild(child: VNode, oldChild: VNode): boolean {
  return oldChild.key === child.key && oldChild.tag === child.tag;
}

const isNotTextNode = (c: VNode) => c.tag || isAsyncPlaceholder(c);

const isVShowDirective = (d) => d.name === 'show';

export default {
  name: 'transition',
  props: transitionProps,
  abstract: true,

  render(h: Function) {
    // => 拿到子组件
    let children: any = this.$slots.default;
    if (!children) return;

    // => 过滤掉文本节点(可能的空白)
    children = children.filter(isNotTextNode);
    if (!children.length) return;

    // => <transition> 只能在单个元素上使用，将 <transition-group> 用于列表
    if (process.env.NODE_ENV !== 'production' && children.length > 1) {
      warn('<transition> can only be used on a single element. Use <transition-group> for lists.', this.$parent);
    }

    const mode: string = this.mode;

    // => 无效的 <transition> 模式:
    if (process.env.NODE_ENV !== 'production' && mode && mode !== 'in-out' && mode !== 'out-in') {
      warn(`invalid <transition> mode: ${ mode }`, this.$parent);
    }

    const rawChild: VNode = children[0];

    // => 如果这是一个组件根节点，并且该组件的父容器节点也具有转换，则跳过。
    if (hasParentTransition(this.$vnode)) return rawChild;

    // => 使用 getRealChild() 来忽略抽象组件，例如 keep-alive
    const child: ?VNode = getRealChild(rawChild);

    if (!child) return rawChild;

    if (this._leaving) return placeholder(h, rawChild);

    // => 确保键对于 vnode 类型和这个转换组件实例是唯一的。此键将用于在进入期间删除挂起的离开节点。
    const id: string = `__transition-${ this._uid }-`;
    child.key =
      child.key == null
        ? child.isComment
        ? id + 'comment'
        : id + child.tag
        : isPrimitive(child.key)
        ? String(child.key).indexOf(id) === 0
          ? child.key
          : id + child.key
        : child.key;

    // => 将当前组件上的数据合并到一个对象中
    const data: Object = ((child.data || (child.data = {})).transition = extractTransitionData(this));
    const oldRawChild: VNode = this._vnode;
    const oldChild: VNode = getRealChild(oldRawChild);

    // => 标记 v-show ，这样转换模块就可以把控制交给指令
    if (child.data.directives && child.data.directives.some(isVShowDirective)) child.data.show = true;

    if (
      oldChild &&
      oldChild.data &&
      !isSameChild(child, oldChild) &&
      !isAsyncPlaceholder(oldChild) &&
      // => 组件根是一个注释节点
      !(oldChild.componentInstance && oldChild.componentInstance._vnode.isComment)
    ) {
      // => 用新的重要的动态转换数据替换旧的子转换数据!
      const oldData: Object = (oldChild.data.transition = extend({}, data));

      // => 处理过渡模式
      if (mode === 'out-in') {
        // => 离开结束时返回占位符节点和队列更新
        this._leaving = true;
        mergeVNodeHook(oldData, 'afterLeave', () => {
          this._leaving = false;
          this.$forceUpdate();
        });

        return placeholder(h, rawChild);
      } else if (mode === 'in-out') {
        if (isAsyncPlaceholder(child)) return oldRawChild;

        let delayedLeave;
        const performLeave = () => delayedLeave();

        mergeVNodeHook(data, 'afterEnter', performLeave);
        mergeVNodeHook(data, 'enterCancelled', performLeave);
        mergeVNodeHook(oldData, 'delayLeave', (leave) => (delayedLeave = leave));
      }
    }

    return rawChild;
  },
};
