/* @flow */

import { emptyObject } from 'shared/util';
import { parseFilters } from './parser/filter-parser';

type Range = { start?: number, end?: number };

export function baseWarn(msg: string, range?: Range) {
  console.error(`[Vue compiler]: ${msg}`);
}

export function pluckModuleFunction<F: Function>(modules: ?Array<Object>, key: string): Array<F> {
  return modules ? modules.map((m) => m[key]).filter((_) => _) : [];
}

export function addProp(el: ASTElement, name: string, value: string, range?: Range, dynamic?: boolean) {
  (el.props || (el.props = [])).push(rangeSetItem({ name, value, dynamic }, range));
  el.plain = false;
}

export function addAttr(el: ASTElement, name: string, value: any, range?: Range, dynamic?: boolean) {
  const attrs = dynamic ? el.dynamicAttrs || (el.dynamicAttrs = []) : el.attrs || (el.attrs = []);
  attrs.push(rangeSetItem({ name, value, dynamic }, range));
  el.plain = false;
}

// => 添加一个原始的 attr (在预转换中使用)
export function addRawAttr(el: ASTElement, name: string, value: any, range?: Range) {
  el.attrsMap[name] = value;
  el.attrsList.push(rangeSetItem({ name, value }, range));
}

export function addDirective(
  el: ASTElement,
  name: string,
  rawName: string,
  value: string,
  arg: ?string,
  isDynamicArg: boolean,
  modifiers: ?ASTModifiers,
  range?: Range,
) {
  (el.directives || (el.directives = [])).push(rangeSetItem({ name, rawName, value, arg, isDynamicArg, modifiers }, range));
  el.plain = false;
}

function prependModifierMarker(symbol: string, name: string, dynamic?: boolean): string {
  // => 将事件标记为已捕获
  return dynamic ? `_p(${name},"${symbol}")` : symbol + name;
}

export function addHandler(
  el: ASTElement,
  name: string,
  value: string,
  modifiers: ?ASTModifiers,
  important?: boolean,
  warn?: ?Function,
  range?: Range,
  dynamic?: boolean,
) {
  modifiers = modifiers || emptyObject;

  // => 警告预防和被动修改
  if (process.env.NODE_ENV !== 'production' && warn && modifiers.prevent && modifiers.passive) {
    // => passive 和 prevent 不能同时使用。 passive 处理程序不能阻止默认事件。
    warn("passive and prevent can't be used together. Passive handler can't prevent default event.", range);
  }

  // => 规范化右击/中击。因为他们实际上并没有触发，这在技术上是特定于浏览器的，但至少现在浏览器是唯一的目标事件有右/中点击。
  if (modifiers.right) {
    if (dynamic) {
      name = `(${name})==='click'?'contextmenu':(${name})`;
    } else if (name === 'click') {
      name = 'contextmenu';
      delete modifiers.right;
    }
  } else if (modifiers.middle) {
    if (dynamic) {
      name = `(${name})==='click'?'mouseup':(${name})`;
    } else if (name === 'click') {
      name = 'mouseup';
    }
  }

  // => 检查捕获修饰符
  if (modifiers.capture) {
    delete modifiers.capture;
    name = prependModifierMarker('!', name, dynamic);
  }

  if (modifiers.once) {
    delete modifiers.once;
    name = prependModifierMarker('~', name, dynamic);
  }

  if (modifiers.passive) {
    delete modifiers.passive;
    name = prependModifierMarker('&', name, dynamic);
  }

  let events;
  if (modifiers.native) {
    delete modifiers.native;
    events = el.nativeEvents || (el.nativeEvents = {});
  } else {
    events = el.events || (el.events = {});
  }

  const newHandler: any = rangeSetItem({ value: value.trim(), dynamic }, range);
  if (modifiers !== emptyObject) newHandler.modifiers = modifiers;

  const handlers = events[name];
  if (Array.isArray(handlers)) {
    important ? handlers.unshift(newHandler) : handlers.push(newHandler);
  } else if (handlers) {
    events[name] = important ? [newHandler, handlers] : [handlers, newHandler];
  } else {
    events[name] = newHandler;
  }

  el.plain = false;
}

export function getRawBindingAttr(el: ASTElement, name: string) {
  return el.rawAttrsMap[':' + name] || el.rawAttrsMap['v-bind:' + name] || el.rawAttrsMap[name];
}

export function getBindingAttr(el: ASTElement, name: string, getStatic?: boolean): ?string {
  const dynamicValue = getAndRemoveAttr(el, ':' + name) || getAndRemoveAttr(el, 'v-bind:' + name);

  if (dynamicValue != null) {
    return parseFilters(dynamicValue);
  } else if (getStatic !== false) {
    const staticValue = getAndRemoveAttr(el, name);
    if (staticValue != null) return JSON.stringify(staticValue);
  }
}

// => 注意：这只会从数组( attrsList )中删除 attr ，因此 processAttrs 不会处理它。
// => 默认情况下，它不会将其从映射( attrsMap )中删除，因为在 codegen 期间需要映射。
export function getAndRemoveAttr(el: ASTElement, name: string, removeFromMap?: boolean): ?string {
  let val;
  if ((val = el.attrsMap[name]) != null) {
    const list = el.attrsList;
    for (let i = 0, l = list.length; i < l; i++) {
      if (list[i].name === name) {
        list.splice(i, 1);
        break;
      }
    }
  }

  if (removeFromMap) delete el.attrsMap[name];

  return val;
}

export function getAndRemoveAttrByRegex(el: ASTElement, name: RegExp) {
  const list = el.attrsList;
  for (let i = 0, l = list.length; i < l; i++) {
    const attr = list[i];
    if (name.test(attr.name)) {
      list.splice(i, 1);
      return attr;
    }
  }
}

function rangeSetItem(item: any, range?: { start?: number, end?: number }) {
  if (range) {
    if (range.start != null) item.start = range.start;
    if (range.end != null) item.end = range.end;
  }

  return item;
}
