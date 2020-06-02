import config from 'core/config';
import { warn, cached } from 'core/util/index';
import { mark, measure } from 'core/util/perf';

import Vue from './runtime/index';
import { query } from './util/index';
import { compileToFunctions } from './compiler/index';
import { shouldDecodeNewlines, shouldDecodeNewlinesForHref } from './util/compat';

/* => 获取用户传入的 ID 对应的 DOM ，并获取其里面的 HTML 内容 */
const idToTemplate = cached((id) => {
  const el = query(id);
  return el && el.innerHTML;
});

/* => 缓存原生的 $mount 方法，之后扩展该方法 */
const mount = Vue.prototype.$mount;

/* => 例如：new Vue({}).$mount('#app'); */
/* 优先级：render ---> template ---> el.innerHTML */
Vue.prototype.$mount = function (el?: string | Element, hydrating?: boolean): Component {
  /* => 获取要挂载的元素 */
  el = el && query(el);

  if (el === document.body || el === document.documentElement) {
    /* => 不要将 Vue 装载到 <html> 或 <body> -- 而是装载到普通元素。 */
    process.env.NODE_ENV !== 'production' && warn(`Do not mount Vue to <html> or <body> - mount to normal elements instead.`);

    return this;
  }

  /* => 缓存配置项，this 为调用了 $mount 方法的实例 */
  const options = this.$options;

  // resolve template/el and convert to render function => 解析模板/ el 并转换为 render 函数
  /* => 如果用户没有指定 render 函数（用户指定的 render 函数优先级高） */
  if (!options.render) {
    /* => 缓存用户传入的模板 */
    let template = options.template;

    /* => 如果模板存在，就拿到模板里面的内容 */
    if (template) {
      /* => 且如果模板的值类型是字符串，即用户传入的可能是 DOM 元素的 id */
      if (typeof template === 'string') {
        /* => 判断第一个字符是否是 # */
        if (template.charAt(0) === '#') {
          /* => 获取 id DOM 里面的 HTML 内容 */
          template = idToTemplate(template);

          /* => 模板元素未找到或为空元素 */
          if (process.env.NODE_ENV !== 'production' && !template) warn(`Template element not found or is empty: ${options.template}`, this);
        }
      } else if (template.nodeType) {
        /* => 如果模板的节点类型存在，则说明他是 DOM 节点。拿到其里面的 HTML 内容 */
        template = template.innerHTML;
      } else {
        /* => 模板既不是元素节点也不是字符串。=> 模板选项无效 */
        if (process.env.NODE_ENV !== 'production') warn(`invalid template option: ${template}`, this);

        return this;
      }
    } else if (el) {
      /* =>  如果模板不存在，且要挂载的元素存在，则获取 el 外部的 HTML 内容 */
      template = getOuterHTML(el);
    }

    /* => 最终如果模板存在 */
    if (template) {
      /* => 编译成函数，返回 render 函数 */
      const { render, staticRenderFns } = compileToFunctions(
        template,
        {
          outputSourceRange: process.env.NODE_ENV !== 'production',
          shouldDecodeNewlines,
          shouldDecodeNewlinesForHref,
          delimiters: options.delimiters,
          comments: options.comments,
        },
        this,
      );

      /* => 最终 Vue 将 render 函数挂载在配置项上 */
      options.render = render;
      options.staticRenderFns = staticRenderFns;
    }
  }

  /* => 显式伪多态 */
  /* => 如果用户指定了 render 函数，则直接调用缓存的原生 $mount 方法，执行用户的 render 函数 */
  return mount.call(this, el, hydrating);
};

/**
 * => 获取元素的 outerHTML ，同时处理 IE 中的 SVG 元素（兼容 IE ）。
 */
function getOuterHTML(el: Element): string {
  /* => 如果该属性存在，直接返回 */
  if (el.outerHTML) {
    return el.outerHTML;
  } else {
    /* => IE 兼容处理 */
    /* => 1. 创建一个空 div 标签 */
    const container = document.createElement('div');

    /* => 2. 将当前元素深拷贝一份追加至创建的空 div 标签内 */
    container.appendChild(el.cloneNode(true));

    /* => 3. 返回添加后的内容 */
    return container.innerHTML;
  }
}

/* => 全局 API -> Vue.compile */
Vue.compile = compileToFunctions;

export default Vue;
