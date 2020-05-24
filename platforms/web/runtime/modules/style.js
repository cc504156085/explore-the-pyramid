import { getStyle, normalizeStyleBinding } from 'web/util/style';
import { cached, camelize, extend, isDef, isUndef, hyphenate } from 'shared/util';

const cssVarRE = /^--/;
const importantRE = /\s*!important$/;
const setProp = (el, name, val) => {
  if (cssVarRE.test(name)) {
    el.style.setProperty(name, val);
  } else if (importantRE.test(val)) {
    el.style.setProperty(hyphenate(name), val.replace(importantRE, ''), 'important');
  } else {
    const normalizedName = normalize(name);
    if (Array.isArray(val)) {
      // => 由自动前缀创建的支持值数组
      // => 例如 {display：[“ -webkit-box”，“ -ms-flexbox”，“ flex”]} 逐一设置它们，浏览器将只设置它可以识别的那些
      for (let i = 0, len = val.length; i < len; i++) el.style[normalizedName] = val[i];
    } else {
      el.style[normalizedName] = val;
    }
  }
};

const vendorNames = ['Webkit', 'Moz', 'ms'];

let emptyStyle;
const normalize = cached(function(prop) {
  emptyStyle = emptyStyle || document.createElement('div').style;
  prop = camelize(prop);
  if (prop !== 'filter' && prop in emptyStyle) return prop;

  const capName = prop.charAt(0).toUpperCase() + prop.slice(1);
  for (let i = 0; i < vendorNames.length; i++) {
    const name = vendorNames[i] + capName;
    if (name in emptyStyle) return name;
  }
});

function updateStyle(oldVnode: VNodeWithData, vnode: VNodeWithData) {
  const data = vnode.data;
  const oldData = oldVnode.data;

  if (isUndef(data.staticStyle) && isUndef(data.style) && isUndef(oldData.staticStyle) && isUndef(oldData.style)) {
    return;
  }

  let cur, name;
  const el: any = vnode.elm;
  const oldStaticStyle: any = oldData.staticStyle;
  const oldStyleBinding: any = oldData.normalizedStyle || oldData.style || {};

  // => 如果存在静态样式，则在进行 normalizeStyleData 时样式绑定已合并到其中
  const oldStyle = oldStaticStyle || oldStyleBinding;

  const style = normalizeStyleBinding(vnode.data.style) || {};

  // => 将归一化样式存储在另一个差异下，以便下次比较时，请确保克隆它是反应式的，因为用户可能希望对其进行突变。
  vnode.data.normalizedStyle = isDef(style.__ob__) ? extend({}, style) : style;

  const newStyle = getStyle(vnode, true);

  for (name in oldStyle) if (isUndef(newStyle[name])) setProp(el, name, '');

  for (name in newStyle) {
    cur = newStyle[name];
    // => ie9 设置为 null 无效，必须使用空字符串
    if (cur !== oldStyle[name]) setProp(el, name, cur == null ? '' : cur);
  }
}

export default { create: updateStyle, update: updateStyle };
