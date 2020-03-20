/* @flow */

import config from 'core/config';
import { warn, cached } from 'core/util/index';
import { mark, measure } from 'core/util/perf';

import Vue from './runtime/index';
import { query } from './util/index';
import { compileToFunctions } from './compiler/index';
import { shouldDecodeNewlines, shouldDecodeNewlinesForHref } from './util/compat';

/* => 获取用户传入的ID对应的DOM，并获取其里面的HTML内容 */
const idToTemplate = cached(id => {
  const el = query(id);
  return el && el.innerHTML;
});

/* => 缓存原生的$mount方法，之后扩展该方法 */
const mount = Vue.prototype.$mount;

/* => 例如：new Vue({}).$mount('#app'); */
/* 优先级：render ---> template ---> el.innerHTML */
Vue.prototype.$mount = function(el?: string | Element, hydrating?: boolean): Component {
  /* => 获取要挂载的元素 */
  el = el && query(el);

  /* istanbul ignore if => 可忽略 */
  if (el === document.body || el === document.documentElement) {
    process.env.NODE_ENV !== 'production' &&
      /* => 不要将Vue装载到<html>或<body>-而是装载到普通元素。 */
      warn(`Do not mount Vue to <html> or <body> - mount to normal elements instead.`);

    return this;
  }

  /* => 缓存配置项，this为调用了$mount方法的实例 */
  const options = this.$options;

  // resolve template/el and convert to render function => 解析模板/el并转换为render函数
  /* => 如果用户没有指定render函数（用户指定的render函数优先级高） */
  if (!options.render) {
    /* => 缓存用户传入的模板 */
    let template = options.template;

    /* => 如果模板存在，就拿到模板里面的内容 */
    if (template) {
      /* => 且如果模板的值类型是字符串，即用户传入的可能是 DOM 元素的id */
      if (typeof template === 'string') {
        /* => 判断第一个字符是否是# */
        if (template.charAt(0) === '#') {
          /* => 获取id DOM里面的HTML内容 */
          template = idToTemplate(template);

          /* istanbul ignore if => 可忽略 */
          if (process.env.NODE_ENV !== 'production' && !template) {
            /* => 模板元素未找到或为空元素 */
            warn(`Template element not found or is empty: ${options.template}`, this);
          }
        }

        /*  => 如果模板的节点类型存在，则说明他是DOM节点 */
      } else if (template.nodeType) {
        /*  => 拿到其里面的HTML内容 */
        template = template.innerHTML;
      } else {
        if (process.env.NODE_ENV !== 'production') {
          /* => 模板既不是元素节点也不是字符串。=> 模板选项无效 */
          warn('invalid template option:' + template, this);
        }

        return this;
      }
    } else if (el) {
      /* =>  如果模板不存在，且要挂载的元素存在，则获取el外部的HTML内容 */
      template = getOuterHTML(el);
    }

    /* => 最终如果模板存在 */
    if (template) {
      /* istanbul ignore if => 可忽略 */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile');
      }

      /* => 编译成函数，返回render函数 */
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

      /* => 最终Vue自动挂载render函数在配置项上 */
      options.render = render;
      options.staticRenderFns = staticRenderFns;

      /* istanbul ignore if => 可忽略 */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile end');

        /* => this._name 是当前组件（实例）的名字 */
        measure(`vue ${this._name} compile`, 'compile', 'compile end');
      }
    }
  }

  /* => 如果用户指定了render函数，则直接调用缓存的原生$mount方法，执行用户的render函数 */
  return mount.call(this, el, hydrating);
};

/** => 获取元素的outerHTML，同时处理IE中的SVG元素（兼容IE）。
 * Get outerHTML of elements, taking care
 * of SVG elements in IE as well.
 */
function getOuterHTML(el: Element): string {
  /* => 如果该属性存在，直接返回 */
  if (el.outerHTML) {
    return el.outerHTML;
  } else {
    /* => IE兼容处理 */
    /* => 1.创建一个空div标签 */
    const container = document.createElement('div');

    /* => 2.将当前元素深拷贝一份追加至创建的空div标签内 */
    container.appendChild(el.cloneNode(true));

    /* => 3.返回添加后的内容 */
    return container.innerHTML;
  }
}

Vue.compile = compileToFunctions;

export default Vue;
