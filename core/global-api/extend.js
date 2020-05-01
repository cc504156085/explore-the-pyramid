/* @flow */

import { ASSET_TYPES } from 'shared/constants';
import { defineComputed, proxy } from '../instance/state';
import { extend, mergeOptions, validateComponentName } from '../util/index';

export function initExtend(Vue: GlobalAPI) {
  /**
   * Each instance constructor, including Vue, has a unique => 每个实例构造函数(包括 Vue )都有一个唯一的 cid
   * cid. This enables us to create wrapped "child          => 这使我们能够为原型继承创建包装的“子构造函数”并缓存它们。
   * constructors" for prototypal inheritance and cache them.
   */
  Vue.cid = 0;
  let cid = 1;

  /** => 类继承：创建一个子类，继承 Vue 的一些功能
   * Class inheritance
   */
  Vue.extend = function (extendOptions: Object): Function {
    extendOptions = extendOptions || {};

    // => 缓存父类、父类 cid、扩展选项的构造函数
    const Super = this;
    const SuperId = Super.cid;
    const cachedCtors = extendOptions._Ctor || (extendOptions._Ctor = {});

    // => 如果有缓存，直接返回即可。（防止重复构造，浪费性能）
    if (cachedCtors[SuperId]) return cachedCtors[SuperId];

    // => 校验当前实例或者父级实例的组件名
    const name = extendOptions.name || Super.options.name;
    if (process.env.NODE_ENV !== 'production' && name) validateComponentName(name);

    // => 初始化子类（new Sub 时相当于 new Vue）
    const Sub = function VueComponent(options) {
      this._init(options);
    };

    /* => 原型继承 */
    // => 将子类的原型连接到父类
    Sub.prototype = Object.create(Super.prototype);

    // => 设置子类的构造函数为自己（因为在上一步，原型已经修改，constructor 会丢失，需要手动修正）
    Sub.prototype.constructor = Sub;

    // => 标识符递增
    Sub.cid = cid++;

    // => 将父类的选项继承到子类中（选项合并）
    Sub.options = mergeOptions(Super.options, extendOptions);

    // => 将父类保存在 super 属性中
    Sub['super'] = Super;

    // => 对于 prop 和 computed 属性，我们在扩展时在扩展原型的 Vue 实例上定义代理 getter 。这样就避免了为创建的每个实例调用 Object.defineProperty。
    // For props and computed properties, we define the proxy getters on
    // the Vue instances at extension time, on the extended prototype. This
    // avoids Object.defineProperty calls for each instance created.
    if (Sub.options.props) initProps(Sub);

    if (Sub.options.computed) initComputed(Sub);

    /* => 将父类中存在的属性复制到子类中（extend、mixin、use、component、directive、filter） */
    // allow further extension/mixin/plugin usage => 允许进一步的扩展/混合/插件使用
    Sub.extend = Super.extend;
    Sub.mixin = Super.mixin;
    Sub.use = Super.use;

    // create asset registers, so extended classes => 创建资产寄存器，这样扩展类也可以拥有它们的私有资产。
    // can have their private assets too.
    ASSET_TYPES.forEach((type) => (Sub[type] = Super[type]));

    // enable recursive self-lookup => 启用递归自查找
    if (name) Sub.options.components[name] = Sub;

    // keep a reference to the super options at extension time.     => 在扩展时保留对 super 选项的引用。
    // later at instantiation we can check if Super's options have  => 稍后在实例化时，我们可以检查 Super 的选项是否已经更新。
    // been updated.
    Sub.superOptions = Super.options;
    Sub.extendOptions = extendOptions;
    Sub.sealedOptions = extend({}, Sub.options);

    // cache constructor => 缓存子类构造函数
    cachedCtors[SuperId] = Sub;

    return Sub;
  };
}

function initProps(Comp) {
  const props = Comp.options.props;
  for (const key in props) {
    proxy(Comp.prototype, `_props`, key);
  }
}

function initComputed(Comp) {
  const computed = Comp.options.computed;
  for (const key in computed) {
    defineComputed(Comp.prototype, key, computed[key]);
  }
}
