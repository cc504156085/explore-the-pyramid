import { isIE, isIE9, isEdge } from 'core/util/env';

import { extend, isDef, isUndef } from 'shared/util';

import {
  isXlink,
  xlinkNS,
  getXlinkProp,
  isBooleanAttr,
  isEnumeratedAttr,
  isFalsyAttrValue,
  convertEnumeratedValue,
} from 'web/util/index';

function updateAttrs(oldVnode: VNodeWithData, vnode: VNodeWithData) {
  const opts = vnode.componentOptions;
  if (isDef(opts) && opts.Ctor.options.inheritAttrs === false) return;

  if (isUndef(oldVnode.data.attrs) && isUndef(vnode.data.attrs)) return;

  let key, cur, old;
  const elm = vnode.elm;
  const oldAttrs = oldVnode.data.attrs || {};
  let attrs: any = vnode.data.attrs || {};

  // => 克隆观察到的对象，因为用户可能想要对其进行突变
  if (isDef(attrs.__ob__)) attrs = vnode.data.attrs = extend({}, attrs);


  for (key in attrs) {
    cur = attrs[key];
    old = oldAttrs[key];
    if (old !== cur) setAttr(elm, key, cur);

  }
  // => 在 IE9 中，设置类型可以重置输入的值 [type = radio]
  // => IE / Edge 会在设置最大值之前将进度值降低到 1
  if ((isIE || isEdge) && attrs.value !== oldAttrs.value) setAttr(elm, 'value', attrs.value);

  for (key in oldAttrs) {
    if (isUndef(attrs[key])) {
      if (isXlink(key)) {
        elm.removeAttributeNS(xlinkNS, getXlinkProp(key));
      } else if (!isEnumeratedAttr(key)) {
        elm.removeAttribute(key);
      }
    }
  }
}

function setAttr(el: Element, key: string, value: any) {
  if (el.tagName.indexOf('-') > -1) {
    baseSetAttr(el, key, value);
  } else if (isBooleanAttr(key)) {
    // => 为空白值设置属性，例如 <option disabled>Select one</option>
    if (isFalsyAttrValue(value)) {
      el.removeAttribute(key);
    } else {
      // => 从技术上讲，allowfullscreen 是 <iframe> 的布尔属性，但是在 <embed> 标签上使用 Flash 时，其期望值为 true
      value = key === 'allowfullscreen' && el.tagName === 'EMBED' ? 'true' : key;
      el.setAttribute(key, value);
    }
  } else if (isEnumeratedAttr(key)) {
    el.setAttribute(key, convertEnumeratedValue(key, value));
  } else if (isXlink(key)) {
    if (isFalsyAttrValue(value)) {
      el.removeAttributeNS(xlinkNS, getXlinkProp(key));
    } else {
      el.setAttributeNS(xlinkNS, key, value);
    }
  } else {
    baseSetAttr(el, key, value);
  }
}

function baseSetAttr(el, key, value) {
  if (isFalsyAttrValue(value)) {
    el.removeAttribute(key);
  } else {
    // => 在 <textarea> 上设置占位符时，IE10 和 11 会触发输入事件，从而阻止第一个输入事件并立即删除阻止程序
    if (isIE && !isIE9 && el.tagName === 'TEXTAREA' && key === 'placeholder' && value !== '' && !el.__ieph) {
      const blocker = (e) => {
        e.stopImmediatePropagation();
        el.removeEventListener('input', blocker);
      };
      el.addEventListener('input', blocker);

      // => IE占位符修补
      el.__ieph = true;
    }
    el.setAttribute(key, value);
  }
}

export default { create: updateAttrs, update: updateAttrs };
