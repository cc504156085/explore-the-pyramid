import { makeMap, isBuiltInTag, cached, no } from 'shared/util';

let isStaticKey;
let isPlatformReservedTag;

const genStaticKeysCached = cached(genStaticKeys);

/**
 * => 优化器的目标：遍历模板生成的 AST 树并检测纯静态的子树，即 DOM 中从不需要更改的部分。
 *
 * 一旦我们检测到这些子树，我们就可以：
 * 1.将它们提升为常量，这样我们就不再需要在每次重新渲染时为它们创建新的节点（就地复用、克隆节点）
 * 2.在打补丁的过程中完全跳过它们
 */
export function optimize(root: ?ASTElement, options: CompilerOptions) {
  // => 没有 AST 结束即可
  if (!root) return;

  // => 标记是否为静态属性
  isStaticKey = genStaticKeysCached(options.staticKeys || '');

  // => 标记是否为平台保留标签
  isPlatformReservedTag = options.isReservedTag || no;

  // => 第一步：标记所有非静态节点
  markStatic(root);

  // => 第二步：标记所有静态根节点
  markStaticRoots(root, false);
}

/* => 生成静态 key （静态属性映射表） */
function genStaticKeys(keys: string): Function {
  return makeMap('type,tag,attrsList,attrsMap,plain,parent,children,attrs,start,end,rawAttrsMap' + (keys ? ',' + keys : ''));
}

/* => 标记非静态节点 */
function markStatic(node: ASTNode) {
  // => 判断当前节点是否为静态节点，并在当前 AST 节点上挂载该属性
  node.static = isStatic(node);

  // => 元素节点
  if (node.type === 1) {
    /**
     * => 不要使组件插槽内容为静态。这就避免了：
     * 1.组件不能改变插槽节点
     * 2.静态插槽内容热加载失败
     */
    if (!isPlatformReservedTag(node.tag) && node.tag !== 'slot' && node.attrsMap['inline-template'] == null) return;

    for (let i = 0, l = node.children.length; i < l; i++) {
      // => 递归给当前节点的子节点打标记
      const child = node.children[i];
      markStatic(child);

      // => 如果子节点不是静态节点，则当前节点也不是
      if (!child.static) node.static = false;
    }

    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        const block = node.ifConditions[i].block;
        markStatic(block);
        if (!block.static) node.static = false;
      }
    }
  }
}

/* => 标记静态根节点 */
function markStaticRoots(node: ASTNode, isInFor: boolean) {
  if (node.type === 1) {
    // => 标记 static 的或者带有 v-once 指令的，同时处于 for 循环中的节点
    if (node.static || node.once) node.staticInFor = isInFor;

    // => 要使一个节点符合静态根的条件，它应该有不仅仅是静态文本的子节点。否则，提升的成本将超过收益，最好总是保持新鲜感。
    if (node.static && node.children.length && !(node.children.length === 1 && node.children[0].type === 3)) {
      node.staticRoot = true;

      // => 如果当前节点以及标记为静态根节点，就不会递归标记子节点
      return;
    } else {
      // => 当前节点没有或者只有一个子节点且是文本节点，没必要标记为静态根节点
      node.staticRoot = false;
    }

    // => 递归标记子节点（只有当前节点不是静态根节点时，才自顶向下查找静态根节点）
    if (node.children) {
      for (let i = 0, l = node.children.length; i < l; i++) {
        markStaticRoots(node.children[i], isInFor || !!node.for);
      }
    }

    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        markStaticRoots(node.ifConditions[i].block, isInFor);
      }
    }
  }
}

/* => 判断一个节点是否是 static 的 */
function isStatic(node: ASTNode): boolean {
  // => 带变量的动态文本节点
  if (node.type === 2) return false;

  // => 不带变量的纯文本节点
  if (node.type === 3) return true;

  // => node.type === 1 元素节点
  return !!(
    node.pre || // => 使用了 v-pre
    (!node.hasBindings && // => 没有动态绑定（没有以 @ / : 开头的属性）
      !node.if &&
      !node.for && // => 没有 v-if v-for v-else
      !isBuiltInTag(node.tag) && // => 不是内置标签（ slot / component ）
      isPlatformReservedTag(node.tag) && // => 不是组件（判断标签名是否是 HTML 保留标签）
      !isDirectChildOfTemplateFor(node) && // => 当前节点的父节点不能是带 v-for 指令的 template 标签
      // => 节点中不存在动态节点才会有的属性
      Object.keys(node).every(isStaticKey))
  );
}

function isDirectChildOfTemplateFor(node: ASTElement): boolean {
  while (node.parent) {
    node = node.parent;
    if (node.tag !== 'template') return false;

    // => 带 v-for 的 template 标签
    if (node.for) return true;
  }

  return false;
}
