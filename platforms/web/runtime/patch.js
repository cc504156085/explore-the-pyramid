/* @flow */

/* node operations DOM 操作  */
import * as nodeOps from 'web/runtime/node-ops';

import { createPatchFunction } from 'core/vdom/patch';
import baseModules from 'core/vdom/modules/index';
import platformModules from 'web/runtime/modules/index';

/* => 扩展，把通用的模块和浏览器特有的模块合并 */
// the directive module should be applied last, after all => 在应用了所有内置模块之后
// built-in modules have been applied. => 应最后应用指令模块
const modules = platformModules.concat(baseModules);

/* 工厂函数：创建浏览器特有的 patch 函数（主要解决跨平台问题） */
export const patch: Function = createPatchFunction({ nodeOps, modules });
