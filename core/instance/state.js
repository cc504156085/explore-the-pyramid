/* @flow */

import config from '../config';
import Watcher from '../observer/watcher';
import Dep, { pushTarget, popTarget } from '../observer/dep';
import { isUpdatingChildComponent } from './lifecycle';

import { set, del, observe, defineReactive, toggleObserving } from '../observer/index';

import {
  warn,
  bind,
  noop,
  hasOwn,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute,
} from '../util/index';

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop,
};

/* => 状态（数据）代理 */
export function proxy(target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter() {
    return this[sourceKey][key];
  };
  sharedPropertyDefinition.set = function proxySetter(val) {
    this[sourceKey][key] = val;
  };
  Object.defineProperty(target, key, sharedPropertyDefinition);
}

/* => 状态（数据）初始化 */
export function initState(vm: Component) {
  /* => 存放当前组件中所有的 Watcher （ $watch / watch ） */
  vm._watchers = [];

  const opts = vm.$options;
  if (opts.props) initProps(vm, opts.props);
  if (opts.methods) initMethods(vm, opts.methods);
  if (opts.data) {
    initData(vm);
  } else {
    /* => 如果没有提供 data ，观测空对象并挂载在实例上 */
    observe((vm._data = {}), true /* asRootData */);
  }
  if (opts.computed) initComputed(vm, opts.computed);
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch);
  }
}

/* => 初始化 options props */
function initProps(vm: Component, propsOptions: Object) {
  const propsData = vm.$options.propsData || {};
  const props = (vm._props = {});

  /* => 缓存 prop keys，以便未来的 props 更新可以使用数组迭代，而不是动态对象键枚举。 */
  // cache prop keys so that future props updates can iterate using Array
  // instead of dynamic object key enumeration.
  const keys = (vm.$options._propKeys = []);
  const isRoot = !vm.$parent;

  // root instance props should be converted => 根实例的 props 应该被转换成响应式
  if (!isRoot) {
    toggleObserving(false);
  }

  for (const key in propsOptions) {
    /* => 缓存 props 中的属性 */
    keys.push(key);
    const value = validateProp(key, propsOptions, propsData, vm);

    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      const hyphenatedKey = hyphenate(key);

      if (isReservedAttribute(hyphenatedKey) || config.isReservedAttr(hyphenatedKey)) {
        /* => XXX 是一个保留属性，不能用作组件 prop。 */
        warn(`"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`, vm);
      }

      defineReactive(props, key, value, () => {
        if (!isRoot && !isUpdatingChildComponent) {
          /* => 避免直接改变一个 prop，因为当父组件重新渲染时，该值将被覆盖。 */
          /* => 相反，使用基于 prop 值的数据或计算属性。 prop 变了: key */
          warn(
            `Avoid mutating a prop directly since the value will be ` +
              `overwritten whenever the parent component re-renders. ` +
              `Instead, use a data or computed property based on the prop's ` +
              `value. Prop being mutated: "${key}"`,
            vm,
          );
        }
      });
    } else {
      /* => 将 props 定义成响应式的数据 */
      defineReactive(props, key, value);
    }

    /* => 在 Vue.extend() 期间，静态 props 已经在组件的原型上进行了代理。我们只需要代理在实例化上定义的 props。 */
    // static props are already proxy on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    if (!(key in vm)) {
      /* => 将其代理至私有属性 _props */
      proxy(vm, `_props`, key);
    }
  }

  toggleObserving(true);
}

/* => 初始化 options data */
function initData(vm: Component) {
  /* => 拿到实例上的数据 */
  let data = vm.$options.data;

  /* => 判断 data 是否是一个函数 */
  data = vm._data = typeof data === 'function' ? getData(data, vm) : data || {};

  /* => 判断 data 是否是一个纯对象 */
  if (!isPlainObject(data)) {
    /* => 如果不是普通对象，将data赋值为一个空对象，且在开发环境下报警告 => 数据函数应该返回一个对象 */
    data = {};
    process.env.NODE_ENV !== 'production' &&
      warn('data functions should return an object:\n https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function', vm);
  }

  // proxy data on instance => 在实例上代理 data ，可通过 this.xxx 访问 data 中的属性
  const keys = Object.keys(data);
  const props = vm.$options.props;
  const methods = vm.$options.methods;
  let i = keys.length;
  while (i--) {
    const key = keys[i];
    if (process.env.NODE_ENV !== 'production') {
      if (methods && hasOwn(methods, key)) {
        /* => 方法 key 已定义为 data 属性。 */
        warn(`Method "${key}" has already been defined as a data property.`, vm);
      }
    }
    if (props && hasOwn(props, key)) {
      /* => 数据属性 key 已声明为 prop 。改为使用 prop 默认值。 */
      process.env.NODE_ENV !== 'production' &&
        warn(`The data property "${key}" is already declared as a prop. Use prop default value instead.`, vm);
    } else if (!isReserved(key)) {
      /* => 将不是以 $ _ 开头的属性代理到实例 vm 上 */
      proxy(vm, `_data`, key);
    }
  }

  // observe data => 观测数据
  observe(data, true /* asRootData => 是否为根数据（true） */);
}

/* => 获取数据 */
export function getData(data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters => 调用数据获取程序时禁用 dep 收集
  pushTarget();
  try {
    /* => 尝试执行 data 函数，获取返回值 */
    return data.call(vm, vm);
  } catch (e) {
    handleError(e, vm, `data()`);
    return {};
  } finally {
    popTarget();
  }
}

/* => 计算属性观察者选项 */
const computedWatcherOptions = { lazy: true };

/* => 初始化 options computed */
function initComputed(vm: Component, computed: Object) {
  /* => 创建一个容器，用来收集依赖 */
  const watchers = (vm._computedWatchers = Object.create(null));

  // computed properties are just getters during SSR => 计算属性只是 SSR 期间的 getter
  const isSSR = isServerRendering();

  for (const key in computed) {
    /* => 用户定义的计算属性 */
    const userDef = computed[key];

    /* => 若是一个函数，将其当做 getter ，若是对象，需要提供 get 方法 */
    const getter = typeof userDef === 'function' ? userDef : userDef.get;
    if (process.env.NODE_ENV !== 'production' && getter == null) {
      /* => 计算属性 key 缺少 Getter 。 */
      warn(`Getter is missing for computed property "${key}".`, vm);
    }

    if (!isSSR) {
      // create internal watcher for the computed property. => 为计算属性创建内部监视程序。且标识为懒的观察者
      // watchers[key] = new Watcher(vm, getter || noop, noop, computedWatcherOptions);
      watchers[key] = new Watcher(vm, getter || noop, noop, { lazy: true });
    }

    /* => 组件定义的计算属性已经在组件原型上定义。我们只需要定义在实例化时定义的计算属性。 */
    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    if (!(key in vm)) {
      /* => 若当前实例上不存在这个计算属性，则将其定义在当前实例上 */
      defineComputed(vm, key, userDef);
    } else if (process.env.NODE_ENV !== 'production') {
      if (key in vm.$data) {
        /* => 已经在数据中定义了计算属性 key。 */
        warn(`The computed property "${key}" is already defined in data.`, vm);
      } else if (vm.$options.props && key in vm.$options.props) {
        /* => 计算属性 key 已经被定义为一个 prop。 */
        warn(`The computed property "${key}" is already defined as a prop.`, vm);
      }
    }
  }
}

/* => 定义 computed */
export function defineComputed(target: any, key: string, userDef: Object | Function) {
  const shouldCache = !isServerRendering();

  /* => 如果计算属性值是一个函数 */
  if (typeof userDef === 'function') {
    /* => 非服务端渲染的情况下需要缓存 */
    sharedPropertyDefinition.get = shouldCache ? createComputedGetter(key) : createGetterInvoker(userDef);
    sharedPropertyDefinition.set = noop;
  } else {
    /* => 否则这是一个对象，拿取 get / set 方法 */
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : createGetterInvoker(userDef.get)
      : noop;
    sharedPropertyDefinition.set = userDef.set || noop;
  }

  /* => 如果计算属性被重新赋值且又没提供 set 方法 */
  if (process.env.NODE_ENV !== 'production' && sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      /* => 计算属性 key 被赋值，但它没有 setter。 */
      warn(`Computed property "${key}" was assigned to but it has no setter.`, this);
    };
  }

  /* => 在 vm 实例上挂载计算属性 */
  Object.defineProperty(target, key, sharedPropertyDefinition);
}

/* => 创建 computed getter */
function createComputedGetter(key) {
  /* => 返回一个函数，当用户执行该计算属性时，才真正调用取值 */
  return function computedGetter() {
    /* => 拿到观察者 */
    const watcher = this._computedWatchers && this._computedWatchers[key];

    if (watcher) {
      /* => 默认第一次为 true，执行获取值之后，改成 false */
      if (watcher.dirty) {
        watcher.evaluate();
      }

      /* => 依赖收集 */
      if (Dep.target) {
        watcher.depend();
      }

      /* => 当下一次数据没有变化的时候，直接返回缓存的值 */
      return watcher.value;
    }
  };
}

/* => 创建 Getter 调用程序 */
function createGetterInvoker(fn) {
  return function computedGetter() {
    return fn.call(this, this);
  };
}

/* => 初始化 options methods */
function initMethods(vm: Component, methods: Object) {
  const props = vm.$options.props;
  for (const key in methods) {
    if (process.env.NODE_ENV !== 'production') {
      if (typeof methods[key] !== 'function') {
        /* => 方法 key 在组件定义中具有类型 typeof methods[key] 。你是否正确地引用了这个函数? */
        /* => 方法应该是一个函数 */
        warn(
          `Method "${key}" has type "${typeof methods[key]}" in the component definition. Did you reference the function correctly?`,
          vm,
        );
      }
      if (props && hasOwn(props, key)) {
        /* => 方法 key 已经被定义为一个 prop 。 */
        warn(`Method "${key}" has already been defined as a prop.`, vm);
      }
      if (key in vm && isReserved(key)) {
        /* => 方法 key 与现有的 Vue 实例方法冲突。避免定义以 _ 或 $ 开头的组件方法。 */
        warn(`Method "${key}" conflicts with an existing Vue instance method. Avoid defining component methods that start with _ or $.`);
      }
    }

    /* => 如果不是一个函数，则将其挂载为一个空函数，否则绑定一个副本挂载在实例上（将当前 vm 实例作为上下文） */
    vm[key] = typeof methods[key] !== 'function' ? noop : bind(methods[key], vm);
  }
}

/* => 初始化 options watch */
function initWatch(vm: Component, watch: Object) {
  for (const key in watch) {
    const handler = watch[key];
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i]);
      }
    } else {
      createWatcher(vm, key, handler);
    }
  }
}

/* => 创建观察者 */
function createWatcher(vm: Component, expOrFn: string | Function, handler: any, options?: Object) {
  if (isPlainObject(handler)) {
    options = handler;
    handler = handler.handler;
  }
  if (typeof handler === 'string') {
    handler = vm[handler];
  }
  return vm.$watch(expOrFn, handler, options);
}

/* => 状态混入 */
export function stateMixin(Vue: Class<Component>) {
  /* => 在使用 object.defineProperty 时，flow 在直接声明 definition 对象方面有一些问题，因此我们必须在这里按流程构建对象。 */
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.

  const dataDef = {};
  dataDef.get = function () {
    return this._data;
  };

  const propsDef = {};
  propsDef.get = function () {
    return this._props;
  };

  if (process.env.NODE_ENV !== 'production') {
    dataDef.set = function () {
      /* => 避免替换实例根 $data。请改用嵌套数据属性。 */
      warn('Avoid replacing instance root $data. Use nested data properties instead.', this);
    };
    propsDef.set = function () {
      /* => $props 是只读的 */
      warn(`$props is readonly.`, this);
    };
  }

  /* => 数据代理 */
  Object.defineProperty(Vue.prototype, '$data', dataDef);
  Object.defineProperty(Vue.prototype, '$props', propsDef);

  /* => 挂载 $set / $delete 方法 */
  Vue.prototype.$set = set;
  Vue.prototype.$delete = del;

  Vue.prototype.$watch = function (expOrFn: string | Function, cb: any, options?: Object): Function {
    const vm: Component = this;

    /* => 如果第二个参数是一个纯对象 */
    if (isPlainObject(cb)) {
      return createWatcher(vm, expOrFn, cb, options);
    }

    /* => 否则是一个函数 */
    options = options || {};

    /* => 标识为用户定义的 Watcher 。 this.$watch() */
    options.user = true;

    /* => 创建一个 Watcher */
    const watcher = new Watcher(vm, expOrFn, cb, options);

    /* => 是否指定立即执行回调函数 */
    if (options.immediate) {
      try {
        cb.call(vm, watcher.value);
      } catch (error) {
        handleError(error, vm, `callback for immediate watcher "${watcher.expression}"`);
      }
    }

    /* => 返回一个函数，用来卸载监听 */
    return function unwatchFn() {
      watcher.teardown();
    };
  };
}
