import { warn } from './debug';
import { observe, toggleObserving, shouldObserve } from '../observer/index';
import { hasOwn, isObject, toRawType, hyphenate, capitalize, isPlainObject } from 'shared/util';

type PropOptions = {
  type: Function | Array<Function> | null,
  default: any,
  required: ?boolean,
  validator: ?Function,
};

/* => 验证 prop */
export function validateProp(key: string, propOptions: Object, propsData: Object, vm?: Component): any {
  const prop = propOptions[key];
  const absent = !hasOwn(propsData, key);
  let value = propsData[key];

  // => 构建布尔值
  const booleanIndex = getTypeIndex(Boolean, prop.type);
  if (booleanIndex > -1) {
    if (absent && !hasOwn(prop, 'default')) {
      value = false;
    } else if (value === '' || value === hyphenate(key)) {
      /* => 如果布尔值具有更高的优先级，则只将空字符串/同名转换为布尔值 */
      const stringIndex = getTypeIndex(String, prop.type);

      if (stringIndex < 0 || booleanIndex < stringIndex) value = true;
    }
  }

  // => 检查默认值
  if (value === undefined) {
    value = getPropDefaultValue(vm, prop, key);

    /* => 因为默认值是一个新的副本，所以一定要观察它。 */
    const prevShouldObserve = shouldObserve;
    toggleObserving(true);

    observe(value);

    toggleObserving(prevShouldObserve);
  }

  // => 跳过 weex 回收列表子组件道具的验证
  if (process.env.NODE_ENV !== 'production' && !(__WEEX__ && isObject(value) && '@binding' in value)) {
    assertProp(prop, key, value, vm, absent);
  }

  return value;
}

/**
 * => 获取 prop 的默认值。
 */
function getPropDefaultValue(vm: ?Component, prop: PropOptions, key: string): any {
  // => 没有默认值，返回 undefined
  if (!hasOwn(prop, 'default')) return undefined;

  const def = prop.default;

  // => 警告对象和数组的非工厂默认值
  if (process.env.NODE_ENV !== 'production' && isObject(def)) {
    // prop key 的默认值无效：带有对象/数组类型的 prop 必须使用工厂函数来返回默认值。
    warn(
      `Invalid default value for prop "${key}": Props with type Object/Array must use a factory function to return the default value.`,
      vm,
    );
  }

  /* => 原始 prop 值也未从之前的渲染中定义，返回之前的默认值以避免不必要的观察者触发 */
  if (vm && vm.$options.propsData && vm.$options.propsData[key] === undefined && vm._props[key] !== undefined) {
    return vm._props[key];
  }

  /* => 对于非函数类型调用工厂函数，如果一个值的原型是函数，那么它就是函数，即使在不同的执行上下文中也是如此 */
  return typeof def === 'function' && getType(prop.type) !== 'Function' ? def.call(vm) : def;
}

/**
 * => 判断一个 prop 是否有效。
 */
function assertProp(prop: PropOptions, name: string, value: any, vm: ?Component, absent: boolean) {
  if (prop.required && absent) {
    /* => 缺少必需的 prop : name */
    warn(`Missing required prop: "${name}"`, vm);
    return;
  }

  if (value == null && !prop.required) return;

  let type = prop.type;
  let valid = !type || type === true;
  const expectedTypes = [];

  if (type) {
    if (!Array.isArray(type)) type = [type];

    for (let i = 0; i < type.length && !valid; i++) {
      const assertedType = assertType(value, type[i]);
      expectedTypes.push(assertedType.expectedType || '');
      valid = assertedType.valid;
    }
  }

  if (!valid) {
    warn(getInvalidTypeMessage(name, value, expectedTypes), vm);
    return;
  }
  const validator = prop.validator;
  if (validator) {
    /* => 无效的 prop :自定义验证器检查失败的 prop name */
    if (!validator(value)) warn(`Invalid prop: custom validator check failed for prop "${name}".`, vm);
  }
}

const simpleCheckRE = /^(String|Number|Boolean|Function|Symbol)$/;

function assertType(value: any, type: Function) {
  let valid;
  const expectedType = getType(type);

  if (simpleCheckRE.test(expectedType)) {
    const t = typeof value;
    valid = t === expectedType.toLowerCase();

    // => 对于原始包装器对象
    if (!valid && t === 'object') valid = value instanceof type;
  } else if (expectedType === 'Object') {
    valid = isPlainObject(value);
  } else if (expectedType === 'Array') {
    valid = Array.isArray(value);
  } else {
    valid = value instanceof type;
  }

  return { valid, expectedType };
}

/**
 * => 使用函数字符串名检查内置类型，因为在不同的 vms / iframe 之间运行时，简单的相等性检查将失败。
 */
function getType(fn) {
  const match = fn && fn.toString().match(/^\s*function (\w+)/);
  return match ? match[1] : '';
}

function isSameType(a, b) {
  return getType(a) === getType(b);
}

function getTypeIndex(type, expectedTypes): number {
  if (!Array.isArray(expectedTypes)) return isSameType(expectedTypes, type) ? 0 : -1;

  for (let i = 0, len = expectedTypes.length; i < len; i++) if (isSameType(expectedTypes[i], type)) return i;

  return -1;
}

function getInvalidTypeMessage(name, value, expectedTypes) {
  let message = `Invalid prop: type check failed for prop "${name}". Expected ${expectedTypes.map(capitalize).join(', ')}`;
  const expectedType = expectedTypes[0];
  const receivedType = toRawType(value);
  const expectedValue = styleValue(value, expectedType);
  const receivedValue = styleValue(value, receivedType);

  // => 检查我们是否需要指定接收值
  if (expectedTypes.length === 1 && isExplicable(expectedType) && !isBoolean(expectedType, receivedType)) {
    message += ` with value ${expectedValue}`;
  }
  message += `, got ${receivedType} `;

  // => 检查我们是否需要指定接收值
  if (isExplicable(receivedType)) message += `with value ${receivedValue}.`;

  return message;
}

function styleValue(value, type) {
  if (type === 'String') {
    return `"${value}"`;
  } else if (type === 'Number') {
    return `${Number(value)}`;
  } else {
    return `${value}`;
  }
}

function isExplicable(value) {
  const explicitTypes = ['string', 'number', 'boolean'];
  return explicitTypes.some((elem) => value.toLowerCase() === elem);
}

function isBoolean(...args) {
  return args.some((elem) => elem.toLowerCase() === 'boolean');
}
