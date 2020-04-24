/* @flow */

import { noop, extend } from 'shared/util';
import { warn as baseWarn, tip } from 'core/util/debug';
import { generateCodeFrame } from './codeframe';

type CompiledFunctionResult = { render: Function, staticRenderFns: Array<Function> };

function createFunction(code, errors) {
  try {
    return new Function(code);
  } catch (err) {
    errors.push({ err, code });
    return noop;
  }
}

export function createCompileToFunctionFn(compile: Function): Function {
  const cache = Object.create(null);

  return function compileToFunctions(template: string, options?: CompilerOptions, vm?: Component): CompiledFunctionResult {
    options = extend({}, options);
    const warn = options.warn || baseWarn;
    delete options.warn;

    if (process.env.NODE_ENV !== 'production') {
      // detect possible CSP restriction => 检测可能的 CSP 限制
      try {
        new Function('return 1');
      } catch (e) {
        if (e.toString().match(/unsafe-eval|CSP/)) {
          /** => 看起来你是在一个内容安全策略禁止 unsafe-eval 的环境中使用独立构建的 Vue.js
           *  模板编译器无法在此环境中工作。考虑放宽政策，允许不安全的 eval 或预编译你的模板到渲染函数中。
           */
          warn(
            'It seems you are using the standalone build of Vue.js in an ' +
              'environment with Content Security Policy that prohibits unsafe-eval. ' +
              'The template compiler cannot work in this environment. Consider ' +
              'relaxing the policy to allow unsafe-eval or pre-compiling your ' +
              'templates into render functions.',
          );
        }
      }
    }

    // check cache => 检查缓存
    const key = options.delimiters ? String(options.delimiters) + template : template;
    if (cache[key]) return cache[key];

    // compile => 主编译任务函数
    const compiled = compile(template, options);

    // check compilation errors/tips => 检查编译错误/提示
    if (process.env.NODE_ENV !== 'production') {
      if (compiled.errors && compiled.errors.length) {
        if (options.outputSourceRange) {
          /* => 编译模板错误 */
          compiled.errors.forEach((e) => {
            warn(`Error compiling template: ${e.msg}` + generateCodeFrame(template, e.start, e.end), vm);
          });
        } else {
          warn(`Error compiling template: ${template}` + compiled.errors.map((e) => `- ${e}`).join('\n'), vm);
        }
      }
      if (compiled.tips && compiled.tips.length) {
        if (options.outputSourceRange) {
          compiled.tips.forEach((e) => tip(e.msg, vm));
        } else {
          compiled.tips.forEach((msg) => tip(msg, vm));
        }
      }
    }

    // turn code into functions => 将代码转换为函数
    const res = {};
    const fnGenErrors = [];
    res.render = createFunction(compiled.render, fnGenErrors);
    res.staticRenderFns = compiled.staticRenderFns.map((code) => createFunction(code, fnGenErrors));

    // check function generation errors.                                 => 检查函数生成错误
    // this should only happen if there is a bug in the compiler itself. => 只有在编译器本身存在错误时才会发生这种情况。
    // mostly for codegen development use                                => 主要用于 codegen 开发使用
    if (process.env.NODE_ENV !== 'production') {
      if ((!compiled.errors || !compiled.errors.length) && fnGenErrors.length) {
        /* => 生成渲染函数失败 */
        warn(`Failed to generate render function: ` + fnGenErrors.map(({ err, code }) => `${err.toString()} in ${code}`).join('\n'), vm);
      }
    }

    return (cache[key] = res);
  };
}
