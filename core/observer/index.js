/* @flow */

import Dep from './dep';
import VNode from '../vdom/vnode';
import { arrayMethods } from './array';
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering,
} from '../util/index';

/* => 获取数组原型上的属性 */
const arrayKeys = Object.getOwnPropertyNames(arrayMethods);

/** => 在某些情况下，我们可能希望禁用组件更新计算中的观察
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true;

export function toggleObserving(value: boolean) {
  shouldObserve = value;
}

/** => 附加到每个观察对象的观察者类，附加后，观察者将目标对象的属性键转换为getter/setter，后者收集依赖项并分派更新。
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that have this object as root $data => 将此对象作为根 $data 的 vm 数

  constructor(value: any) {
    this.value = value;

    /* => 用来收集 Array 的依赖 */
    this.dep = new Dep();

    /* => 实例 vm 计数器 */
    this.vmCount = 0;

    /* => 每个观测过的 value ，在 value 上定义一个不可枚举的属性，属性的值为当前的 Observer 实例 */
    def(value, '__ob__', this);

    /* => 观测数组 */
    if (Array.isArray(value)) {
      /* => 如果非标准属性 __proto__ 可用 */
      if (hasProto) {
        /* => 通过拦截原型方法进行观测 */
        protoAugment(value, arrayMethods);
      } else {
        /* => 若不可用，则手动在 value 上绑定拦截器里的方法 */
        copyAugment(value, arrayMethods, arrayKeys);
      }

      /* => 观测数组中的每一项（对象） */
      this.observeArray(value);
    } else {
      /* => 观测对象，重新定义对象类型数据 */
      this.walk(value);
    }
  }

  /** => 遍历所有属性并将它们转换为 getter / setter 。仅当 value 的类型为“对象”时才应调用此方法。
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  walk(obj: Object) {
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
      /* => 给该 obj 上的 key 定义响应式 */
      defineReactive(obj, keys[i]);
    }
  }

  /** => 观察数组项列表
   * Observe a list of Array items.
   */
  observeArray(items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i]);
    }
  }
}

// helpers

/** => 通过拦截原型方法，观测数组
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment(target, src: Object) {
  target.__proto__ = src;
}

/** => 通过定义隐藏属性来扩充目标对象或数组。
 * Augment a target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment(target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i];
    def(target, key, src[key]);
  }
}

/**
 * Attempt to create an observer instance for a value, => 尝试为值创建观察者实例
 * returns the new observer if successfully observed, => 如果观察成功，则返回新的观察者
 * or the existing observer if the value already has one. => 如果该数据对象已经有一个观察者，则返回现有的观察者
 */
export function observe(value: any, asRootData: ?boolean): Observer | void {
  /* => 必须是对象才能被观测 */
  if (!isObject(value) || value instanceof VNode) {
    return;
  }

  let ob: Observer | void;

  /* => 判断当前对象是否已经被观测过了，观测过的数据对象会被添加一个私有属性来标识 __ob__ */
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    /* => 若已经侦测过，则返回 Observer 实例 */
    ob = value.__ob__;
  } else if (
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue
  ) {
    /* => 若是一个数组或者一个普通对象，且是可扩展的，且不是 vm 实例，则创建观测者实例 */
    ob = new Observer(value);
  }

  /* => 如果为根实例数据，实例个数自增 */
  if (asRootData && ob) {
    ob.vmCount++;
  }

  /* => 返回观察者实例 */
  return ob;
}

/** => 在对象上定义响应式属性
 * Define a reactive property on an Object.
 */
export function defineReactive(
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean,
) {
  /* => 给每一个 key 属性设置一个依赖收集池 */
  const dep = new Dep();

  /* => 获取该 key 的特性描述符 */
  const property = Object.getOwnPropertyDescriptor(obj, key);

  /* => 如果它是不可配置的，终止运行 */
  if (property && property.configurable === false) {
    return;
  }

  // cater for pre-defined getter/setters => 迎合预定义的 getter / setter （用户可能设置了 get / set）
  const getter = property && property.get;
  const setter = property && property.set;

  /* => 如果该函数的参数只传了前两个，帮 key 获取 val */
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key];
  }

  /* => 递归观测，返回观察者实例 */
  let childOb = !shallow && observe(val);

  Object.defineProperty(obj, key, {
    /* => 定义成可枚举的、可配置的 */
    enumerable: true,
    configurable: true,

    /* => 获取数据 */
    get: function reactiveGetter() {
      /* => 如果该数据对象配置了 getter */
      const value = getter ? getter.call(obj) : val;

      /* => 如果 Watcher 存在 */
      if (Dep.target) {
        /* => 只要读取了一次该 key 的值，就代表一个依赖，收集依赖 Watcher */
        dep.depend();

        if (childOb) {
          /* => 观察者实例上的依赖收集 Array */
          childOb.dep.depend();

          /* => 如果值为数组，则遍历收集依赖 */
          if (Array.isArray(value)) {
            dependArray(value);
          }
        }
      }

      return value;
    },

    /* => 设置数据 */
    set: function reactiveSetter(newVal) {
      const value = getter ? getter.call(obj) : val;

      /* => 如果新值和旧值一样，则不进行操作 */
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return;
      }

      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter();
      }

      // #7981: for accessor properties without setter => 对于不带 setter 的访问器属性
      if (getter && !setter) return;

      if (setter) {
        setter.call(obj, newVal);
      } else {
        val = newVal;
      }

      /* => 对新设置的值（有可能是一个对象）进行侦测 */
      childOb = !shallow && observe(newVal);

      /* => 通知数据对应的依赖进行更新 */
      dep.notify();
    },
  });
}

/** => $set 设置对象的属性。添加新属性，如果该属性不存在，则触发更改通知。
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
export function set(target: Array<any> | Object, key: any, val: any): any {
  if (process.env.NODE_ENV !== 'production' && (isUndef(target) || isPrimitive(target))) {
    /* => 无法对 undefined 、null 或原始值设置响应式属性 */
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${target}`);
  }

  /* => 如果它是一个数组，且 key 是一个有效的索引 */
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    /* => 更新数组的长度（若传入的索引大于原数组的长度） */
    target.length = Math.max(target.length, key);

    /* => 使用 splice 方法根据 key 将值插入到数组，使用该方法会被拦截，从而将该新增的 val 转化为响应式 */
    target.splice(key, 1, val);

    /* => 返回这个值 */
    return val;
  }

  /* => 如果 key 已经在 target 中存在，并且不是原型上的属性 */
  if (key in target && !(key in Object.prototype)) {
    /* => 说明 target 已经是响应式的，直接设置这个值并返回（set 该数据会被侦测到） */
    target[key] = val;
    return val;
  }

  /* => 获取观察者实例 */
  const ob = target.__ob__;

  /* => 判断是否为根实例 Vue */
  if (target._isVue || (ob && ob.vmCount)) {
    /* => 避免在运行时向 Vue 实例或其根 $data 添加响应式性属性 - 在 data 选项中预先声明它。 */
    /* => 如 this.$set(this.$data, key, val) 这是不合法的 */
    process.env.NODE_ENV !== 'production' &&
      warn(
        'Avoid adding reactive properties to a Vue instance or its root $data ' +
          'at runtime - declare it upfront in the data option.',
      );
    return val;
  }

  /* => 如果实例不存在，说明不是响应式的（也就没必要触发更新，因为响应式数据在初始化的时候就已经侦测了） */
  if (!ob) {
    /* => 直接设置这个值并返回 */
    target[key] = val;
    return val;
  }

  /* => 说明是在响应式数据上新增的属性，将该值转换成 getter / setter */
  defineReactive(ob.value, key, val);

  /* => 通知依赖更新 */
  ob.dep.notify();
  return val;
}

/** => $delete 删除属性并在必要时触发更新。
 * Delete a property and trigger change if necessary.
 */
export function del(target: Array<any> | Object, key: any) {
  if (process.env.NODE_ENV !== 'production' && (isUndef(target) || isPrimitive(target))) {
    /* => 无法删除 undefined、null 或原始值的响应性属性 */
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${target}`);
  }

  /* => 如果是数组，且索引有效 */
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    /* => 使用 splice 方法切除该项，拦截器做相关处理 */
    target.splice(key, 1);
    return;
  }

  /* => 获取观察者实例 */
  const ob = target.__ob__;
  if (target._isVue || (ob && ob.vmCount)) {
    /* => 避免删除 Vue 实例或其根 $data 上的属性-只需将其设置为空。 */
    process.env.NODE_ENV !== 'production' &&
      warn(
        'Avoid deleting properties on a Vue instance or its root $data ' + '- just set it to null.',
      );
    return;
  }

  /* => 若 target 上没有该 key，终止即可 */
  if (!hasOwn(target, key)) {
    return;
  }

  /* => 删除该 key */
  delete target[key];

  /* => 如果不是响应式的，就没必要通知更新 */
  if (!ob) {
    return;
  }

  /* => 手动通知依赖更新 */
  ob.dep.notify();
}

/** => 在接触数组时收集对数组元素的依赖关系，因为我们不能像属性 getter 那样拦截数组元素访问
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
function dependArray(value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i];

    /* => 若已经存在观察者实例，则收集依赖 */
    e && e.__ob__ && e.__ob__.dep.depend();

    /* => 若 e 还是一个数组，递归 */
    if (Array.isArray(e)) {
      dependArray(e);
    }
  }
}
