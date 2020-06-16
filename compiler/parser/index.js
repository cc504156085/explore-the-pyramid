import he from 'he';
import { parseHTML } from './html-parser';
import { parseText } from './text-parser';
import { parseFilters } from './filter-parser';
import { genAssignmentCode } from '../directives/model';
import { extend, cached, no, camelize, hyphenate } from 'shared/util';
import { isIE, isEdge, isServerRendering } from 'core/util/env';

import {
  addProp,
  addAttr,
  baseWarn,
  addHandler,
  addDirective,
  getBindingAttr,
  getAndRemoveAttr,
  getRawBindingAttr,
  pluckModuleFunction,
  getAndRemoveAttrByRegex,
} from '../helpers';

export const onRE = /^@|^v-on:/;
export const dirRE = process.env.VBIND_PROP_SHORTHAND ? /^v-|^@|^:|^\.|^#/ : /^v-|^@|^:|^#/;
export const forAliasRE = /([\s\S]*?)\s+(?:in|of)\s+([\s\S]*)/;
export const forIteratorRE = /,([^,\}\]]*)(?:,([^,\}\]]*))?$/;
const stripParensRE = /^\(|\)$/g;
const dynamicArgRE = /^\[.*\]$/;

const argRE = /:(.*)$/;
export const bindRE = /^:|^\.|^v-bind:/;
const propBindRE = /^\./;
const modifierRE = /\.[^.\]]+(?=[^\]]*$)/g;

const slotRE = /^v-slot(:|$)|^#/;

const lineBreakRE = /[\r\n]/;
const whitespaceRE = /\s+/g;

const invalidAttributeRE = /[\s"'<>\/=]/;

const decodeHTMLCached = cached(he.decode);

export const emptySlotScopeToken = `_empty_`;

// => 可配置的状态
export let warn: any;
let delimiters;
let transforms;
let preTransforms;
let postTransforms;
let platformIsPreTag;
let platformMustUseProp;
let platformGetTagNamespace;
let maybeComponent;

/* => 创建 AST 元素 */
export function createASTElement(tag: string, attrs: Array<ASTAttr>, parent: ASTElement | void): ASTElement {
  // => type: 1 普通元素节点 / attrsList 属性数组 / attrsMap 属性对象（将属性数组转化成对象）
  return { type: 1, tag, attrsList: attrs, attrsMap: makeAttrsMap(attrs), rawAttrsMap: {}, parent, children: [] };
}

/* => 将 HTML 字符串转换为 AST */
export function parse(template: string, options: CompilerOptions): ASTElement | void {
  warn = options.warn || baseWarn;

  platformIsPreTag = options.isPreTag || no;
  platformMustUseProp = options.mustUseProp || no;
  platformGetTagNamespace = options.getTagNamespace || no;
  const isReservedTag = options.isReservedTag || no;
  maybeComponent = (el: ASTElement) => !!el.component || !isReservedTag(el.tag);

  /* => 摘下模块功能 */
  transforms = pluckModuleFunction(options.modules, 'transformNode');
  preTransforms = pluckModuleFunction(options.modules, 'preTransformNode');
  postTransforms = pluckModuleFunction(options.modules, 'postTransformNode');

  /* => 分隔符 */
  delimiters = options.delimiters;

  // => 栈维护
  const stack = [];

  const preserveWhitespace = options.preserveWhitespace !== false;
  const whitespaceOption = options.whitespace;
  let root;
  let currentParent;
  let inVPre = false;
  let inPre = false;
  let warned = false;

  /* => 警告一次 */
  function warnOnce(msg, range) {
    if (!warned) {
      warned = true;
      warn(msg, range);
    }
  }

  /* => 关闭元素 */
  function closeElement(element) {
    // => 去除空白
    trimEndingWhitespace(element);

    // => 处理元素
    if (!inVPre && !element.processed) element = processElement(element, options);

    // => DOM 树管理
    if (!stack.length && element !== root) {
      // => 允许根元素使用 v-if 、 v-else-if 和 v-else
      if (root.if && (element.elseif || element.else)) {
        if (process.env.NODE_ENV !== 'production') {
          checkRootConstraints(element);
        }

        //  => 添加 if 条件
        addIfCondition(root, { exp: element.elseif, block: element });
      } else if (process.env.NODE_ENV !== 'production') {
        // => 组件模板应仅包含一个根元素。如果对多个元素使用 v-if ，请改为使用 v-else-if 进行链接
        warnOnce(
          `Component template should contain exactly one root element. ` +
            `If you are using v-if on multiple elements, ` +
            `use v-else-if to chain them instead.`,
          { start: element.start },
        );
      }
    }

    if (currentParent && !element.forbidden) {
      if (element.elseif || element.else) {
        processIfConditions(element, currentParent);
      } else {
        if (element.slotScope) {
          // => 作用域插槽，将其保留在子列表中，以便 v-else(-if) 条件可以将其作为 prev 节点查找。
          const name = element.slotTarget || '"default"';
          (currentParent.scopedSlots || (currentParent.scopedSlots = {}))[name] = element;
        }
        currentParent.children.push(element);
        element.parent = currentParent;
      }
    }

    // => 最后清理 children ，过滤出作用域槽
    element.children = element.children.filter((c) => !(c: any).slotScope);

    // => 再次删除尾随空白节点
    trimEndingWhitespace(element);

    // => 检查之前的状态
    if (element.pre) inVPre = false;

    if (platformIsPreTag(element.tag)) inPre = false;

    // => 应用转化后
    for (let i = 0; i < postTransforms.length; i++) postTransforms[i](element, options);
  }

  /* => 调整结束的空白 */
  function trimEndingWhitespace(el) {
    // => 删除尾随空白节点
    if (!inPre) {
      let lastNode;
      while ((lastNode = el.children[el.children.length - 1]) && lastNode.type === 3 && lastNode.text === ' ') {
        el.children.pop();
      }
    }
  }

  /* => 检查根约束 */
  function checkRootConstraints(el) {
    if (el.tag === 'slot' || el.tag === 'template') {
      /* => 不能使用 el.tag 作为组件根元素，因为它可能包含多个节点。 */
      warnOnce(`Cannot use <${el.tag}> as component root element because it may contain multiple nodes.`, { start: el.start });
    }

    if (el.attrsMap.hasOwnProperty('v-for')) {
      /* => 不能在有状态组件根元素上使用 v-for，因为它渲染多个元素。 */
      warnOnce('Cannot use v-for on stateful component root element because it renders multiple elements.', el.rawAttrsMap['v-for']);
    }
  }

  /* => 解析 HTML */
  parseHTML(template, {
    warn,
    expectHTML: options.expectHTML,
    isUnaryTag: options.isUnaryTag,
    canBeLeftOpenTag: options.canBeLeftOpenTag,
    shouldDecodeNewlines: options.shouldDecodeNewlines,
    shouldDecodeNewlinesForHref: options.shouldDecodeNewlinesForHref,
    shouldKeepComment: options.comments,
    outputSourceRange: options.outputSourceRange,

    /**
     * 开始标签钩子函数
     *
     * @param {*} tag    => 标签名
     * @param {*} attrs  => 属性
     * @param {*} unary  => 自闭合标签标识
     * @param {*} start  => 开始位置
     * @param {*} end    => 结束位置
     */
    start(tag, attrs, unary, start, end) {
      // => 检查名称空间，如果有父级的 ns，则继承它（ XML ），第一次触发 start 钩子函数时，currentParent 当前元素的父级是没有的
      const ns = (currentParent && currentParent.ns) || platformGetTagNamespace(tag);

      // => 处理 IE 中 SVG 的 Bug
      if (isIE && ns === 'svg') attrs = guardIESVGBug(attrs);

      // => 创建元素类型的 AST 节点（ type: 1 ）
      let element: ASTElement = createASTElement(tag, attrs, currentParent);

      if (ns) element.ns = ns;

      if (process.env.NODE_ENV !== 'production') {
        if (options.outputSourceRange) {
          element.start = start;
          element.end = end;
          element.rawAttrsMap = element.attrsList.reduce((cumulated, attr) => {
            cumulated[attr.name] = attr;
            return cumulated;
          }, {});
        }
        attrs.forEach((attr) => {
          if (invalidAttributeRE.test(attr.name)) {
            // => 动态参数表达式无效：属性名称不能包含空格 / 引号 / < / > / / / =
            warn(`Invalid dynamic argument expression: attribute names cannot contain spaces, quotes, <, >, / or =.`, {
              start: attr.start + attr.name.indexOf(`[`),
              end: attr.start + attr.name.length,
            });
          }
        });
      }

      if (isForbiddenTag(element) && !isServerRendering()) {
        element.forbidden = true;
        // => 模板仅应负责将状态映射到 UI 。避免在模板中放置带有副作用的标签，例如 tag ，因为它们不会被解析
        process.env.NODE_ENV !== 'production' &&
          warn(
            'Templates should only be responsible for mapping the state to the ' +
              'UI. Avoid placing tags with side-effects in your templates, such as ' +
              `<${tag}>` +
              ', as they will not be parsed.',
            { start: element.start },
          );
      }

      // => 调用 pre-transforms 处理 input[v-model]
      for (let i = 0; i < preTransforms.length; i++) {
        element = preTransforms[i](element, options) || element;
      }

      if (!inVPre) {
        processPre(element);
        if (element.pre) inVPre = true;
      }

      if (platformIsPreTag(element.tag)) inPre = true;

      if (inVPre) {
        processRawAttrs(element);
      } else if (!element.processed) {
        // => 结构指令
        processFor(element);
        processIf(element);
        processOnce(element);
      }

      // => 在第一次触发 start 钩子函数时，root 不存在，当前元素即为根元素
      if (!root) {
        root = element;
        if (process.env.NODE_ENV !== 'production') checkRootConstraints(root);
      }

      // => 非自闭合标签
      if (!unary) {
        // => 第一次触发时，当前元素的父级就是自身
        currentParent = element;

        // => 维护栈，保证 HTML 的层级关系
        stack.push(element);
      } else {
        closeElement(element);
      }
    },

    end(tag, start, end) {
      const element = stack[stack.length - 1];

      // => 出栈
      stack.length -= 1;

      // => 更新当前元素的父级为栈顶元素
      currentParent = stack[stack.length - 1];
      if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) element.end = end;

      closeElement(element);
    },

    chars(text: string, start: number, end: number) {
      if (!currentParent) {
        if (process.env.NODE_ENV !== 'production') {
          if (text === template) {
            // => 组件模板需要一个根元素，而不仅仅是文本。
            warnOnce('Component template requires a root element, rather than just text.', { start });
          } else if ((text = text.trim())) {
            // => 根元素之外的文本 text 将被忽略。
            warnOnce(`text "${text}" outside root element will be ignored.`, { start });
          }
        }

        return;
      }

      // IE textarea placeholder bug
      if (isIE && currentParent.tag === 'textarea' && currentParent.attrsMap.placeholder === text) return;

      // => 当前节点的父节点
      const children = currentParent.children;

      if (inPre || text.trim()) {
        text = isTextTag(currentParent) ? text : decodeHTMLCached(text);
      } else if (!children.length) {
        // => 在打开标记之后立即删除空白节点
        text = '';
      } else if (whitespaceOption) {
        // => 在凝聚模式下，删除空白节点(如果它包含换行符)，否则凝聚为单个空间
        if (whitespaceOption === 'condense') {
          text = lineBreakRE.test(text) ? '' : ' ';
        } else {
          text = ' ';
        }
      } else {
        text = preserveWhitespace ? ' ' : '';
      }

      if (text) {
        // => 将连续的空白压缩为单个空间
        if (!inPre && whitespaceOption === 'condense') text = text.replace(whitespaceRE, ' ');

        let res;
        let child: ?ASTNode;

        // => 使用文本解析器 -> 解析插值表达式 {{ name }} => _s(name)
        if (!inVPre && text !== ' ' && (res = parseText(text, delimiters))) {
          child = { type: 2, expression: res.expression, tokens: res.tokens, text };
        } else if (text !== ' ' || !children.length || children[children.length - 1].text !== ' ') {
          // => 标识普通文本节点
          child = { type: 3, text };
        }

        if (child) {
          if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
            child.start = start;
            child.end = end;
          }

          // => 将构建的 AST 存入父级的 children 属性：<div> {{ name }} </div>
          children.push(child);
        }
      }
    },

    comment(text: string, start, end) {
      // => 禁止在根节点中添加任何兄弟节点，注释仍然是允许的，但是可以忽略
      if (currentParent) {
        // => 标识注释节点
        const child: ASTText = { type: 3, text, isComment: true };

        if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
          child.start = start;
          child.end = end;
        }

        // => 添加至父级的子节点集合中
        currentParent.children.push(child);
      }
    },
  });

  // => 返回 AST （使用普通对象描述 DOM 节点）
  return root;
}

function processPre(el) {
  if (getAndRemoveAttr(el, 'v-pre') != null) {
    el.pre = true;
  }
}

function processRawAttrs(el) {
  const list = el.attrsList;
  const len = list.length;
  if (len) {
    const attrs: Array<ASTAttr> = (el.attrs = new Array(len));
    for (let i = 0; i < len; i++) {
      attrs[i] = {
        name: list[i].name,
        value: JSON.stringify(list[i].value),
      };
      if (list[i].start != null) {
        attrs[i].start = list[i].start;
        attrs[i].end = list[i].end;
      }
    }
  } else if (!el.pre) {
    // non root node in pre blocks with no attributes
    el.plain = true;
  }
}

/* => 处理元素 */
export function processElement(element: ASTElement, options: CompilerOptions) {
  // => 处理 key 值
  processKey(element);

  // => 删除结构属性后确定这是否是普通元素（不存在动态属性等等则为普通元素）
  element.plain = !element.key && !element.scopedSlots && !element.attrsList.length;

  processRef(element);
  processSlotContent(element);
  processSlotOutlet(element);
  processComponent(element);
  for (let i = 0; i < transforms.length; i++) {
    element = transforms[i](element, options) || element;
  }
  processAttrs(element);
  return element;
}

function processKey(el) {
  const exp = getBindingAttr(el, 'key');
  if (exp) {
    if (process.env.NODE_ENV !== 'production') {
      if (el.tag === 'template') {
        // => <template> 不能被设置 key。而是将键放在真实元素上
        warn(`<template> cannot be keyed. Place the key on real elements instead.`, getRawBindingAttr(el, 'key'));
      }
      if (el.for) {
        const iterator = el.iterator2 || el.iterator1;
        const parent = el.parent;
        if (iterator && iterator === exp && parent && parent.tag === 'transition-group') {
          // => 不要将 v-for 索引用作 <transition-group> 子代上的键，这与不使用键相同
          warn(
            `Do not use v-for index as key on <transition-group> children, this is the same as not using keys.`,
            getRawBindingAttr(el, 'key'),
            true /* tip */,
          );
        }
      }
    }
    el.key = exp;
  }
}

function processRef(el) {
  const ref = getBindingAttr(el, 'ref');
  if (ref) {
    el.ref = ref;
    el.refInFor = checkInFor(el);
  }
}

export function processFor(el: ASTElement) {
  let exp;
  // => 拿到 v-for 属性值
  if ((exp = getAndRemoveAttr(el, 'v-for'))) {
    // => 解析 v-for
    const res = parseFor(exp);
    if (res) {
      // => 扩展到 el 上
      extend(el, res);
    } else if (process.env.NODE_ENV !== 'production') {
      // => v-for 表达式无效
      warn(`Invalid v-for expression: ${exp}`, el.rawAttrsMap['v-for']);
    }
  }
}

type ForParseResult = { for: string, alias: string, iterator1?: string, iterator2?: string };

export function parseFor(exp: string): ?ForParseResult {
  // => 匹配分组 v-for="(item, index) in data" -> [(item, index) in data, (item, index), data]
  const inMatch = exp.match(forAliasRE);
  if (!inMatch) return;
  const res = {};

  // => 分组索引为 2 的项就是循环对象
  res.for = inMatch[2].trim();

  // => 去除 () -> (item, index) -> item, index
  const alias = inMatch[1].trim().replace(stripParensRE, '');

  // => 以逗号 , 分组
  const iteratorMatch = alias.match(forIteratorRE);
  if (iteratorMatch) {
    // => 拿到 item
    res.alias = alias.replace(forIteratorRE, '').trim();

    // => 拿到 index
    res.iterator1 = iteratorMatch[1].trim();

    // => 有可能有第三个
    if (iteratorMatch[2]) res.iterator2 = iteratorMatch[2].trim();
  } else {
    res.alias = alias;
  }
  return res;
}

function processIf(el) {
  // => 获取 v-if 的属性值
  const exp = getAndRemoveAttr(el, 'v-if');

  if (exp) {
    // => 添加到元素 el 上
    el.if = exp;

    // => 添加到 if 收集池
    addIfCondition(el, { exp: exp, block: el });
  } else {
    // => 可能是使用的 v-else ，v-else 没有属性值，于是标识为布尔值
    if (getAndRemoveAttr(el, 'v-else') != null) el.else = true;

    // 获取 v-else-if 的属性值并添加到 el 上
    const elseif = getAndRemoveAttr(el, 'v-else-if');
    if (elseif) el.elseif = elseif;
  }
}

function processIfConditions(el, parent) {
  const prev = findPrevElement(parent.children);
  if (prev && prev.if) {
    addIfCondition(prev, { exp: el.elseif, block: el });
  } else if (process.env.NODE_ENV !== 'production') {
    warn(
      `v-${el.elseif ? 'else-if="' + el.elseif + '"' : 'else'} used on element <${el.tag}> without corresponding v-if.`,
      el.rawAttrsMap[el.elseif ? 'v-else-if' : 'v-else'],
    );
  }
}

function findPrevElement(children: Array<any>): ASTElement | void {
  let i = children.length;
  while (i--) {
    if (children[i].type === 1) {
      return children[i];
    } else {
      if (process.env.NODE_ENV !== 'production' && children[i].text !== ' ') {
        warn(`text "${children[i].text.trim()}" between v-if and v-else(-if) will be ignored.`, children[i]);
      }
      children.pop();
    }
  }
}

export function addIfCondition(el: ASTElement, condition: ASTIfCondition) {
  if (!el.ifConditions) el.ifConditions = [];

  el.ifConditions.push(condition);
}

function processOnce(el) {
  // => 获取 v-once 属性值，在 el 上标识
  const once = getAndRemoveAttr(el, 'v-once');
  if (once != null) el.once = true;
}

// => 处理作为插槽传递给组件的内容，例如：<template slot="xxx">, <div slot-scope="xxx">
function processSlotContent(el) {
  let slotScope;
  if (el.tag === 'template') {
    slotScope = getAndRemoveAttr(el, 'scope');
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && slotScope) {
      warn(
        `the "scope" attribute for scoped slots have been deprecated and ` +
          `replaced by "slot-scope" since 2.5. The new "slot-scope" attribute ` +
          `can also be used on plain elements in addition to <template> to ` +
          `denote scoped slots.`,
        el.rawAttrsMap['scope'],
        true,
      );
    }
    el.slotScope = slotScope || getAndRemoveAttr(el, 'slot-scope');
  } else if ((slotScope = getAndRemoveAttr(el, 'slot-scope'))) {
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && el.attrsMap['v-for']) {
      warn(
        `Ambiguous combined usage of slot-scope and v-for on <${el.tag}> ` +
          `(v-for takes higher priority). Use a wrapper <template> for the ` +
          `scoped slot to make it clearer.`,
        el.rawAttrsMap['slot-scope'],
        true,
      );
    }
    el.slotScope = slotScope;
  }

  // slot="xxx"
  const slotTarget = getBindingAttr(el, 'slot');
  if (slotTarget) {
    el.slotTarget = slotTarget === '""' ? '"default"' : slotTarget;
    el.slotTargetDynamic = !!(el.attrsMap[':slot'] || el.attrsMap['v-bind:slot']);
    // preserve slot as an attribute for native shadow DOM compat
    // only for non-scoped slots.
    if (el.tag !== 'template' && !el.slotScope) {
      addAttr(el, 'slot', slotTarget, getRawBindingAttr(el, 'slot'));
    }
  }

  // 2.6 v-slot syntax
  if (process.env.NEW_SLOT_SYNTAX) {
    if (el.tag === 'template') {
      // v-slot on <template>
      const slotBinding = getAndRemoveAttrByRegex(el, slotRE);
      if (slotBinding) {
        if (process.env.NODE_ENV !== 'production') {
          if (el.slotTarget || el.slotScope) {
            warn(`Unexpected mixed usage of different slot syntaxes.`, el);
          }
          if (el.parent && !maybeComponent(el.parent)) {
            warn(`<template v-slot> can only appear at the root level inside ` + `the receiving component`, el);
          }
        }
        const { name, dynamic } = getSlotName(slotBinding);
        el.slotTarget = name;
        el.slotTargetDynamic = dynamic;
        el.slotScope = slotBinding.value || emptySlotScopeToken; // force it into a scoped slot for perf
      }
    } else {
      // v-slot on component, denotes default slot
      const slotBinding = getAndRemoveAttrByRegex(el, slotRE);
      if (slotBinding) {
        if (process.env.NODE_ENV !== 'production') {
          if (!maybeComponent(el)) {
            warn(`v-slot can only be used on components or <template>.`, slotBinding);
          }
          if (el.slotScope || el.slotTarget) {
            warn(`Unexpected mixed usage of different slot syntaxes.`, el);
          }
          if (el.scopedSlots) {
            warn(
              `To avoid scope ambiguity, the default slot should also use ` + `<template> syntax when there are other named slots.`,
              slotBinding,
            );
          }
        }
        // add the component's children to its default slot
        const slots = el.scopedSlots || (el.scopedSlots = {});
        const { name, dynamic } = getSlotName(slotBinding);
        const slotContainer = (slots[name] = createASTElement('template', [], el));
        slotContainer.slotTarget = name;
        slotContainer.slotTargetDynamic = dynamic;
        slotContainer.children = el.children.filter((c: any) => {
          if (!c.slotScope) {
            c.parent = slotContainer;
            return true;
          }
        });
        slotContainer.slotScope = slotBinding.value || emptySlotScopeToken;
        // remove children as they are returned from scopedSlots now
        el.children = [];
        // mark el non-plain so data gets generated
        el.plain = false;
      }
    }
  }
}

function getSlotName(binding) {
  let name = binding.name.replace(slotRE, '');
  if (!name) {
    if (binding.name[0] !== '#') {
      name = 'default';
    } else if (process.env.NODE_ENV !== 'production') {
      warn(`v-slot shorthand syntax requires a slot name.`, binding);
    }
  }
  return dynamicArgRE.test(name)
    ? // dynamic [name]
      { name: name.slice(1, -1), dynamic: true }
    : // static name
      { name: `"${name}"`, dynamic: false };
}

// handle <slot/> outlets
function processSlotOutlet(el) {
  if (el.tag === 'slot') {
    el.slotName = getBindingAttr(el, 'name');
    if (process.env.NODE_ENV !== 'production' && el.key) {
      warn(
        `\`key\` does not work on <slot> because slots are abstract outlets ` +
          `and can possibly expand into multiple elements. ` +
          `Use the key on a wrapping element instead.`,
        getRawBindingAttr(el, 'key'),
      );
    }
  }
}

function processComponent(el) {
  let binding;

  // => 内置组件 component 有动态属性 is
  if ((binding = getBindingAttr(el, 'is'))) el.component = binding;

  // => 确定是否为内联模板
  if (getAndRemoveAttr(el, 'inline-template') != null) el.inlineTemplate = true;
}

/* => 解析指令， v- / @ / : / # 开头的属性（v-model、v-on、v-bind、v-slot） */
function processAttrs(el) {
  const list = el.attrsList;
  let i, l, name, rawName, value, modifiers, syncGen, isDynamic;

  for (i = 0, l = list.length; i < l; i++) {
    name = rawName = list[i].name;
    value = list[i].value;

    // => 匹配是否以 v- / @ / : / #
    if (dirRE.test(name)) {
      // => 将元素标记为动态（有属性绑定）
      el.hasBindings = true;

      // => 修饰符，去除指令特征（替换成空格），如：v-bind => bind
      modifiers = parseModifiers(name.replace(dirRE, ''));

      // => 为 .prop 修饰符支持 .foo 速记语法
      if (process.env.VBIND_PROP_SHORTHAND && propBindRE.test(name)) {
        (modifiers || (modifiers = {})).prop = true;
        name = `.` + name.slice(1).replace(modifierRE, '');
      } else if (modifiers) {
        name = name.replace(modifierRE, '');
      }

      if (bindRE.test(name)) {
        // => v-bind
        name = name.replace(bindRE, '');

        // => 解析过滤器
        value = parseFilters(value);

        // => 动态属性名 v-bind:[key]
        isDynamic = dynamicArgRE.test(name);

        // => 截去 [] 剩下 key
        if (isDynamic) name = name.slice(1, -1);

        // => v-bind 表达式的值不能为空。在 v-bind: name 中找到
        if (process.env.NODE_ENV !== 'production' && value.trim().length === 0) {
          warn(`The value for a v-bind expression cannot be empty. Found in "v-bind:${name}"`);
        }

        // => 处理修饰符
        if (modifiers) {
          // => 作为一个 DOM Property （绑定在 DOM 对象上） 绑定而不是作为 Attribute （写在标签里） 绑定
          /**
           * Attribute：特性（可以有自定义的特性）
           * Property：属性（即 HTML 提供的最基本的属性）
           * Attribute 的变化会引起 Property 的变化, 而 Property 的变化也会同步给 Attribute 进行变化（ input 的 value 除外）
           */
          if (modifiers.prop && !isDynamic) {
            name = camelize(name);
            if (name === 'innerHtml') name = 'innerHTML';
          }

          // => 将 kebab-case attribute 名转换为 camelCase
          if (modifiers.camel && !isDynamic) name = camelize(name);

          // => 语法糖，会扩展成一个更新父组件绑定值的 v-on 侦听器
          if (modifiers.sync) {
            syncGen = genAssignmentCode(value, `$event`);
            if (!isDynamic) {
              addHandler(el, `update:${camelize(name)}`, syncGen, null, false, warn, list[i]);

              // => key-came 与 keyCame
              if (hyphenate(name) !== camelize(name)) addHandler(el, `update:${hyphenate(name)}`, syncGen, null, false, warn, list[i]);
            } else {
              // => 具有动态事件名称的处理程序
              addHandler(el, `"update:"+(${name})`, syncGen, null, false, warn, list[i], true /* => dynamic */);
            }
          }
        }

        if ((modifiers && modifiers.prop) || (!el.component && platformMustUseProp(el.tag, el.attrsMap.type, name))) {
          // => 组件 props
          addProp(el, name, value, list[i], isDynamic);
        } else {
          // => 普通 attrs
          addAttr(el, name, value, list[i], isDynamic);
        }
      } else if (onRE.test(name)) {
        // => v-on
        name = name.replace(onRE, '');
        isDynamic = dynamicArgRE.test(name);
        if (isDynamic) name = name.slice(1, -1);
        addHandler(el, name, value, modifiers, false, warn, list[i], isDynamic);
      } else {
        // => 普通指令（ v-model / v-slot / 自定义指令）
        name = name.replace(dirRE, '');

        // => 解析参数（ v-slot ），如 "slot:header" ，match 后 arg = argMatch[1] = "header"
        const argMatch = name.match(argRE);

        let arg = argMatch && argMatch[1];
        isDynamic = false;

        if (arg) {
          // => 截取后 name = "slot"
          name = name.slice(0, -(arg.length + 1));

          // => 动态属性名
          if (dynamicArgRE.test(arg)) {
            arg = arg.slice(1, -1);
            isDynamic = true;
          }
        }

        // => 添加指令
        addDirective(el, name, rawName, value, arg, isDynamic, modifiers, list[i]);
        if (process.env.NODE_ENV !== 'production' && name === 'model') checkForAliasModel(el, value);
      }
    } else {
      // => 文字属性（HTML attr）
      if (process.env.NODE_ENV !== 'production') {
        const res = parseText(value, delimiters);
        if (res) {
          // => 属性内插值已删除。请改用 v-bind 或冒号速记。例如，使用 <div :id="val"> 代替 <div id="{{ val }}">
          warn(
            `${name}="${value}": ` +
              'Interpolation inside attributes has been removed. ' +
              'Use v-bind or the colon shorthand instead. For example, ' +
              'instead of <div id="{{ val }}">, use <div :id="val">.',
            list[i],
          );
        }
      }

      // => 添加到 attrs
      addAttr(el, name, JSON.stringify(value), list[i]);

      // => 即使在创建元素后立即通过属性设置，firefox 也不会更新静音状态
      if (!el.component && name === 'muted' && platformMustUseProp(el.tag, el.attrsMap.type, name)) addProp(el, name, 'true', list[i]);
    }
  }
}

function checkInFor(el: ASTElement): boolean {
  let parent = el;
  while (parent) {
    if (parent.for !== undefined) return true;
    parent = parent.parent;
  }
  return false;
}

// => 解析修饰符
function parseModifiers(name: string): Object | void {
  // => 如："bind.sync.number" ，match 后有 [".sync", "number"]
  const match = name.match(modifierRE);

  if (match) {
    const ret = {};

    // => 截掉 .
    match.forEach((m) => (ret[m.slice(1)] = true));

    return ret;
  }
}

function makeAttrsMap(attrs: Array<Object>): Object {
  const map = {};
  for (let i = 0, l = attrs.length; i < l; i++) {
    if (process.env.NODE_ENV !== 'production' && map[attrs[i].name] && !isIE && !isEdge) {
      warn('duplicate attribute: ' + attrs[i].name, attrs[i]);
    }
    map[attrs[i].name] = attrs[i].value;
  }
  return map;
}

// => 对于脚本(例如 type="x/template" )或 style ，不要解码内容
function isTextTag(el): boolean {
  return el.tag === 'script' || el.tag === 'style';
}

function isForbiddenTag(el): boolean {
  return el.tag === 'style' || (el.tag === 'script' && (!el.attrsMap.type || el.attrsMap.type === 'text/javascript'));
}

const ieNSBug = /^xmlns:NS\d+/;
const ieNSPrefix = /^NS\d+:/;

function guardIESVGBug(attrs) {
  const res = [];
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i];
    if (!ieNSBug.test(attr.name)) {
      attr.name = attr.name.replace(ieNSPrefix, '');
      res.push(attr);
    }
  }
  return res;
}

function checkForAliasModel(el, value) {
  let _el = el;
  while (_el) {
    // => 您将 v-model 直接绑定到 v-for 迭代别名
    // => 这将无法修改 v-for 源数组，因为写入别名就像修改函数局部变量一样
    // => 考虑使用对象数组，并在对象属性上使用 v-model
    if (_el.for && _el.alias === value) {
      warn(
        `<${el.tag} v-model="${value}">: ` +
          `You are binding v-model directly to a v-for iteration alias. ` +
          `This will not be able to modify the v-for source array because ` +
          `writing to the alias is like modifying a function local variable. ` +
          `Consider using an array of objects and use v-model on an object property instead.`,
        el.rawAttrsMap['v-model'],
      );
    }
    _el = _el.parent;
  }
}
