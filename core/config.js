import { no, noop, identity } from 'shared/util';
import { LIFECYCLE_HOOKS } from 'shared/constants';

export type Config = {
  // => 用户使用
  optionMergeStrategies: { [key: string]: Function },
  silent: boolean,
  productionTip: boolean,
  performance: boolean,
  devtools: boolean,
  errorHandler: ?(err: Error, vm: Component, info: string) => void,
  warnHandler: ?(msg: string, vm: Component, trace: string) => void,
  ignoredElements: Array<string | RegExp>,
  keyCodes: { [key: string]: number | Array<number> },

  // => 平台相关
  isReservedTag: (x?: string) => boolean,
  isReservedAttr: (x?: string) => boolean,
  parsePlatformTagName: (x: string) => string,
  isUnknownElement: (x?: string) => boolean,
  getTagNamespace: (x?: string) => string | void,
  mustUseProp: (tag: string, type: ?string, name: string) => boolean,

  // => 私有
  async: boolean,

  // => 遗留
  _lifecycleHooks: Array<string>,
};

export default ({
  // => 选项合并策略(在 core/util/options 中使用)
  optionMergeStrategies: Object.create(null),

  // => 是否压制警告
  silent: false,

  // => 启动显示生产模式提示信息? | 开发环境下默认启动
  productionTip: process.env.NODE_ENV !== 'production',

  // => 是否启用 devtools | 开发环境下默认启动
  devtools: process.env.NODE_ENV !== 'production',

  // => 是否记录性能
  performance: false,

  // => 监视程序错误的错误处理程序
  errorHandler: null,

  // => 警告处理程序的警告
  warnHandler: null,

  // => 忽略某些自定义元素
  ignoredElements: [],

  // => 为 v-on 自定义用户密钥别名
  keyCodes: Object.create(null),

  // => 检查是否是保留标记，以便不能将其注册为组件。这是平台相关的，可能会被覆盖
  isReservedTag: no,

  // => 检查是否保留了某个属性，使其不能用作组件支柱。这是平台相关的，可能会被覆盖
  isReservedAttr: no,

  // => 检查标签是否是未知元素。平台相关的
  isUnknownElement: no,

  // => 获取元素的名称空间
  getTagNamespace: noop,

  // => 解析特定平台的实际标记名
  parsePlatformTagName: identity,

  // => 检查属性是否必须使用属性绑定，例如：与平台相关的值
  mustUseProp: no,

  // => 异步执行更新。这将显著降低性能，如果设置为假
  async: true,

  // => 出于遗留原因而暴露
  _lifecycleHooks: LIFECYCLE_HOOKS,
}: Config);
