import { extend } from 'shared/util';
import { detectErrors } from './error-detector';
import { createCompileToFunctionFn } from './to-function';

/* => 编译器创建的创造者 */
export function createCompilerCreator(baseCompile: Function): Function {
  /* => 根据传递的 baseOptions （不同平台的不同实现）创建相应的编译器 */
  return function createCompiler(baseOptions: CompilerOptions) {
    function compile(template: string, options?: CompilerOptions): CompiledResult {
      const tips = [];
      const errors = [];
      const finalOptions = Object.create(baseOptions);

      let warn = (msg, range, tip) => (tip ? tips : errors).push(msg);
      if (options) {
        if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
          const leadingSpaceLength = template.match(/^\s*/)[0].length;

          warn = (msg, range, tip) => {
            const data: WarningMessage = { msg };
            if (range) {
              if (range.start != null) data.start = range.start + leadingSpaceLength;

              if (range.end != null) data.end = range.end + leadingSpaceLength;
            }
            (tip ? tips : errors).push(data);
          };
        }

        /* => 根据不同平台的实现，合并当前平台的 baseOptions ，将公共部分抽离 */

        // => 合并定制模块
        if (options.modules) finalOptions.modules = (baseOptions.modules || []).concat(options.modules);

        // => 合并定制指令
        if (options.directives) finalOptions.directives = extend(Object.create(baseOptions.directives || null), options.directives);

        // => 复制其他选项
        for (const key in options) {
          if (key !== 'modules' && key !== 'directives') finalOptions[key] = options[key];
        }
      }

      finalOptions.warn = warn;

      // => 基本编译函数
      const compiled = baseCompile(template.trim(), finalOptions);

      if (process.env.NODE_ENV !== 'production') detectErrors(compiled.ast, warn);

      compiled.tips = tips;
      compiled.errors = errors;

      return compiled;
    }

    return { compile, compileToFunctions: createCompileToFunctionFn(compile) };
  };
}
