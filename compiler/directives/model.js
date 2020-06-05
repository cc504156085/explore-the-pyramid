/* => 组件 v-model 的跨平台代码生成 */
export function genComponentModel(el: ASTElement, value: string, modifiers: ?ASTModifiers): ?boolean {
  const { number, trim } = modifiers || {};

  const baseValueExpression = '$$v';
  let valueExpression = baseValueExpression;
  if (trim) valueExpression = `(typeof ${baseValueExpression} == 'string'` + `?${baseValueExpression}.trim()` + `:${baseValueExpression})`;

  if (number) valueExpression = `_n(${valueExpression})`;

  const assignment = genAssignmentCode(value, valueExpression);

  el.model = { value: `(${value})`, expression: JSON.stringify(value), callback: `function (${baseValueExpression}) {${assignment}}` };
}

/* => 用于生成 v-model 值分配代码的跨平台 codegen 助手 */
export function genAssignmentCode(value: string, assignment: string): string {
  const res = parseModel(value);

  // => v-model 进入 if
  if (res.key === null) {
    return `${value}=${assignment}`;
  } else {
    return `$set(${res.exp}, ${res.key}, ${assignment})`;
  }
}

/**
 * 将一个 v-model 表达式解析为基本路径和最后的键段。处理点路径和可能的方括号
 *
 * 可能的情况下:
 *
 * - test
 * - test[key]
 * - test[test1[key]]
 * - test["a"][key]
 * - xxx.test[a[a].test1[key]]
 * - test.xxx.a["asa"][test1[key]]
 *
 */

let len, str, chr, index, expressionPos, expressionEndPos;

type ModelParseResult = { exp: string, key: string | null };

export function parseModel(val: string): ModelParseResult {
  // => 允许 v-model="obj.val " (后面的空白)
  val = val.trim();
  len = val.length;

  if (val.indexOf('[') < 0 || val.lastIndexOf(']') < len - 1) {
    index = val.lastIndexOf('.');
    if (index > -1) {
      return { exp: val.slice(0, index), key: '"' + val.slice(index + 1) + '"' };
    } else {
      return { exp: val, key: null };
    }
  }

  str = val;
  index = expressionPos = expressionEndPos = 0;

  while (!eof()) {
    chr = next();
    if (isStringStart(chr)) {
      parseString(chr);
    } else if (chr === 0x5b) {
      parseBracket(chr);
    }
  }

  return { exp: val.slice(0, expressionPos), key: val.slice(expressionPos + 1, expressionEndPos) };
}

function next(): number {
  return str.charCodeAt(++index);
}

function eof(): boolean {
  return index >= len;
}

function isStringStart(chr: number): boolean {
  return chr === 0x22 || chr === 0x27;
}

function parseBracket(chr: number): void {
  let inBracket = 1;
  expressionPos = index;
  while (!eof()) {
    chr = next();
    if (isStringStart(chr)) {
      parseString(chr);
      continue;
    }

    if (chr === 0x5b) inBracket++;
    if (chr === 0x5d) inBracket--;

    if (inBracket === 0) {
      expressionEndPos = index;
      break;
    }
  }
}

function parseString(chr: number): void {
  const stringQuote = chr;
  while (!eof()) {
    chr = next();
    if (chr === stringQuote) break;
  }
}
