import config from '../config';
import { warn } from './debug';
import { set } from '../observer/index';
import { unicodeRegExp } from './lang';
import { nativeWatch, hasSymbol } from './env';

import { ASSET_TYPES, LIFECYCLE_HOOKS } from 'shared/constants';

import { extend, hasOwn, camelize, toRawType, capitalize, isBuiltInTag, isPlainObject } from 'shared/util';

// => 选项覆盖策略是处理如何将父选项值和子选项值合并到最终值的函数
const strats = config.optionMergeStrategies;

// => 选择与限制
if (process.env.NODE_ENV !== 'production') {
  strats.el = strats.propsData = function (parent, child, vm, key) {
    if (!vm) warn(`option "${key}" can only be used during instance ` + 'creation with the `new` keyword.');

    return defaultStrat(parent, child);
  };
}

// => 递归地合并两个数据对象的助手
function mergeData(to: Object, from: ?Object): Object {
  if (!from) return to;
  let key, toVal, fromVal;

  const keys = hasSymbol ? Reflect.ownKeys(from) : Object.keys(from);

  for (let i = 0; i < keys.length; i++) {
    key = keys[i];

    // => 如果 data 已经被观察到…
    if (key === '__ob__') continue;
    toVal = to[key];
    fromVal = from[key];
    if (!hasOwn(to, key)) {
      set(to, key, fromVal);
    } else if (toVal !== fromVal && isPlainObject(toVal) && isPlainObject(fromVal)) {
      mergeData(toVal, fromVal);
    }
  }

  return to;
}

export function mergeDataOrFn(parentVal: any, childVal: any, vm?: Component): ?Function {
  if (!vm) {
    // => Vue.extend 合并，两者都应该是函数
    if (!childVal) return parentVal;

    if (!parentVal) return childVal;

    // => 当 parentVal 和 childVal 都存在时，我们需要返回一个函数，该函数返回两个函数的合并结果，
    // => 这里不需要检查 parentVal 是否是一个函数，因为它必须是一个传递先前合并的函数。
    return function mergedDataFn() {
      return mergeData(
        typeof childVal === 'function' ? childVal.call(this, this) : childVal,
        typeof parentVal === 'function' ? parentVal.call(this, this) : parentVal,
      );
    };
  } else {
    return function mergedInstanceDataFn() {
      // => 合并实例
      const instanceData = typeof childVal === 'function' ? childVal.call(vm, vm) : childVal;
      const defaultData = typeof parentVal === 'function' ? parentVal.call(vm, vm) : parentVal;
      if (instanceData) {
        return mergeData(instanceData, defaultData);
      } else {
        return defaultData;
      }
    };
  }
}

strats.data = function (parentVal: any, childVal: any, vm?: Component): ?Function {
  if (!vm) {
    if (childVal && typeof childVal !== 'function') {
      process.env.NODE_ENV !== 'production' &&
        warn('The "data" option should be a function ' + 'that returns a per-instance value in component ' + 'definitions.', vm);

      return parentVal;
    }
    return mergeDataOrFn(parentVal, childVal);
  }

  return mergeDataOrFn(parentVal, childVal, vm);
};

// => 钩子和道具合并为数组
function mergeHook(parentVal: ?Array<Function>, childVal: ?Function | ?Array<Function>): ?Array<Function> {
  const res = childVal ? (parentVal ? parentVal.concat(childVal) : Array.isArray(childVal) ? childVal : [childVal]) : parentVal;
  return res ? dedupeHooks(res) : res;
}

function dedupeHooks(hooks) {
  const res = [];
  for (let i = 0; i < hooks.length; i++) if (res.indexOf(hooks[i]) === -1) res.push(hooks[i]);

  return res;
}

LIFECYCLE_HOOKS.forEach((hook) => (strats[hook] = mergeHook));

// => 当存在 vm (实例创建)时，我们需要在构造函数选项、实例选项和父选项之间进行三种方式的合并
function mergeAssets(parentVal: ?Object, childVal: ?Object, vm?: Component, key: string): Object {
  const res = Object.create(parentVal || null);
  if (childVal) {
    process.env.NODE_ENV !== 'production' && assertObjectType(key, childVal, vm);
    return extend(res, childVal);
  } else {
    return res;
  }
}

ASSET_TYPES.forEach(function (type) {
  strats[type + 's'] = mergeAssets;
});

// => 观察者散列不应该相互覆盖，因此我们将它们合并为数组
strats.watch = function (parentVal: ?Object, childVal: ?Object, vm?: Component, key: string): ?Object {
  // => 围绕 Firefox 的 Object.prototype.watch 工作
  if (parentVal === nativeWatch) parentVal = undefined;
  if (childVal === nativeWatch) childVal = undefined;

  if (!childVal) return Object.create(parentVal || null);
  if (process.env.NODE_ENV !== 'production') assertObjectType(key, childVal, vm);

  if (!parentVal) return childVal;
  const ret = {};
  extend(ret, parentVal);
  for (const key in childVal) {
    let parent = ret[key];
    const child = childVal[key];
    if (parent && !Array.isArray(parent)) parent = [parent];

    ret[key] = parent ? parent.concat(child) : Array.isArray(child) ? child : [child];
  }
  return ret;
};

// => 其他对象散列
strats.props = strats.methods = strats.inject = strats.computed = function (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string,
): ?Object {
  if (childVal && process.env.NODE_ENV !== 'production') assertObjectType(key, childVal, vm);

  if (!parentVal) return childVal;

  const ret = Object.create(null);

  extend(ret, parentVal);

  if (childVal) extend(ret, childVal);

  return ret;
};

strats.provide = mergeDataOrFn;

// => 默认策略
const defaultStrat = function (parentVal: any, childVal: any): any {
  return childVal === undefined ? parentVal : childVal;
};

// => 验证组件名称
function checkComponents(options: Object) {
  // => 循环遍历组件对象的每一个组件，验证其组件名称
  for (const key in options.components) validateComponentName(key);
}

export function validateComponentName(name: string) {
  if (!new RegExp(`^[a-zA-Z][\\-\\.0-9_${unicodeRegExp.source}]*$`).test(name)) {
    // => 无效的组件名称：" name " | 组件名称应符合 html5 规范中有效的自定义元素名称。
    warn(`Invalid component name: "${name}". Component names should conform to valid custom element name in html5 specification.`);
  }

  if (isBuiltInTag(name) || config.isReservedTag(name)) {
    // => 不要使用内置（slot / component）或保留的 HTML 元素作为组件
    warn(`Do not use built-in or reserved HTML elements as component. id: '${name}'`);
  }
}

// => 确保所有的 props 选项语法都规范化为基于对象的格式
function normalizeProps(options: Object, vm: ?Component) {
  const props = options.props;

  /* => 未设置 props 选项，直接结束即可 */
  if (!props) return;

  const res = {};
  let i, val, name;

  /* => 如果 props 是一个数组 */
  if (Array.isArray(props)) {
    i = props.length;
    while (i--) {
      val = props[i];
      if (typeof val === 'string') {
        /* => 将 prop-prop 转换成 propProp 驼峰形式 */
        name = camelize(val);

        /* => 规格化成对象，类型默认为 null */
        res[name] = { type: null };
      } else if (process.env.NODE_ENV !== 'production') {
        /* => 使用数组语法时，prop 必须是字符串。 */
        warn('props must be strings when using array syntax.');
      }
    }
  } else if (isPlainObject(props)) {
    /* => 如果 props 是一个纯对象 */
    for (const key in props) {
      val = props[key];

      /* => 将 prop-prop 转换成 propProp 驼峰形式 */
      name = camelize(key);

      /* => 若属性值是一个纯对象，延用即可，否则（{ prop: Number } 定义 prop 属性的类型）封装成对象 */
      res[name] = isPlainObject(val) ? val : { type: val };
    }
  } else if (process.env.NODE_ENV !== 'production') {
    /* => 选项 props 的值无效：期望数组或对象，但得到 toRawType(props) 。 */
    warn(`Invalid value for option "props": expected an Array or an Object, but got ${toRawType(props)}.`, vm);
  }

  /* => 使用规范化后的 props 覆盖原来的 props */
  options.props = res;
}

// => 将所有注入规范化为基于对象的格式
function normalizeInject(options: Object, vm: ?Component) {
  const inject = options.inject;
  if (!inject) return;
  const normalized = (options.inject = {});
  if (Array.isArray(inject)) {
    for (let i = 0; i < inject.length; i++) normalized[inject[i]] = { from: inject[i] };
  } else if (isPlainObject(inject)) {
    for (const key in inject) {
      const val = inject[key];
      normalized[key] = isPlainObject(val) ? extend({ from: key }, val) : { from: val };
    }
  } else if (process.env.NODE_ENV !== 'production') {
    warn(`Invalid value for option "inject": expected an Array or an Object, but got ${toRawType(inject)}.`, vm);
  }
}

// => 将原始函数指令规范化为对象格式
function normalizeDirectives(options: Object) {
  const dirs = options.directives;
  if (dirs) {
    for (const key in dirs) {
      const def = dirs[key];
      if (typeof def === 'function') dirs[key] = { bind: def, update: def };
    }
  }
}

function assertObjectType(name: string, value: any, vm: ?Component) {
  if (!isPlainObject(value)) warn(`Invalid value for option "${name}": expected an Object, but got ${toRawType(value)}.`, vm);
}

// => 将两个option对象合并到一个新对象中。在实例化和继承中使用的核心实用程序
export function mergeOptions(parent: Object, child: Object, vm?: Component): Object {
  // => 在开发环境下，校验组件名
  if (process.env.NODE_ENV !== 'production') checkComponents(child);

  // => 如果传入的是函数（子组件：Vue.options ），则获取它的 options 属性
  if (typeof child === 'function') child = child.options;

  // 规范化 prop / inject / directive
  normalizeProps(child, vm);
  normalizeInject(child, vm);
  normalizeDirectives(child);

  // => 在子选项上应用扩展和混合
  // => 但是，只有当它是一个原始的 options 对象
  // => 而不是另一个 mergeOptions 调用的结果时才会这样
  // => 只有合并选项具有 _base 属性
  if (!child._base) {
    if (child.extends) parent = mergeOptions(parent, child.extends, vm);

    if (child.mixins) for (let i = 0, l = child.mixins.length; i < l; i++) parent = mergeOptions(parent, child.mixins[i], vm);
  }

  const options = {};
  let key;
  for (key in parent) mergeField(key);

  for (key in child) if (!hasOwn(parent, key)) mergeField(key);

  function mergeField(key) {
    const strat = strats[key] || defaultStrat;
    options[key] = strat(parent[key], child[key], vm, key);
  }
  return options;
}

/**
 * 解析一个 asset （指令/过滤器/组件）
 * 之所以使用此函数，是因为子实例需要访问其祖先链中定义的 asset 。
 */
export function resolveAsset(options: Object, type: string, id: string, warnMissing?: boolean): any {
  // => 过滤器名称必须是字符串
  if (typeof id !== 'string') return;

  const assets = options[type];
  // => 首先检查本地注册变量
  if (hasOwn(assets, id)) return assets[id];

  // => 驼峰化后再检查
  const camelizedId = camelize(id);
  if (hasOwn(assets, camelizedId)) return assets[camelizedId];

  // => 首字母大写后再检查
  const PascalCaseId = capitalize(camelizedId);
  if (hasOwn(assets, PascalCaseId)) return assets[PascalCaseId];

  // => 退回到检查原型链（直接访问属性，因为全局注册的 asset 会保存在 Vue 构造函数中，但过滤器除外：全局过滤器与组件过滤器合并到了 this.$options.filters 中）
  const res = assets[id] || assets[camelizedId] || assets[PascalCaseId];

  // => 未能解析 asset
  if (process.env.NODE_ENV !== 'production' && warnMissing && !res) warn(`Failed to resolve ${type.slice(0, -1)}: ${id}`, options);

  return res;
}
