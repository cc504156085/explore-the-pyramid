// => 为列表项提供过渡支持
// => 使用 FLIP 技术支持移动过渡
// => 由于 vdom 的子代更新算法是“不稳定的”-即它不能保证所删除元素的相对位置，
// => 因此我们强制 Transition-group 将其子代更新为两遍：
// => 在第一遍中，我们删除了所有需要更新的节点被移走，触发其离开过渡；
// => 在第二遍中，我们插入/移动到最终所需的状态。 这样，在第二遍中，已删除的节点将保留在应有的位置。

import { warn, extend } from 'core/util/index';
import { addClass, removeClass } from '../class-util';
import { transitionProps, extractTransitionData } from './transition';
import { setActiveInstance } from 'core/instance/lifecycle';

import {
  hasTransition,
  getTransitionInfo,
  transitionEndEvent,
  addTransitionClass,
  removeTransitionClass,
} from '../transition-util';

// => 合并组件的 props
const props = extend({ tag: String, moveClass: String }, transitionProps);

// => 删除过渡模式
delete props.mode;

export default {
  props,

  beforeMount() {
    const update = this._update;
    this._update = (vnode, hydrating) => {
      const restoreActiveInstance = setActiveInstance(this);
      // => 强制去除通行证
      // removeOnly（重要，避免不必要的动作）
      this.__patch__(this._vnode, this.kept, false, true);
      this._vnode = this.kept;
      restoreActiveInstance();
      update.call(this, vnode, hydrating);
    };
  },

  render(h: Function) {
    const tag: string = this.tag || this.$vnode.data.tag || 'span';
    const map: Object = Object.create(null);
    const prevChildren: Array<VNode> = (this.prevChildren = this.children);
    const rawChildren: Array<VNode> = this.$slots.default || [];
    const children: Array<VNode> = (this.children = []);
    const transitionData: Object = extractTransitionData(this);

    for (let i = 0; i < rawChildren.length; i++) {
      const c: VNode = rawChildren[i];
      if (c.tag) {
        if (c.key != null && String(c.key).indexOf('__vlist') !== 0) {
          children.push(c);
          map[c.key] = c;
          (c.data || (c.data = {})).transition = transitionData;
        } else if (process.env.NODE_ENV !== 'production') {
          const opts: ?VNodeComponentOptions = c.componentOptions;
          const name: string = opts ? opts.Ctor.options.name || opts.tag || '' : c.tag;

          // => 必须为 <transition-group> 子项设置键：name
          warn(`<transition-group> children must be keyed: <${ name }>`);
        }
      }
    }

    if (prevChildren) {
      const kept: Array<VNode> = [];
      const removed: Array<VNode> = [];
      for (let i = 0; i < prevChildren.length; i++) {
        const c: VNode = prevChildren[i];
        c.data.transition = transitionData;
        c.data.pos = c.elm.getBoundingClientRect();
        if (map[c.key]) {
          kept.push(c);
        } else {
          removed.push(c);
        }
      }
      this.kept = h(tag, null, kept);
      this.removed = removed;
    }

    return h(tag, null, children);
  },

  updated() {
    const children: Array<VNode> = this.prevChildren;
    const moveClass: string = this.moveClass || (this.name || 'v') + '-move';
    if (!children.length || !this.hasMove(children[0].elm, moveClass)) return;


    // => 我们将工作分为三个循环，以避免在每次迭代中混合 DOM 读取和写入 - 这有助于防止布局混乱
    children.forEach(callPendingCbs);
    children.forEach(recordPosition);
    children.forEach(applyTranslation);

    // => 强制回流以将所有内容放置在此位置，以避免在 tree-shaking 中被移除
    this._reflow = document.body.offsetHeight;

    children.forEach((c: VNode) => {
      if (c.data.moved) {
        const el: any = c.elm;
        const s: any = el.style;
        addTransitionClass(el, moveClass);
        s.transform = s.WebkitTransform = s.transitionDuration = '';
        el.addEventListener(
          transitionEndEvent,
          (el._moveCb = function cb(e) {
            if (e && e.target !== el) return;

            if (!e || /transform$/.test(e.propertyName)) {
              el.removeEventListener(transitionEndEvent, cb);
              el._moveCb = null;
              removeTransitionClass(el, moveClass);
            }
          }),
        );
      }
    });
  },

  methods: {
    hasMove(el: any, moveClass: string): boolean {
      if (!hasTransition) return false;

      if (this._hasMove) return this._hasMove;

      // => 检测应用了 move 类的元素是否具有 CSS 过渡
      // => 由于此刻元素可能在进入的过渡中，因此我们对其进行克隆并删除所有其他已应用的过渡类，以确保仅应用 move 类
      const clone: HTMLElement = el.cloneNode();
      if (el._transitionClasses) el._transitionClasses.forEach((cls: string) => removeClass(clone, cls));

      addClass(clone, moveClass);

      clone.style.display = 'none';
      this.$el.appendChild(clone);
      const info: Object = getTransitionInfo(clone);
      this.$el.removeChild(clone);

      return (this._hasMove = info.hasTransform);
    },
  },
};

function callPendingCbs(c: VNode) {
  if (c.elm._moveCb) c.elm._moveCb();
  if (c.elm._enterCb) c.elm._enterCb();
}

function recordPosition(c: VNode) {
  c.data.newPos = c.elm.getBoundingClientRect();
}

function applyTranslation(c: VNode) {
  const oldPos = c.data.pos;
  const newPos = c.data.newPos;
  const dx = oldPos.left - newPos.left;
  const dy = oldPos.top - newPos.top;
  if (dx || dy) {
    c.data.moved = true;
    const s = c.elm.style;
    s.transform = s.WebkitTransform = `translate(${ dx }px,${ dy }px)`;
    s.transitionDuration = '0s';
  }
}
