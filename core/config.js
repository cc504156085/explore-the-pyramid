/* @flow */

import { no, noop, identity } from 'shared/util';
import { LIFECYCLE_HOOKS } from 'shared/constants';

export type Config = {
  // user => 用户使用
  optionMergeStrategies: { [key: string]: Function },
  silent: boolean,
  productionTip: boolean,
  performance: boolean,
  devtools: boolean,
  errorHandler: ?(err: Error, vm: Component, info: string) => void,
  warnHandler: ?(msg: string, vm: Component, trace: string) => void,
  ignoredElements: Array<string | RegExp>,
  keyCodes: { [key: string]: number | Array<number> },

  // platform => 平台相关
  isReservedTag: (x?: string) => boolean,
  isReservedAttr: (x?: string) => boolean,
  parsePlatformTagName: (x: string) => string,
  isUnknownElement: (x?: string) => boolean,
  getTagNamespace: (x?: string) => string | void,
  mustUseProp: (tag: string, type: ?string, name: string) => boolean,

  // private => 私有
  async: boolean,

  // legacy => 遗留
  _lifecycleHooks: Array<string>,
};

export default ({
  /** => 选项合并策略(在core/util/options中使用)
   * Option merge strategies (used in core/util/options)
   */
  optionMergeStrategies: Object.create(null),

  /** => 是否压制警告。
   * Whether to suppress warnings.
   */
  silent: false,

  /** => 启动显示生产模式提示信息? | 开发环境下默认启动
   * Show production mode tip message on boot?
   */
  productionTip: process.env.NODE_ENV !== 'production',

  /** => 是否启用devtools | 开发环境下默认启动
   * Whether to enable devtools
   */
  devtools: process.env.NODE_ENV !== 'production',

  /** => 是否记录性能
   * Whether to record perf
   */
  performance: false,

  /** => 监视程序错误的错误处理程序
   * Error handler for watcher errors
   */
  errorHandler: null,

  /** => 警告处理程序的警告
   * Warn handler for watcher warns
   */
  warnHandler: null,

  /** => 忽略某些自定义元素
   * Ignore certain custom elements
   */
  ignoredElements: [],

  /** => 为 v-on 自定义用户密钥别名
   * Custom user key aliases for v-on
   */
  keyCodes: Object.create(null),

  /** => 检查是否是保留标记，以便不能将其注册为组件。这是平台相关的，可能会被覆盖。
   * Check if a tag is reserved so that it cannot be registered as a
   * component. This is platform-dependent and may be overwritten.
   */
  isReservedTag: no,

  /** => 检查是否保留了某个属性，使其不能用作组件支柱。这是平台相关的，可能会被覆盖。
   * Check if an attribute is reserved so that it cannot be used as a component
   * prop. This is platform-dependent and may be overwritten.
   */
  isReservedAttr: no,

  /** => 检查标签是否是未知元素。平台相关的。
   * Check if a tag is an unknown element.
   * Platform-dependent.
   */
  isUnknownElement: no,

  /** => 获取元素的名称空间
   * Get the namespace of an element
   */
  getTagNamespace: noop,

  /** => 解析特定平台的实际标记名。
   * Parse the real tag name for the specific platform.
   */
  parsePlatformTagName: identity,

  /** => 检查属性是否必须使用属性绑定，例如：与平台相关的值。
   * Check if an attribute must be bound using property, e.g. value
   * Platform-dependent.
   */
  mustUseProp: no,

  /** => 异步执行更新。这将显著降低性能，如果设置为假。
   * Perform updates asynchronously. Intended to be used by Vue Test Utils
   * This will significantly reduce performance if set to false.
   */
  async: true,

  /** => 出于遗留原因而暴露
   * Exposed for legacy reasons
   */
  _lifecycleHooks: LIFECYCLE_HOOKS,
}: Config);
