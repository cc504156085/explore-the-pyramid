/* @flow */

import { makeMap, isBuiltInTag, cached, no } from 'shared/util';

let isStaticKey;
let isPlatformReservedTag;

const genStaticKeysCached = cached(genStaticKeys);

/** => 优化器的目标:遍历模板生成的 AST 树并检测纯静态的子树，即 DOM 中从不需要更改的部分。
 * Goal of the optimizer: walk the generated template AST tree
 * and detect sub-trees that are purely static, i.e. parts of
 * the DOM that never needs to change.
 *
 * => 一旦我们检测到这些子树，我们就可以
 * Once we detect these sub-trees, we can:
 *
 * => 将它们提升为常量，这样我们就不再需要在每次重新渲染时为它们创建新的节点（就地复用、克隆节点）;
 * 1. Hoist them into constants, so that we no longer need to
 *    create fresh nodes for them on each re-render;
 *
 * => 在打补丁的过程中完全跳过它们。
 * 2. Completely skip them in the patching process.
 */
export function optimize(root: ?ASTElement, options: CompilerOptions) {
  if (!root) return;
  isStaticKey = genStaticKeysCached(options.staticKeys || '');
  isPlatformReservedTag = options.isReservedTag || no;

  // first pass: mark all non-static nodes. => 第一遍:标记所有非静态节点。
  markStatic(root);

  // second pass: mark static roots. => 第二步:标记静态根节点。
  markStaticRoots(root, false);
}

function genStaticKeys(keys: string): Function {
  return makeMap(
    'type,tag,attrsList,attrsMap,plain,parent,children,attrs,start,end,rawAttrsMap' +
      (keys ? ',' + keys : ''),
  );
}

function markStatic(node: ASTNode) {
  node.static = isStatic(node);
  if (node.type === 1) {
    // do not make component slot content static. this avoids
    // 1. components not able to mutate slot nodes
    // 2. static slot content fails for hot-reloading
    if (
      !isPlatformReservedTag(node.tag) &&
      node.tag !== 'slot' &&
      node.attrsMap['inline-template'] == null
    ) {
      return;
    }
    for (let i = 0, l = node.children.length; i < l; i++) {
      const child = node.children[i];
      markStatic(child);
      if (!child.static) {
        node.static = false;
      }
    }
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        const block = node.ifConditions[i].block;
        markStatic(block);
        if (!block.static) {
          node.static = false;
        }
      }
    }
  }
}

function markStaticRoots(node: ASTNode, isInFor: boolean) {
  if (node.type === 1) {
    if (node.static || node.once) {
      node.staticInFor = isInFor;
    }
    // For a node to qualify as a static root, it should have children that
    // are not just static text. Otherwise the cost of hoisting out will
    // outweigh the benefits and it's better off to just always render it fresh.
    if (
      node.static &&
      node.children.length &&
      !(node.children.length === 1 && node.children[0].type === 3)
    ) {
      node.staticRoot = true;
      return;
    } else {
      node.staticRoot = false;
    }
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

function isStatic(node: ASTNode): boolean {
  if (node.type === 2) {
    // expression => 带变量的动态文本节点
    return false;
  }
  if (node.type === 3) {
    // text => 不带变量的纯文本节点
    return true;
  }
  return !!(
    node.pre ||
    (!node.hasBindings && // no dynamic bindings => 没有动态绑定
    !node.if &&
    !node.for && // not v-if or v-for or v-else => 没有 v-if v-for v-else
    !isBuiltInTag(node.tag) && // not a built-in => 不是内置标签
    isPlatformReservedTag(node.tag) && // not a component => 不是组件
      !isDirectChildOfTemplateFor(node) &&
      Object.keys(node).every(isStaticKey))
  );
}

function isDirectChildOfTemplateFor(node: ASTElement): boolean {
  while (node.parent) {
    node = node.parent;
    if (node.tag !== 'template') {
      return false;
    }
    if (node.for) {
      return true;
    }
  }
  return false;
}
