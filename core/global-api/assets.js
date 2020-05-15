import { ASSET_TYPES } from 'shared/constants';
import { isPlainObject, validateComponentName } from '../util/index';

export function initAssetRegisters(Vue: GlobalAPI) {
  // => 创建 asset 注册方法
  ASSET_TYPES.forEach((type) => {
    // => type：component / directive / filter
    Vue[type] = function (id: string, definition: Function | Object): Function | Object | void {
      // => 如果不传第二个参数，默认返回 id 所对应的过滤器/指令/组件（getter）
      if (!definition) {
        return this.options[type + 's'][id];
      } else {
        // => 校验组件名
        if (process.env.NODE_ENV !== 'production' && type === 'component') validateComponentName(id);

        // => 如果是组件，且第二个参数是一个标准对象
        if (type === 'component' && isPlainObject(definition)) {
          // => 若不传入组件名则默认是用 id 作为组件名
          definition.name = definition.name || id;

          // => Vue.extend 扩展定义
          definition = this.options._base.extend(definition);
        }

        // => 如果是指令，并且定义是一个函数，默认包含 bind、update 方法
        if (type === 'directive' && typeof definition === 'function') definition = { bind: definition, update: definition };

        // => 在选项中定义这个属性，如：this.options.filters.XXX
        this.options[type + 's'][id] = definition;

        return definition;
      }
    };
  });
}
