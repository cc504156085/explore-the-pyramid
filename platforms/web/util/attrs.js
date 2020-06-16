import { makeMap } from 'shared/util';

// => 这些是为 Web 保留的，因为它们是在模板编译期间直接编译掉的
export const isReservedAttr = makeMap('style,class');

// => 应该使用道具进行绑定的属性
const acceptValue = makeMap('input,textarea,option,select,progress');
export const mustUseProp = (tag: string, type: ?string, attr: string): boolean => {
  return (
    (attr === 'value' && acceptValue(tag) && type !== 'button') ||
    (attr === 'selected' && tag === 'option') ||
    (attr === 'checked' && tag === 'input') ||
    (attr === 'muted' && tag === 'video')
  );
};

export const isEnumeratedAttr = makeMap('contenteditable,draggable,spellcheck');

const isValidContentEditableValue = makeMap('events,caret,typing,plaintext-only');

export const convertEnumeratedValue = (key: string, value: any) => {
  return isFalsyAttrValue(value) || value === 'false'
    ? 'false'
    : // => 允许任意字符串值进行 contenteditable
    key === 'contenteditable' && isValidContentEditableValue(value)
    ? value
    : 'true';
};

export const isBooleanAttr = makeMap(
  'allowfullscreen,async,autofocus,autoplay,checked,compact,controls,declare,' +
    'default,defaultchecked,defaultmuted,defaultselected,defer,disabled,' +
    'enabled,formnovalidate,hidden,indeterminate,inert,ismap,itemscope,loop,multiple,' +
    'muted,nohref,noresize,noshade,novalidate,nowrap,open,pauseonexit,readonly,' +
    'required,reversed,scoped,seamless,selected,sortable,translate,' +
    'truespeed,typemustmatch,visible',
);

export const xlinkNS = 'http://www.w3.org/1999/xlink';

export const isXlink = (name: string): boolean => {
  return name.charAt(5) === ':' && name.slice(0, 5) === 'xlink';
};

export const getXlinkProp = (name: string): string => {
  return isXlink(name) ? name.slice(6, name.length) : '';
};

export const isFalsyAttrValue = (val: any): boolean => {
  return val == null || val === false;
};
