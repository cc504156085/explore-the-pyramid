/*!
 * HTML Parser By John Resig (ejohn.org)
 * Modified by Juriy "kangax" Zaytsev
 * Original code by Erik Arvidsson (MPL-1.1 OR Apache-2.0 OR GPL-2.0-or-later)
 * http://erik.eae.net/simplehtmlparser/simplehtmlparser.js
 */

import { makeMap, no } from 'shared/util';
import { isNonPhrasingTag } from 'web/compiler/util';
import { unicodeRegExp } from 'core/util/lang';

// => 用于解析标记和属性的正则表达式
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/;
const dynamicArgAttribute = /^\s*((?:v-[\w-]+:|@|:|#)\[[^=]+\][^\s"'<>\/=]*)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/;
const ncname = `[a-zA-Z_][\\-\\.0-9_a-zA-Z${unicodeRegExp.source}]*`;
const qnameCapture = `((?:${ncname}\\:)?${ncname})`;
const startTagOpen = new RegExp(`^<${qnameCapture}`);
const startTagClose = /^\s*(\/?)>/;
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`);
const doctype = /^<!DOCTYPE [^>]+>/i;

// => 转义 — 避免在页面内联时作为 HTML 注释传递
const comment = /^<!\--/;
const conditionalComment = /^<!\[/;

// => 特殊元素(可以包含任何内容)
export const isPlainTextElement = makeMap('script,style,textarea', true);
const reCache = {};

const decodingMap = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&amp;': '&',
  '&#10;': '\n',
  '&#9;': '\t',
  '&#39;': "'",
};
const encodedAttr = /&(?:lt|gt|quot|amp|#39);/g;
const encodedAttrWithNewLines = /&(?:lt|gt|quot|amp|#39|#10|#9);/g;

const isIgnoreNewlineTag = makeMap('pre,textarea', true);
const shouldIgnoreFirstNewline = (tag, html) => tag && isIgnoreNewlineTag(tag) && html[0] === '\n';

function decodeAttr(value, shouldDecodeNewlines) {
  const re = shouldDecodeNewlines ? encodedAttrWithNewLines : encodedAttr;
  return value.replace(re, (match) => decodingMap[match]);
}

/**
 * HTML 解析器
 *
 * 算法实现：洋葱栈 / 洋葱模型
 *
 * 1.维护一个栈（构建 AST 层级关系，检测 HTML 标签是否正确闭合），一个指针
 * 2.指针从头开始
 * 3.遇到双标签的开始标签，将其压入栈中
 * 4.遇到双标签的结束标签，将压入栈中的开始标签弹出栈，与结束标签组合成双标签
 * 5.由此递归，子标签的父级就是上一个压入栈中的开始标签
 * 6.单标签（自闭合标签）特殊处理
 * 7.标签内的属性细节处理
 *
 * 例如：<div><p> hello world </p></div> （ ↓ 代表入栈， ↑ 代表出栈，在整个过程中触发相应的钩子函数）
 *
 * div ↓ - p ↓ - hello world - p ↑ - div ↑
 *
 * @param {*} html     => HTML 字符串（模板）
 * @param {*} options  => hooks：开始标签钩子 / 结束标签钩子 / 文本钩子 / 注释钩子
 */
export function parseHTML(html, options) {
  // => 洋葱栈
  const stack = [];

  const expectHTML = options.expectHTML;
  const isUnaryTag = options.isUnaryTag || no;
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no;

  // => 指针
  let index = 0;

  // => lastTag 表示父元素
  let last, lastTag;

  // => 直到 HTML 为空串为止
  while (html) {
    last = html;

    // => 确保我们不是在像 script / style / textarea 这样的纯文本内容元素中
    if (!lastTag || !isPlainTextElement(lastTag)) {
      // => 寻找第一个 < 的位置
      let textEnd = html.indexOf('<');

      // => 如果是 0 ，说明以 <xxx 开头
      if (textEnd === 0) {
        // Comment:
        if (comment.test(html)) {
          // => 注释结尾标签
          const commentEnd = html.indexOf('-->');

          if (commentEnd >= 0) {
            // => 只有 shouldKeepComment （是否保留注释节点）为真时，才触发 comment 注释钩子函数
            if (options.shouldKeepComment) options.comment(html.substring(4, commentEnd), index, index + commentEnd + 3);

            // => shouldKeepComment 为假时，只截取字符串，不触发钩子函数
            advance(commentEnd + 3);

            continue;
          }
        }

        // => 处理条件注释，不触发钩子函数，截取即可（在 Vue 的模板中，条件注释没有作用，写了也会被截取掉）
        if (conditionalComment.test(html)) {
          const conditionalEnd = html.indexOf(']>');
          if (conditionalEnd >= 0) {
            advance(conditionalEnd + 2);
            continue;
          }
        }

        // Doctype: 文档类型截取，不需要触发钩子函数
        const doctypeMatch = html.match(doctype);
        if (doctypeMatch) {
          advance(doctypeMatch[0].length);
          continue;
        }

        // End tag:
        const endTagMatch = html.match(endTag);
        if (endTagMatch) {
          const curIndex = index;
          advance(endTagMatch[0].length);

          // => 解析结束标签
          parseEndTag(endTagMatch[1], curIndex, index);

          continue;
        }

        // Start tag:
        const startTagMatch = parseStartTag();
        if (startTagMatch) {
          // => 处理开始标签
          handleStartTag(startTagMatch);

          // => 应该忽略第一行吗？
          if (shouldIgnoreFirstNewline(startTagMatch.tagName, html)) advance(1);

          // => 当前任务完成，开始下一轮循环，处理截取开始标签后剩下的 HTML 模板：></xxx>......
          continue;
        }
      }

      let text, rest, next;

      // => 如：{{xxx}}{{xxx}}</div> ，匹配到第一个 < 时，indexOf 返回值大于 0
      if (textEnd >= 0) {
        // => 截取 > 后续的文本
        rest = html.slice(textEnd);

        // => 如果文本中也存在 < ，如 {{xxx}}<{{xxx}}</div> ，循环判断，不是结束标签 / 开始标签 / 注释标签 / 条件注释标签
        while (!endTag.test(rest) && !startTagOpen.test(rest) && !comment.test(rest) && !conditionalComment.test(rest)) {
          // => "<" 在纯文本中，要宽容，把它当作文本来对待，截取到下一个 < 的位置
          next = rest.indexOf('<', 1);

          if (next < 0) break;

          // => 累加文本节点的长度
          textEnd += next;

          // => 截取全部文本长度后剩余的标签字符串
          rest = html.slice(textEnd);
        }

        // => 截取文本
        text = html.substring(0, textEnd);
      }

      // => 纯文本（标签后面的文本），如：<span></span>hello
      if (textEnd < 0) text = html;

      // => 截取文本并前进
      if (text) advance(text.length);

      // => 触发 chars 钩子函数
      if (options.chars && text) options.chars(text, index - text.length, index);
    } else {
      // => 处理纯文本内容元素（ script / style / textarea ）
      let endTagLength = 0;

      const stackedTag = lastTag.toLowerCase();
      const reStackedTag = reCache[stackedTag] || (reCache[stackedTag] = new RegExp('([\\s\\S]*?)(</' + stackedTag + '[^>]*>)', 'i'));

      const rest = html.replace(reStackedTag, function (all, text, endTag) {
        endTagLength = endTag.length;

        // => 不需要处理 noscript 标签
        if (!isPlainTextElement(stackedTag) && stackedTag !== 'noscript') {
          text = text.replace(/<!\--([\s\S]*?)-->/g, '$1').replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1');
        }

        if (shouldIgnoreFirstNewline(stackedTag, text)) text = text.slice(1);

        // => 内容全部当做纯文本处理，触发 chars 钩子函数
        if (options.chars) options.chars(text);

        // => 返回空串，说明内容全部截取完毕（包括文本内容 + 结束标签）
        return '';
      });

      index += html.length - rest.length;
      html = rest;

      // => 解析结束标签（ script / style / textarea ）
      parseEndTag(stackedTag, index - endTagLength, index);
    }

    if (html === last) {
      options.chars && options.chars(html);

      // => 模板结尾的标签格式错误
      if (process.env.NODE_ENV !== 'production' && !stack.length && options.warn) {
        options.warn(`Mal-formatted tag at end of template: "${html}"`, { start: index + html.length });
      }

      break;
    }
  }

  // => 清除所有剩余的标记
  parseEndTag();

  // => 推进
  function advance(n) {
    // => 索引递增
    index += n;

    // => 截取掉已解析的字符串
    html = html.substring(n);
  }

  // => 解析开始标签（开始标签名 / 属性 / 判别自闭合标签）
  function parseStartTag() {
    // => 开始标签的匹配
    const start = html.match(startTagOpen);

    // => 如果开始标签没有匹配到，就进不到 if 语句，函数执行结束，默认返回 undefined
    if (start) {
      const match = { tagName: start[1], attrs: [], start: index };
      advance(start[0].length);

      let end, attr;

      // => 循环解析标签里的 attr ，一次截取一个属性，而不是一次就能截取完成
      // => 如果剩余的 HTML 字符串不匹配开始标签结尾部分，且匹配动态参数属性或者普通属性，继续循环解析
      while (!(end = html.match(startTagClose)) && (attr = html.match(dynamicArgAttribute) || html.match(attribute))) {
        attr.start = index;
        advance(attr[0].length);
        attr.end = index;
        match.attrs.push(attr);
      }

      // => 有 end 说明解析到了开始标签的结束尖括号 >
      if (end) {
        // => 解析当前标签是否为自闭合标签
        // =>  <input /> 中的 / ，match.unarySlash = "/" 或者 <input> 是空字符串 ""
        match.unarySlash = end[1];

        advance(end[0].length);
        match.end = index;

        // => 返回开始标签的所有信息对象（标签名 / 属性集合 / 开始位置 / 结束位置 / 是否是自闭合标签）
        return match;
      }
    }
  }

  // => 处理开始标签
  function handleStartTag(match) {
    const tagName = match.tagName;
    const unarySlash = match.unarySlash;

    // => 保持与浏览器一致的行为
    if (expectHTML) {
      /**
       * 如果 p 标签内包含 Phrasing 标签，例如 div，将直接解析（补上）结束标签
       *
       * <p>111<div>222</div></p>
       *
       * 最终浏览器会解析成（ Vue 与浏览器保持一致）：
       *
       * <p>111</p>
       * <div>222</div>
       * <p></p>
       *
       * 过程：
       * <p>111<div>222</div></p> -> <p>111</p><div>222</div></p> -> <p>111</p><div>222</div><p></p>
       */
      if (lastTag === 'p' && isNonPhrasingTag(tagName)) parseEndTag(lastTag);

      // => 可单开标签，如 <p></p> 直接为 <p> ，处理和上述相同
      if (canBeLeftOpenTag(tagName) && lastTag === tagName) parseEndTag(tagName);
    }

    // => 判别自闭合标签
    const unary = isUnaryTag(tagName) || !!unarySlash;

    const l = match.attrs.length;
    const attrs = new Array(l);
    for (let i = 0; i < l; i++) {
      const args = match.attrs[i];

      // => 拿到正确的分组 value
      const value = args[3] || args[4] || args[5] || '';
      const shouldDecodeNewlines =
        tagName === 'a' && args[1] === 'href' ? options.shouldDecodeNewlinesForHref : options.shouldDecodeNewlines;

      // => key-value
      attrs[i] = { name: args[1], value: decodeAttr(value, shouldDecodeNewlines) };

      if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
        attrs[i].start = args.start + args[0].match(/^\s*/).length;
        attrs[i].end = args.end;
      }
    }

    // => 非自闭合标签压栈，自闭合标签不需要
    if (!unary) {
      stack.push({ tag: tagName, lowerCasedTag: tagName.toLowerCase(), attrs: attrs, start: match.start, end: match.end });

      // => 栈顶元素
      lastTag = tagName;
    }

    // => 触发 start 开始标签钩子函数
    if (options.start) options.start(tagName, attrs, unary, match.start, match.end);
  }

  function parseEndTag(tagName, start, end) {
    let pos, lowerCasedTagName;
    if (start == null) start = index;
    if (end == null) end = index;

    // => 找到最近打开的相同类型的标签
    if (tagName) {
      // => 标签名转小写
      lowerCasedTagName = tagName.toLowerCase();

      // => 如果第一次匹配不成功， pos 递减，此时在下方 i > pos，触发警告
      for (pos = stack.length - 1; pos >= 0; pos--) {
        // => 判断当前结束标签是否和栈顶标签相同（若不相同继续递减判断）
        if (stack[pos].lowerCasedTag === lowerCasedTagName) break;
      }
    } else {
      // => 如果没有传入参数，执行清空操作
      pos = 0;
    }

    // => 说明栈中还有元素
    if (pos >= 0) {
      // => 关闭所有开始标签的元素，向上堆栈
      for (let i = stack.length - 1; i >= pos; i--) {
        // => 第一次匹配不成功，pos 递减后， i 必定大于 pos ，说明没有结束标签
        if (process.env.NODE_ENV !== 'production' && (i > pos || !tagName) && options.warn) {
          // => 标签 tag 没有匹配的结束标签。
          options.warn(`tag <${stack[i].tag}> has no matching end tag.`, { start: stack[i].start, end: stack[i].end });
        }

        // => 触发 end 结束标签钩子函数
        if (options.end) options.end(stack[i].tag, start, end);
      }

      // => 从堆栈中删除开始标签（出栈）
      // => 等价于 stack.length-- ，但由于有特殊情况（抛出没有结束标签的警告，并且删除没有结束标签的标签），将其赋值为 pos（没有结束标签的标签的位置）
      stack.length = pos;

      // => 更新栈顶元素
      lastTag = pos && stack[pos - 1].tag;

      // => 保持与浏览器一致的行为，自动补上标签
    } else if (lowerCasedTagName === 'br') {
      if (options.start) options.start(tagName, [], true, start, end);
    } else if (lowerCasedTagName === 'p') {
      if (options.start) options.start(tagName, [], false, start, end);
      if (options.end) options.end(tagName, start, end);
    }
  }
}
