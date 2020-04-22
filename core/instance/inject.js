/* @flow */

import { hasOwn } from 'shared/util';
import { warn, hasSymbol } from '../util/index';
import { defineReactive, toggleObserving } from '../observer/index';

export function initProvide(vm: Component) {
  const provide = vm.$options.provide;
  if (provide) {
    vm._provided = typeof provide === 'function' ? provide.call(vm) : provide;
  }
}

export function initInjections(vm: Component) {
  /* => 自底向上搜索注入的数据，并返回搜索结果 */
  const result = resolveInject(vm.$options.inject, vm);

  if (result) {
    /* => 通知 defineReactive() 不要将这些数据定义成响应式的 */
    toggleObserving(false);

    Object.keys(result).forEach((key) => {
      /* istanbul ignore else */
      if (process.env.NODE_ENV !== 'production') {
        defineReactive(vm, key, result[key], () => {
          /* => 避免直接更改注入的值，因为只要提供的组件重新渲染，更改就会被覆盖。注入被突变: key */
          warn(
            `Avoid mutating an injected value directly since the changes will be ` +
              `overwritten whenever the provided component re-renders. ` +
              `injection being mutated: "${key}"`,
            vm,
          );
        });
      } else {
        /* => 在 vm 实例上挂载属性 */
        defineReactive(vm, key, result[key]);
      }
    });

    toggleObserving(true);
  }
}

export function resolveInject(inject: any, vm: Component): ?Object {
  if (inject) {
    // inject is :any because flow is not smart enough to figure out cached => inject 是 any 类型，因为 flow 不够聪明，无法找出缓存
    const result = Object.create(null);

    /* => 获取所有属性（包括 Symbol） */
    const keys = hasSymbol ? Reflect.ownKeys(inject) : Object.keys(inject);

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      // #6574 in case the inject object is observed... => 如果注入对象被观察到 ......
      if (key === '__ob__') continue;

      /* => 得到 provide 源属性（这些数据规格化之后会拥有一个 from 属性，指向源头） */
      const provideKey = inject[key].from;
      let source = vm;

      /* => 在实例上自底向上搜索 */
      while (source) {
        /* => 如果搜索到了 */
        if (source._provided && hasOwn(source._provided, provideKey)) {
          /* => 将值存放在结果集且结束循环 */
          result[key] = source._provided[provideKey];
          break;
        }

        /* => 否则继续往上搜索 */
        source = source.$parent;
      }

      /* => 如果设置了默认值 */
      if (!source) {
        if ('default' in inject[key]) {
          /* => 用该默认值作为结果 */
          const provideDefault = inject[key].default;

          /* => 如果是一个函数，拿取调用的返回结果 */
          result[key] = typeof provideDefault === 'function' ? provideDefault.call(vm) : provideDefault;
        } else if (process.env.NODE_ENV !== 'production') {
          /* => 没有找到 key 注入 */
          warn(`Injection "${key}" not found`, vm);
        }
      }
    }

    /* => 返回搜索到的注入 */
    return result;
  }
}
