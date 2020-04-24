/* @flow */

import { parse } from './parser/index';
import { optimize } from './optimizer';
import { generate } from './codegen/index';
import { createCompilerCreator } from './create-compiler';

/* => createCompilerCreator 允许创建使用替代解析器/优化器/ codegen 的编译器。例如：SSR 优化编译器。这里我们只是使用默认部分导出一个默认编译器。 */
// `createCompilerCreator` allows creating compilers that use alternative
// parser/optimizer/codegen, e.g the SSR optimizing compiler.
// Here we just export a default compiler using the default parts.
export const createCompiler = createCompilerCreator(function baseCompile(template: string, options: CompilerOptions): CompiledResult {
  /* => 将模板解析成 AST （解析器） */
  const ast = parse(template, options);

  /* => 标记静态节点 （优化器） */
  if (options.optimize !== false) optimize(ast, options);

  /* => 生成代码字符串 （代码生成器） */
  const { render, staticRenderFns } = generate(ast, options);

  return { ast, render, staticRenderFns };
});
