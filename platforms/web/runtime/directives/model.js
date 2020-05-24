import { isTextInputType } from 'web/util/element';
import { looseEqual, looseIndexOf } from 'shared/util';
import { mergeVNodeHook } from 'core/vdom/helpers/index';
import { warn, isIE9, isIE, isEdge } from 'core/util/index';

if (isIE9) {
  document.addEventListener('selectionchange', () => {
    const el = document.activeElement;
    if (el && el.vmodel) trigger(el, 'input');
  });
}

const directive = {
  inserted(el, binding, vnode, oldVnode) {
    if (vnode.tag === 'select') {
      if (oldVnode.elm && !oldVnode.elm._vOptions) {
        mergeVNodeHook(vnode, 'postpatch', () => directive.componentUpdated(el, binding, vnode));
      } else {
        setSelected(el, binding, vnode.context);
      }
      el._vOptions = [].map.call(el.options, getValue);
    } else if (vnode.tag === 'textarea' || isTextInputType(el.type)) {
      el._vModifiers = binding.modifiers;
      if (!binding.modifiers.lazy) {
        el.addEventListener('compositionstart', onCompositionStart);
        el.addEventListener('compositionend', onCompositionEnd);

        /**
         * Safari < 10.2 和 UIWebView 在确认构图选择之前切换焦点时不会触发 compositionend
         * 这也解决了一些浏览器(如 iOS Chrome )在自动完成时触发 change 而不是 input 的问题
         */
        el.addEventListener('change', onCompositionEnd);

        if (isIE9) el.vmodel = true;
      }
    }
  },

  componentUpdated(el, binding, vnode) {
    if (vnode.tag === 'select') {
      setSelected(el, binding, vnode.context);
      // => 如果由 v-for 渲染的选项发生了更改，则该值可能与渲染的选项不同步。检测这种情况并过滤掉 DOM 中不再具有匹配选项的值。
      const prevOptions = el._vOptions;
      const curOptions = (el._vOptions = [].map.call(el.options, getValue));

      if (curOptions.some((o, i) => !looseEqual(o, prevOptions[i]))) {
        // => 如果没有为至少一个值找到匹配的选项，则触发更改事件
        const needReset = el.multiple
          ? binding.value.some((v) => hasNoMatchingOption(v, curOptions))
          : binding.value !== binding.oldValue && hasNoMatchingOption(binding.value, curOptions);

        if (needReset) trigger(el, 'change');
      }
    }
  },
};

function setSelected(el, binding, vm) {
  actuallySetSelected(el, binding, vm);
  if (isIE || isEdge) setTimeout(() => actuallySetSelected(el, binding, vm), 0);
}

function actuallySetSelected(el, binding, vm) {
  const value = binding.value;
  const isMultiple = el.multiple;

  if (isMultiple && !Array.isArray(value)) {
    process.env.NODE_ENV !== 'production' &&
    // => 下拉框多选属性的 v-model 期望一个数组值作为它的绑定，但是得到了：value
    warn(`<select multiple v-model="${ binding.expression }"> expects an Array value for its binding, but got ${ typeof value }`, vm);
    return;
  }

  let selected, option;
  for (let i = 0, l = el.options.length; i < l; i++) {
    option = el.options[i];
    if (isMultiple) {
      selected = looseIndexOf(value, getValue(option)) > -1;
      if (option.selected !== selected) option.selected = selected;
    } else {
      if (looseEqual(getValue(option), value)) {
        if (el.selectedIndex !== i) el.selectedIndex = i;
        return;
      }
    }
  }

  if (!isMultiple) el.selectedIndex = -1;
}

function hasNoMatchingOption(value, options) {
  return options.every((o) => !looseEqual(o, value));
}

function getValue(option) {
  return '_value' in option ? option._value : option.value;
}

function onCompositionStart(e) {
  e.target.composing = true;
}

function onCompositionEnd(e) {
  // => 防止无理由触发输入事件
  if (!e.target.composing) return;

  e.target.composing = false;
  trigger(e.target, 'input');
}

function trigger(el, type) {
  const e = document.createEvent('HTMLEvents');
  e.initEvent(type, true, true);
  el.dispatchEvent(e);
}

export default directive;
