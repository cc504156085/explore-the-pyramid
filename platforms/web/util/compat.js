import { inBrowser } from 'core/util/index';

// => 检查当前浏览器是否在属性值内部编码了 char
let div;
function getShouldDecode(href: boolean): boolean {
  div = div || document.createElement('div');
  div.innerHTML = href ? `<a href="\n"/>` : `<div a="\n"/>`;
  return div.innerHTML.indexOf('&#10;') > 0;
}

// => IE 在属性值中编码换行符，而其他浏览器则不
export const shouldDecodeNewlines = inBrowser ? getShouldDecode(false) : false;
// => chrome 编码 a[href] 中的内容
export const shouldDecodeNewlinesForHref = inBrowser ? getShouldDecode(true) : false;
