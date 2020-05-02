/* @flow */

import { parse } from './parser/index';
import { optimize } from './optimizer';
import { generate } from './codegen/index';
import { createCompilerCreator } from './create-compiler';

/* => createCompilerCreator 允许创建使用替代解析器/优化器/ codegen 的编译器。例如：SSR 优化编译器。这里我们只是使用默认部分导出一个默认编译器。 */
export const createCompiler = createCompilerCreator(function baseCompile(template: string, options: CompilerOptions): CompiledResult {
  /* => 将模板解析成 AST （解析器） */
  const ast = parse(template, options);

  /* => 标记静态节点（优化器） */
  if (options.optimize !== false) optimize(ast, options);

  /* => 将 AST 生成代码字符串（ render 函数：每次执行会使用当前最新的状态生成一份新的 VNode ）（代码生成器） */
  const { render, staticRenderFns } = generate(ast, options);

  /* => render 函数可以产生 VNode 的原因：本质上是执行了 createElement 方法，而该方法可以创建一个 VNode */
  return { ast, render, staticRenderFns };
});
