const validDivisionCharRE = /[\w).+\-_$\]]/;

/* => 过滤器解析器 */
export function parseFilters(exp: string): string {
  let inSingle = false;
  let inDouble = false;
  let inTemplateString = false;
  let inRegex = false;
  let curly = 0;
  let square = 0;
  let paren = 0;
  let lastFilterIndex = 0;
  let c, prev, i, expression, filters;

  // => 处理边界值
  for (i = 0; i < exp.length; i++) {
    prev = c;
    c = exp.charCodeAt(i);
    if (inSingle) {
      if (c === 0x27 && prev !== 0x5c) inSingle = false;
    } else if (inDouble) {
      if (c === 0x22 && prev !== 0x5c) inDouble = false;
    } else if (inTemplateString) {
      if (c === 0x60 && prev !== 0x5c) inTemplateString = false;
    } else if (inRegex) {
      if (c === 0x2f && prev !== 0x5c) inRegex = false;
    } else if (c === 0x7c /* pipe */ && exp.charCodeAt(i + 1) !== 0x7c && exp.charCodeAt(i - 1) !== 0x7c && !curly && !square && !paren) {
      if (expression === undefined) {
        // => 第一个过滤器，表达式结束
        lastFilterIndex = i + 1;
        expression = exp.slice(0, i).trim();
      } else {
        pushFilter();
      }
    } else {
      switch (c) {
        case 0x22:
          inDouble = true;
          break; // "
        case 0x27:
          inSingle = true;
          break; // '
        case 0x60:
          inTemplateString = true;
          break; // `
        case 0x28:
          paren++;
          break; // (
        case 0x29:
          paren--;
          break; // )
        case 0x5b:
          square++;
          break; // [
        case 0x5d:
          square--;
          break; // ]
        case 0x7b:
          curly++;
          break; // {
        case 0x7d:
          curly--;
          break; // }
      }

      if (c === 0x2f) {
        // /
        let j = i - 1;
        let p;

        // => 查找第一个非空白的 prev 字符
        for (; j >= 0; j--) {
          p = exp.charAt(j);
          if (p !== ' ') break;
        }

        if (!p || !validDivisionCharRE.test(p)) inRegex = true;
      }
    }
  }

  if (expression === undefined) {
    expression = exp.slice(0, i).trim();
  } else if (lastFilterIndex !== 0) {
    pushFilter();
  }

  // => 截取过滤器，以管道符 | 分界
  function pushFilter() {
    (filters || (filters = [])).push(exp.slice(lastFilterIndex, i).trim());
    lastFilterIndex = i + 1;
  }

  if (filters) {
    for (i = 0; i < filters.length; i++) {
      // => 循环过滤器列表并拼接成字符串
      expression = wrapFilter(expression, filters[i]);
    }
  }

  return expression;
}

/**
 *
 * @param {*} exp    => 表达式
 * @param {*} filter => 过滤器
 */
function wrapFilter(exp: string, filter: string): string {
  // => i > 0 说明过滤器携带参数 {{ name | format(arg) }}
  const i = filter.indexOf('(');

  if (i < 0) {
    // _f: resolveFilter => 过滤器执行函数，不带参数情况下，例如 _f("format")(name)
    return `_f("${filter}")(${exp})`;
  } else {
    // => 携带参数的情况，先截取圆左括号前面的过滤器名，后续的就是参数（额外去除圆右括号）
    const name = filter.slice(0, i);
    const args = filter.slice(i + 1);

    // => 例如 _f("format")(args  => args 包含 "arg)"，第一个参数 exp 永远是上一个管道链的执行结果
    return `_f("${name}")(${exp}${args !== ')' ? ',' + args : args}`;
  }
}
