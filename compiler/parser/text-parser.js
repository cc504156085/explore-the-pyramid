/* @flow */

import { cached } from 'shared/util';
import { parseFilters } from './filter-parser';

const defaultTagRE = /\{\{((?:.|\r?\n)+?)\}\}/g;
const regexEscapeRE = /[-.*+?^${}()|[\]\/\\]/g;

const buildRegex = cached((delimiters) => {
  const open = delimiters[0].replace(regexEscapeRE, '\\$&');
  const close = delimiters[1].replace(regexEscapeRE, '\\$&');
  return new RegExp(open + '((?:.|\\n)+?)' + close, 'g');
});

type TextParseResult = { expression: string, tokens: Array<string | { '@binding': string }> };

/* => 文本解析器 */
export function parseText(text: string, delimiters?: [string, string]): TextParseResult | void {
  const tagRE = delimiters ? buildRegex(delimiters) : defaultTagRE;

  // => 纯文本，返回 undefined
  if (!tagRE.test(text)) return;

  const tokens = [];
  const rawTokens = [];
  let lastIndex = (tagRE.lastIndex = 0);
  let match, index, tokenValue;
  while ((match = tagRE.exec(text))) {
    index = match.index;

    // => 存入文本标记，将 {{ 之前的文本存入 tokens 数组
    if (index > lastIndex) {
      rawTokens.push((tokenValue = text.slice(lastIndex, index)));
      tokens.push(JSON.stringify(tokenValue));
    }

    // => 标签标记
    const exp = parseFilters(match[1].trim());

    // => _s(exp) => toString(exp) 将表达式包装进 _s() 方法，且存入数组
    tokens.push(`_s(${exp})`);

    rawTokens.push({ '@binding': exp });

    // => 设置 lastIndex 保证下一轮循环时，正则表达式不再重复匹配已经解析过的文本
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    rawTokens.push((tokenValue = text.slice(lastIndex)));
    tokens.push(JSON.stringify(tokenValue));
  }

  // => 最终以 + 号连接："Hello {{ name }}" => '"Hello " + _s(name)'
  return { expression: tokens.join('+'), tokens: rawTokens };
}
