import { genHandlers } from './events';
import baseDirectives from '../directives/index';
import { camelize, no, extend } from 'shared/util';
import { baseWarn, pluckModuleFunction } from '../helpers';
import { emptySlotScopeToken } from '../parser/index';

type TransformFunction = (el: ASTElement, code: string) => string;
type DataGenFunction = (el: ASTElement) => string;
type DirectiveFunction = (el: ASTElement, dir: ASTDirective, warn: Function) => boolean;

export class CodegenState {
  options: CompilerOptions;
  warn: Function;
  transforms: Array<TransformFunction>;
  dataGenFns: Array<DataGenFunction>;
  directives: { [key: string]: DirectiveFunction };
  maybeComponent: (el: ASTElement) => boolean;
  onceId: number;
  staticRenderFns: Array<string>;
  pre: boolean;

  constructor(options: CompilerOptions) {
    this.options = options;
    this.warn = options.warn || baseWarn;
    this.transforms = pluckModuleFunction(options.modules, 'transformCode');
    this.dataGenFns = pluckModuleFunction(options.modules, 'genData');
    this.directives = extend(extend({}, baseDirectives), options.directives);
    const isReservedTag = options.isReservedTag || no;
    this.maybeComponent = (el: ASTElement) => !!el.component || !isReservedTag(el.tag);
    this.onceId = 0;
    this.staticRenderFns = [];
    this.pre = false;
  }
}

export type CodegenResult = { render: string, staticRenderFns: Array<string> };

/* => 将 AST 转换成 render 函数中的内容（代码字符串） */
export function generate(ast: ASTElement | void, options: CompilerOptions): CodegenResult {
  const state = new CodegenState(options);

  // => 若没有 AST ，生成一个空 div 标签
  const code = ast ? genElement(ast, state) : '_c("div")';

  // => 返回代码字符串
  return {
    render: `with(this){return ${code}}`,
    staticRenderFns: state.staticRenderFns,
  };
}

export function genElement(el: ASTElement, state: CodegenState): string {
  if (el.parent) el.pre = el.pre || el.parent.pre;

  if (el.staticRoot && !el.staticProcessed) {
    return genStatic(el, state);
  } else if (el.once && !el.onceProcessed) {
    return genOnce(el, state);
  } else if (el.for && !el.forProcessed) {
    return genFor(el, state);
  } else if (el.if && !el.ifProcessed) {
    return genIf(el, state);
  } else if (el.tag === 'template' && !el.slotTarget && !state.pre) {
    return genChildren(el, state) || 'void 0';
  } else if (el.tag === 'slot') {
    return genSlot(el, state);
  } else {
    // => 组件或元素
    let code;
    if (el.component) {
      code = genComponent(el.component, el, state);
    } else {
      let data;

      if (!el.plain || (el.pre && state.maybeComponent(el))) data = genData(el, state);

      const children = el.inlineTemplate ? null : genChildren(el, state, true);

      code = `_c('${el.tag}'${data ? `,${data}` : ''}${children ? `,${children}` : ''})`;
    }

    // => 模块转换
    for (let i = 0; i < state.transforms.length; i++) {
      code = state.transforms[i](el, code);
    }

    return code;
  }
}

// => 提升静态子树
function genStatic(el: ASTElement, state: CodegenState): string {
  el.staticProcessed = true;
  /** => 一些元素(模板)需要在 v-pre 节点中以不同的方式运行。
   *  所有 pre 节点都是静态根，因此我们可以使用这个位置来包装状态更改，并在退出 pre 节点时重置它。
   */
  const originalPreState = state.pre;
  if (el.pre) state.pre = el.pre;

  state.staticRenderFns.push(`with(this){return ${genElement(el, state)}}`);
  state.pre = originalPreState;
  return `_m(${state.staticRenderFns.length - 1}${el.staticInFor ? ',true' : ''})`;
}

// v-once
function genOnce(el: ASTElement, state: CodegenState): string {
  el.onceProcessed = true;
  if (el.if && !el.ifProcessed) {
    return genIf(el, state);
  } else if (el.staticInFor) {
    let key = '';
    let parent = el.parent;
    while (parent) {
      if (parent.for) {
        key = parent.key;
        break;
      }
      parent = parent.parent;
    }
    if (!key) {
      process.env.NODE_ENV !== 'production' && state.warn(`v-once can only be used inside v-for that is keyed. `, el.rawAttrsMap['v-once']);
      return genElement(el, state);
    }
    return `_o(${genElement(el, state)},${state.onceId++},${key})`;
  } else {
    return genStatic(el, state);
  }
}

export function genIf(el: any, state: CodegenState, altGen?: Function, altEmpty?: string): string {
  // => 避免递归
  el.ifProcessed = true;

  return genIfConditions(el.ifConditions.slice(), state, altGen, altEmpty);
}

function genIfConditions(conditions: ASTIfConditions, state: CodegenState, altGen?: Function, altEmpty?: string): string {
  if (!conditions.length) {
    return altEmpty || '_e()';
  }

  const condition = conditions.shift();
  if (condition.exp) {
    return `(${condition.exp})?${genTernaryExp(condition.block)}:${genIfConditions(conditions, state, altGen, altEmpty)}`;
  } else {
    return `${genTernaryExp(condition.block)}`;
  }

  // => 使用 v-if / v-once 应该生成像 (a) ? _m(0) : _m(1) 这样的代码
  function genTernaryExp(el) {
    return altGen ? altGen(el, state) : el.once ? genOnce(el, state) : genElement(el, state);
  }
}

export function genFor(el: any, state: CodegenState, altGen?: Function, altHelper?: string): string {
  const exp = el.for;
  const alias = el.alias;
  const iterator1 = el.iterator1 ? `,${el.iterator1}` : '';
  const iterator2 = el.iterator2 ? `,${el.iterator2}` : '';

  if (process.env.NODE_ENV !== 'production' && state.maybeComponent(el) && el.tag !== 'slot' && el.tag !== 'template' && !el.key) {
    state.warn(
      `<${el.tag} v-for="${alias} in ${exp}">: component lists rendered with ` +
        `v-for should have explicit keys. ` +
        `See https://vuejs.org/guide/list.html#key for more info.`,
      el.rawAttrsMap['v-for'],
      true /* tip */,
    );
  }

  el.forProcessed = true; // avoid recursion
  return (
    `${altHelper || '_l'}((${exp}),` + `function(${alias}${iterator1}${iterator2}){` + `return ${(altGen || genElement)(el, state)}` + '})'
  );
}

/* => 生成数据 */
export function genData(el: ASTElement, state: CodegenState): string {
  let data = '{';

  // => 指令优先，指令可能会在生成它们之前改变 el 的其他属性
  const dirs = genDirectives(el, state);
  if (dirs) data += dirs + ',';

  // key
  if (el.key) data += `key:${el.key},`;

  // ref
  if (el.ref) data += `ref:${el.ref},`;

  if (el.refInFor) data += `refInFor:true,`;

  // pre
  if (el.pre) data += `pre:true,`;

  // => 使用 is 属性记录组件的原始标签名称
  if (el.component) data += `tag:"${el.tag}",`;

  // module data generation functions
  for (let i = 0; i < state.dataGenFns.length; i++) data += state.dataGenFns[i](el);

  // attributes
  if (el.attrs) data += `attrs:${genProps(el.attrs)},`;

  // DOM props
  if (el.props) data += `domProps:${genProps(el.props)},`;

  // event handlers
  if (el.events) data += `${genHandlers(el.events, false)},`;

  if (el.nativeEvents) data += `${genHandlers(el.nativeEvents, true)},`;

  // slot target
  // only for non-scoped slots
  if (el.slotTarget && !el.slotScope) data += `slot:${el.slotTarget},`;

  // scoped slots
  if (el.scopedSlots) data += `${genScopedSlots(el, el.scopedSlots, state)},`;

  // component v-model
  if (el.model) data += `model:{value:${el.model.value},callback:${el.model.callback},expression:${el.model.expression}},`;

  // inline-template
  if (el.inlineTemplate) {
    const inlineTemplate = genInlineTemplate(el, state);
    if (inlineTemplate) data += `${inlineTemplate},`;
  }
  data = data.replace(/,$/, '') + '}';
  // v-bind dynamic argument wrap
  // v-bind with dynamic arguments must be applied using the same v-bind object
  // merge helper so that class/style/mustUseProp attrs are handled correctly.
  if (el.dynamicAttrs) data = `_b(${data},"${el.tag}",${genProps(el.dynamicAttrs)})`;

  // v-bind data wrap
  if (el.wrapData) data = el.wrapData(data);

  // v-on data wrap
  if (el.wrapListeners) data = el.wrapListeners(data);

  return data;
}

/* => 生成指令 */
function genDirectives(el: ASTElement, state: CodegenState): string | void {
  // => el.directives 在 src\compiler\helpers.js 的 addDirective() 中定义
  const dirs = el.directives;
  if (!dirs) return;

  // => 最终拼接成数组
  let res = 'directives:[';
  let hasRuntime = false;
  let i, l, dir, needRuntime;

  for (i = 0, l = dirs.length; i < l; i++) {
    dir = dirs[i];
    needRuntime = true;

    // => state.directives 是 src\platforms\web\compiler\directives\index.js 中导出的 { model, text, html }
    const gen: DirectiveFunction = state.directives[dir.name];

    // => 操纵 AST 的编译时指令，如果还需要运行时副本，则返回 true
    if (gen) needRuntime = !!gen(el, dir, state.warn);

    // => needRuntime 表明是运行时（浏览器）所需
    if (needRuntime) {
      hasRuntime = true;

      // => 拼接成一个个对象，存入数组
      res += `{name:"${dir.name}",rawName:"${dir.rawName}"${
        dir.value ? `,value:(${dir.value}),expression:${JSON.stringify(dir.value)}` : ''
      }${dir.arg ? `,arg:${dir.isDynamicArg ? dir.arg : `"${dir.arg}"`}` : ''}${
        dir.modifiers ? `,modifiers:${JSON.stringify(dir.modifiers)}` : ''
      }},`;
    }
  }

  // => 去除最后一个逗号，补上数组中括号结尾
  if (hasRuntime) return res.slice(0, -1) + ']';
}

function genInlineTemplate(el: ASTElement, state: CodegenState): ?string {
  const ast = el.children[0];
  if (process.env.NODE_ENV !== 'production' && (el.children.length !== 1 || ast.type !== 1)) {
    state.warn('Inline-template components must have exactly one child element.', {
      start: el.start,
    });
  }
  if (ast && ast.type === 1) {
    const inlineRenderFns = generate(ast, state.options);
    return `inlineTemplate:{render:function(){${inlineRenderFns.render}},staticRenderFns:[${inlineRenderFns.staticRenderFns
      .map((code) => `function(){${code}}`)
      .join(',')}]}`;
  }
}

function genScopedSlots(el: ASTElement, slots: { [key: string]: ASTElement }, state: CodegenState): string {
  // by default scoped slots are considered "stable", this allows child
  // components with only scoped slots to skip forced updates from parent.
  // but in some cases we have to bail-out of this optimization
  // for example if the slot contains dynamic names, has v-if or v-for on them...
  let needsForceUpdate =
    el.for ||
    Object.keys(slots).some((key) => {
      const slot = slots[key];
      return (
        slot.slotTargetDynamic || slot.if || slot.for || containsSlotChild(slot) // is passing down slot from parent which may be dynamic
      );
    });

  // #9534: if a component with scoped slots is inside a conditional branch,
  // it's possible for the same component to be reused but with different
  // compiled slot content. To avoid that, we generate a unique key based on
  // the generated code of all the slot contents.
  let needsKey = !!el.if;

  // OR when it is inside another scoped slot or v-for (the reactivity may be
  // disconnected due to the intermediate scope variable)
  // #9438, #9506
  // TODO: this can be further optimized by properly analyzing in-scope bindings
  // and skip force updating ones that do not actually use scope variables.
  if (!needsForceUpdate) {
    let parent = el.parent;
    while (parent) {
      if ((parent.slotScope && parent.slotScope !== emptySlotScopeToken) || parent.for) {
        needsForceUpdate = true;
        break;
      }
      if (parent.if) {
        needsKey = true;
      }
      parent = parent.parent;
    }
  }

  const generatedSlots = Object.keys(slots)
    .map((key) => genScopedSlot(slots[key], state))
    .join(',');

  return `scopedSlots:_u([${generatedSlots}]${needsForceUpdate ? `,null,true` : ``}${
    !needsForceUpdate && needsKey ? `,null,false,${hash(generatedSlots)}` : ``
  })`;
}

function hash(str) {
  let hash = 5381;
  let i = str.length;
  while (i) {
    hash = (hash * 33) ^ str.charCodeAt(--i);
  }
  return hash >>> 0;
}

function containsSlotChild(el: ASTNode): boolean {
  if (el.type === 1) {
    if (el.tag === 'slot') {
      return true;
    }
    return el.children.some(containsSlotChild);
  }
  return false;
}

function genScopedSlot(el: ASTElement, state: CodegenState): string {
  const isLegacySyntax = el.attrsMap['slot-scope'];
  if (el.if && !el.ifProcessed && !isLegacySyntax) {
    return genIf(el, state, genScopedSlot, `null`);
  }
  if (el.for && !el.forProcessed) {
    return genFor(el, state, genScopedSlot);
  }
  const slotScope = el.slotScope === emptySlotScopeToken ? `` : String(el.slotScope);
  const fn =
    `function(${slotScope}){` +
    `return ${
      el.tag === 'template'
        ? el.if && isLegacySyntax
          ? `(${el.if})?${genChildren(el, state) || 'undefined'}:undefined`
          : genChildren(el, state) || 'undefined'
        : genElement(el, state)
    }}`;
  // reverse proxy v-slot without scope on this.$slots
  const reverseProxy = slotScope ? `` : `,proxy:true`;
  return `{key:${el.slotTarget || `"default"`},fn:${fn}${reverseProxy}}`;
}

export function genChildren(
  el: ASTElement,
  state: CodegenState,
  checkSkip?: boolean,
  altGenElement?: Function,
  altGenNode?: Function,
): string | void {
  const children = el.children;
  if (children.length) {
    const el: any = children[0];

    // => 优化单个 v-for
    if (children.length === 1 && el.for && el.tag !== 'template' && el.tag !== 'slot') {
      const normalizationType = checkSkip ? (state.maybeComponent(el) ? `,1` : `,0`) : ``;
      return `${(altGenElement || genElement)(el, state)}${normalizationType}`;
    }

    const normalizationType = checkSkip ? getNormalizationType(children, state.maybeComponent) : 0;
    const gen = altGenNode || genNode;
    return `[${children.map((c) => gen(c, state)).join(',')}]${normalizationType ? `,${normalizationType}` : ''}`;
  }
}

/**
 * => 确定子数组所需的标准化
 * 0：不需要归一化
 * 1：需要简单的标准化(可能是 1 级深度嵌套数组)
 * 2：完整的规范化需要
 */
function getNormalizationType(children: Array<ASTNode>, maybeComponent: (el: ASTElement) => boolean): number {
  let res = 0;
  for (let i = 0; i < children.length; i++) {
    const el: ASTNode = children[i];
    if (el.type !== 1) {
      continue;
    }
    if (needsNormalization(el) || (el.ifConditions && el.ifConditions.some((c) => needsNormalization(c.block)))) {
      res = 2;
      break;
    }
    if (maybeComponent(el) || (el.ifConditions && el.ifConditions.some((c) => maybeComponent(c.block)))) {
      res = 1;
    }
  }
  return res;
}

function needsNormalization(el: ASTElement): boolean {
  return el.for !== undefined || el.tag === 'template' || el.tag === 'slot';
}

function genNode(node: ASTNode, state: CodegenState): string {
  if (node.type === 1) {
    return genElement(node, state);
  } else if (node.type === 3 && node.isComment) {
    return genComment(node);
  } else {
    return genText(node);
  }
}

export function genText(text: ASTText | ASTExpression): string {
  return `_v(${
    text.type === 2
      ? text.expression // no need for () because already wrapped in _s()
      : transformSpecialNewlines(JSON.stringify(text.text))
  })`;
}

export function genComment(comment: ASTText): string {
  return `_e(${JSON.stringify(comment.text)})`;
}

function genSlot(el: ASTElement, state: CodegenState): string {
  const slotName = el.slotName || '"default"';
  const children = genChildren(el, state);
  let res = `_t(${slotName}${children ? `,${children}` : ''}`;
  const attrs =
    el.attrs || el.dynamicAttrs
      ? genProps(
          (el.attrs || []).concat(el.dynamicAttrs || []).map((attr) => ({
            // slot props are camelized
            name: camelize(attr.name),
            value: attr.value,
            dynamic: attr.dynamic,
          })),
        )
      : null;
  const bind = el.attrsMap['v-bind'];
  if ((attrs || bind) && !children) {
    res += `,null`;
  }
  if (attrs) {
    res += `,${attrs}`;
  }
  if (bind) {
    res += `${attrs ? '' : ',null'},${bind}`;
  }
  return res + ')';
}

/* => componentName 是 el.component ，将它作为参数以避免 flow 的悲观细化 */
function genComponent(componentName: string, el: ASTElement, state: CodegenState): string {
  const children = el.inlineTemplate ? null : genChildren(el, state, true);
  return `_c(${componentName},${genData(el, state)}${children ? `,${children}` : ''})`;
}

function genProps(props: Array<ASTAttr>): string {
  let staticProps = ``;
  let dynamicProps = ``;
  for (let i = 0; i < props.length; i++) {
    const prop = props[i];
    const value = __WEEX__ ? generateValue(prop.value) : transformSpecialNewlines(prop.value);
    if (prop.dynamic) {
      dynamicProps += `${prop.name},${value},`;
    } else {
      staticProps += `"${prop.name}":${value},`;
    }
  }
  staticProps = `{${staticProps.slice(0, -1)}}`;
  if (dynamicProps) {
    return `_d(${staticProps},[${dynamicProps.slice(0, -1)}])`;
  } else {
    return staticProps;
  }
}

function generateValue(value) {
  if (typeof value === 'string') return transformSpecialNewlines(value);

  return JSON.stringify(value);
}

function transformSpecialNewlines(text: string): string {
  return text.replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
