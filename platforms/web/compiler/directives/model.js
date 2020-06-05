import config from 'core/config';
import { addHandler, addProp, getBindingAttr } from 'compiler/helpers';
import { genComponentModel, genAssignmentCode } from 'compiler/directives/model';

let warn;

/* => 在某些情况下，使用的事件必须在运行时确定，因此我们在编译期间使用了一些保留的标记。 */
export const RANGE_TOKEN = '__r';
export const CHECKBOX_RADIO_TOKEN = '__c';

export default function model(el: ASTElement, dir: ASTDirective, _warn: Function): ?boolean {
  warn = _warn;
  const value = dir.value;
  const modifiers = dir.modifiers;
  const tag = el.tag;
  const type = el.attrsMap.type;

  if (process.env.NODE_ENV !== 'production') {
    // => type="file" 的输入是只读的，设置输入的值会抛出一个错误。
    if (tag === 'input' && type === 'file') {
      // => 文件输入是只读的。使用一个 v-on:change 事件监听
      warn(
        `<${el.tag} v-model="${value}" type="file">: File inputs are read only. Use a v-on:change listener instead.`,
        el.rawAttrsMap['v-model'],
      );
    }
  }

  if (el.component) {
    genComponentModel(el, value, modifiers);
    // => 组件 v-model 不需要额外的运行时
    return false;
  } else if (tag === 'select') {
    genSelect(el, value, modifiers);
  } else if (tag === 'input' && type === 'checkbox') {
    genCheckboxModel(el, value, modifiers);
  } else if (tag === 'input' && type === 'radio') {
    genRadioModel(el, value, modifiers);
  } else if (tag === 'input' || tag === 'textarea') {
    genDefaultModel(el, value, modifiers);
  } else if (!config.isReservedTag(tag)) {
    genComponentModel(el, value, modifiers);

    // => 组件 v-model 不需要额外的运行时
    return false;
  } else if (process.env.NODE_ENV !== 'production') {
    // => 此元素类型不支持 v-model 。如果您使用的是 contentEditable ，建议将专用于此目的的库包装在自定义组件中。
    warn(
      `<${el.tag} v-model="${value}">: ` +
        `v-model is not supported on this element type. ` +
        "If you are working with contentEditable, it's recommended to " +
        'wrap a library dedicated for that purpose inside a custom component.',
      el.rawAttrsMap['v-model'],
    );
  }

  // => 确保运行时指令元数据
  return true;
}

function genCheckboxModel(el: ASTElement, value: string, modifiers: ?ASTModifiers) {
  const number = modifiers && modifiers.number;
  const valueBinding = getBindingAttr(el, 'value') || 'null';
  const trueValueBinding = getBindingAttr(el, 'true-value') || 'true';
  const falseValueBinding = getBindingAttr(el, 'false-value') || 'false';
  addProp(
    el,
    'checked',
    `Array.isArray(${value})` +
      `?_i(${value},${valueBinding})>-1` +
      (trueValueBinding === 'true' ? `:(${value})` : `:_q(${value},${trueValueBinding})`),
  );
  addHandler(
    el,
    'change',
    `var $$a=${value},` +
      '$$el=$event.target,' +
      `$$c=$$el.checked?(${trueValueBinding}):(${falseValueBinding});` +
      'if(Array.isArray($$a)){' +
      `var $$v=${number ? '_n(' + valueBinding + ')' : valueBinding},` +
      '$$i=_i($$a,$$v);' +
      `if($$el.checked){$$i<0&&(${genAssignmentCode(value, '$$a.concat([$$v])')})}` +
      `else{$$i>-1&&(${genAssignmentCode(value, '$$a.slice(0,$$i).concat($$a.slice($$i+1))')})}` +
      `}else{${genAssignmentCode(value, '$$c')}}`,
    null,
    true,
  );
}

function genRadioModel(el: ASTElement, value: string, modifiers: ?ASTModifiers) {
  const number = modifiers && modifiers.number;
  let valueBinding = getBindingAttr(el, 'value') || 'null';
  valueBinding = number ? `_n(${valueBinding})` : valueBinding;
  addProp(el, 'checked', `_q(${value},${valueBinding})`);
  addHandler(el, 'change', genAssignmentCode(value, valueBinding), null, true);
}

function genSelect(el: ASTElement, value: string, modifiers: ?ASTModifiers) {
  const number = modifiers && modifiers.number;
  const selectedVal =
    `Array.prototype.filter` +
    `.call($event.target.options,function(o){return o.selected})` +
    `.map(function(o){var val = "_value" in o ? o._value : o.value;` +
    `return ${number ? '_n(val)' : 'val'}})`;

  const assignment = '$event.target.multiple ? $$selectedVal : $$selectedVal[0]';
  let code = `var $$selectedVal = ${selectedVal};`;
  code = `${code} ${genAssignmentCode(value, assignment)}`;
  addHandler(el, 'change', code, null, true);
}

function genDefaultModel(el: ASTElement, value: string, modifiers: ?ASTModifiers): ?boolean {
  const type = el.attrsMap.type;

  // => 如果 v-bind:value 与 v-model 冲突，则发出警告，除了使用 v-bind:type 的输入之外
  if (process.env.NODE_ENV !== 'production') {
    const value = el.attrsMap['v-bind:value'] || el.attrsMap[':value'];
    const typeBinding = el.attrsMap['v-bind:type'] || el.attrsMap[':type'];
    if (value && !typeBinding) {
      const binding = el.attrsMap['v-bind:value'] ? 'v-bind:value' : ':value';
      // => 与同一元素上的 v-model 冲突，因为后者已经扩展为内部的值绑定
      warn(
        `${binding}="${value}" conflicts with v-model on the same element because the latter already expands to a value binding internally`,
        el.rawAttrsMap[binding],
      );
    }
  }

  // => v-model 指令的修饰符
  const { lazy, number, trim } = modifiers || {};
  const needCompositionGuard = !lazy && type !== 'range';

  // => 取代 input 监听 change 事件
  const event = lazy ? 'change' : type === 'range' ? RANGE_TOKEN : 'input';

  let valueExpression = '$event.target.value';

  // => 输入首尾空格过滤
  if (trim) valueExpression = `$event.target.value.trim()`;
3
  // => 输入字符串转为有效的数字
  if (number) valueExpression = `_n(${valueExpression})`;

  // => 生成代码字符串
  let code = genAssignmentCode(value, valueExpression);
  if (needCompositionGuard) code = `if($event.target.composing)return;${code}`;

  // => v-model="xxx" 相当于 :value="xxx" + @input="xxx=$event.target.value" 的语法糖
  // => 添加 prop 与事件处理程序
  addProp(el, 'value', `(${value})`);
  addHandler(el, event, code, null, true);

  // => 若有该修饰符，得到焦点时就触发事件
  if (trim || number) addHandler(el, 'blur', '$forceUpdate()');
}
