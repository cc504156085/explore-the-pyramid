/** => 基于Snabbdom的虚拟DOM修补算法 （Snabbdom由 jQuery之父 西蒙·弗里斯·文杜姆 所写）
 * Virtual DOM patching algorithm based on Snabbdom by
 * Simon Friis Vindum (@paldepind)
 * Licensed under the MIT License
 * https://github.com/paldepind/snabbdom/blob/master/LICENSE
 *
 * modified by Evan You (@yyx990803) => 由尤雨溪修改
 *
 * => 不进行类型检查，因为此文件是perf-critical文件，并且使flow理解它的成本不值得。
 * Not type-checking this because this file is perf-critical and the cost
 * of making flow understand it is not worth it.
 */

import VNode, { cloneVNode } from './vnode';
import config from '../config';
import { SSR_ATTR } from 'shared/constants';
import { registerRef } from './modules/ref';
import { traverse } from '../observer/traverse';
import { activeInstance } from '../instance/lifecycle';
import { isTextInputType } from 'web/util/element';

import { warn, isDef, isUndef, isTrue, makeMap, isRegExp, isPrimitive } from '../util/index';

export const emptyNode = new VNode('', {}, []);

const hooks = ['create', 'activate', 'update', 'remove', 'destroy'];

/* => 两个节点是否相同 分别比较他们的 key / tag / comment / data / inputType ... */
function sameVnode(a, b) {
  return (
    a.key === b.key &&
    ((a.tag === b.tag &&
      a.isComment === b.isComment &&
      isDef(a.data) === isDef(b.data) &&
      sameInputType(a, b)) ||
      (isTrue(a.isAsyncPlaceholder) &&
        a.asyncFactory === b.asyncFactory &&
        isUndef(b.asyncFactory.error)))
  );
}

/* => 输入框的类型是否相同 */
function sameInputType(a, b) {
  if (a.tag !== 'input') return true;
  let i;
  const typeA = isDef((i = a.data)) && isDef((i = i.attrs)) && i.type;
  const typeB = isDef((i = b.data)) && isDef((i = i.attrs)) && i.type;
  return typeA === typeB || (isTextInputType(typeA) && isTextInputType(typeB));
}

/* => 创建 old 节点的索引的key（默认就是dom节点的索引） */
/* => 所以一般不建议用 v-for="(item,index) in list" 中的 index 作为 :key 的值 */
/* => 参数：old 节点子节点、old 节点开始索引、old 节点结束索引 */
function createKeyToOldIdx(children, beginIdx, endIdx) {
  let i, key;
  const map = {};
  for (i = beginIdx; i <= endIdx; ++i) {
    /* => 如果当前子节点定义了key，则将当前索引值一一对应 */
    key = children[i].key;
    if (isDef(key)) map[key] = i;
  }
  return map;
}

/* 返回一个 patch 函数 */
export function createPatchFunction(backend) {
  let i, j;
  const cbs = {};

  const { modules, nodeOps } = backend;

  for (i = 0; i < hooks.length; ++i) {
    cbs[hooks[i]] = [];
    for (j = 0; j < modules.length; ++j) {
      if (isDef(modules[j][hooks[i]])) {
        cbs[hooks[i]].push(modules[j][hooks[i]]);
      }
    }
  }

  /* => 空节点定位 */
  function emptyNodeAt(elm) {
    return new VNode(nodeOps.tagName(elm).toLowerCase(), {}, [], undefined, elm);
  }

  /* => 创建删除回调 */
  function createRmCb(childElm, listeners) {
    function remove() {
      if (--remove.listeners === 0) {
        removeNode(childElm);
      }
    }
    remove.listeners = listeners;
    return remove;
  }

  /* => 删除节点 */
  function removeNode(el) {
    const parent = nodeOps.parentNode(el);
    // element may have already been removed due to v-html / v-text
    if (isDef(parent)) {
      nodeOps.removeChild(parent, el);
    }
  }

  /* => 未知元素 */
  function isUnknownElement(vnode, inVPre) {
    return (
      !inVPre &&
      !vnode.ns &&
      !(
        config.ignoredElements.length &&
        config.ignoredElements.some(ignore => {
          return isRegExp(ignore) ? ignore.test(vnode.tag) : ignore === vnode.tag;
        })
      ) &&
      config.isUnknownElement(vnode.tag)
    );
  }

  let creatingElmInVPre = 0;

  /* => 创建元素 */
  function createElm(vnode, insertedVnodeQueue, parentElm, refElm, nested, ownerArray, index) {
    if (isDef(vnode.elm) && isDef(ownerArray)) {
      // This vnode was used in a previous render!
      // now it's used as a new node, overwriting its elm would cause
      // potential patch errors down the road when it's used as an insertion
      // reference node. Instead, we clone the node on-demand before creating
      // associated DOM element for it.
      vnode = ownerArray[index] = cloneVNode(vnode);
    }

    vnode.isRootInsert = !nested; // for transition enter check
    if (createComponent(vnode, insertedVnodeQueue, parentElm, refElm)) {
      return;
    }

    const data = vnode.data;
    const children = vnode.children;
    const tag = vnode.tag;
    if (isDef(tag)) {
      if (process.env.NODE_ENV !== 'production') {
        if (data && data.pre) {
          creatingElmInVPre++;
        }
        if (isUnknownElement(vnode, creatingElmInVPre)) {
          warn(
            'Unknown custom element: <' +
              tag +
              '> - did you ' +
              'register the component correctly? For recursive components, ' +
              'make sure to provide the "name" option.',
            vnode.context,
          );
        }
      }

      vnode.elm = vnode.ns
        ? nodeOps.createElementNS(vnode.ns, tag)
        : nodeOps.createElement(tag, vnode);
      setScope(vnode);

      /* istanbul ignore if */
      if (__WEEX__) {
        // in Weex, the default insertion order is parent-first.
        // List items can be optimized to use children-first insertion
        // with append="tree".
        const appendAsTree = isDef(data) && isTrue(data.appendAsTree);
        if (!appendAsTree) {
          if (isDef(data)) {
            invokeCreateHooks(vnode, insertedVnodeQueue);
          }
          insert(parentElm, vnode.elm, refElm);
        }
        createChildren(vnode, children, insertedVnodeQueue);
        if (appendAsTree) {
          if (isDef(data)) {
            invokeCreateHooks(vnode, insertedVnodeQueue);
          }
          insert(parentElm, vnode.elm, refElm);
        }
      } else {
        createChildren(vnode, children, insertedVnodeQueue);
        if (isDef(data)) {
          invokeCreateHooks(vnode, insertedVnodeQueue);
        }
        insert(parentElm, vnode.elm, refElm);
      }

      if (process.env.NODE_ENV !== 'production' && data && data.pre) {
        creatingElmInVPre--;
      }
    } else if (isTrue(vnode.isComment)) {
      vnode.elm = nodeOps.createComment(vnode.text);
      insert(parentElm, vnode.elm, refElm);
    } else {
      vnode.elm = nodeOps.createTextNode(vnode.text);
      insert(parentElm, vnode.elm, refElm);
    }
  }

  /* => 创建组件 */
  function createComponent(vnode, insertedVnodeQueue, parentElm, refElm) {
    let i = vnode.data;
    if (isDef(i)) {
      const isReactivated = isDef(vnode.componentInstance) && i.keepAlive;
      if (isDef((i = i.hook)) && isDef((i = i.init))) {
        i(vnode, false /* hydrating */);
      }
      // after calling the init hook, if the vnode is a child component
      // it should've created a child instance and mounted it. the child
      // component also has set the placeholder vnode's elm.
      // in that case we can just return the element and be done.
      if (isDef(vnode.componentInstance)) {
        initComponent(vnode, insertedVnodeQueue);
        insert(parentElm, vnode.elm, refElm);
        if (isTrue(isReactivated)) {
          reactivateComponent(vnode, insertedVnodeQueue, parentElm, refElm);
        }
        return true;
      }
    }
  }

  /* => 初始化组件 */
  function initComponent(vnode, insertedVnodeQueue) {
    if (isDef(vnode.data.pendingInsert)) {
      insertedVnodeQueue.push.apply(insertedVnodeQueue, vnode.data.pendingInsert);
      vnode.data.pendingInsert = null;
    }
    vnode.elm = vnode.componentInstance.$el;
    if (isPatchable(vnode)) {
      invokeCreateHooks(vnode, insertedVnodeQueue);
      setScope(vnode);
    } else {
      // empty component root.
      // skip all element-related modules except for ref (#3455)
      registerRef(vnode);
      // make sure to invoke the insert hook
      insertedVnodeQueue.push(vnode);
    }
  }

  /* => 响应式组件 */
  function reactivateComponent(vnode, insertedVnodeQueue, parentElm, refElm) {
    let i;
    // hack for #4339: a reactivated component with inner transition
    // does not trigger because the inner node's created hooks are not called
    // again. It's not ideal to involve module-specific logic in here but
    // there doesn't seem to be a better way to do it.
    let innerNode = vnode;
    while (innerNode.componentInstance) {
      innerNode = innerNode.componentInstance._vnode;
      if (isDef((i = innerNode.data)) && isDef((i = i.transition))) {
        for (i = 0; i < cbs.activate.length; ++i) {
          cbs.activate[i](emptyNode, innerNode);
        }
        insertedVnodeQueue.push(innerNode);
        break;
      }
    }
    // unlike a newly created component,
    // a reactivated keep-alive component doesn't insert itself
    insert(parentElm, vnode.elm, refElm);
  }

  /* => 插入函数 */
  function insert(parent, elm, ref) {
    if (isDef(parent)) {
      if (isDef(ref)) {
        if (nodeOps.parentNode(ref) === parent) {
          nodeOps.insertBefore(parent, elm, ref);
        }
      } else {
        nodeOps.appendChild(parent, elm);
      }
    }
  }

  /* => 创建子节点 */
  function createChildren(vnode, children, insertedVnodeQueue) {
    if (Array.isArray(children)) {
      if (process.env.NODE_ENV !== 'production') {
        checkDuplicateKeys(children);
      }
      for (let i = 0; i < children.length; ++i) {
        createElm(children[i], insertedVnodeQueue, vnode.elm, null, true, children, i);
      }
    } else if (isPrimitive(vnode.text)) {
      nodeOps.appendChild(vnode.elm, nodeOps.createTextNode(String(vnode.text)));
    }
  }

  /* => 是否可打补丁 */
  function isPatchable(vnode) {
    while (vnode.componentInstance) {
      vnode = vnode.componentInstance._vnode;
    }
    return isDef(vnode.tag);
  }

  /* => 调用创建hook */
  function invokeCreateHooks(vnode, insertedVnodeQueue) {
    for (let i = 0; i < cbs.create.length; ++i) {
      cbs.create[i](emptyNode, vnode);
    }
    i = vnode.data.hook; // Reuse variable
    if (isDef(i)) {
      if (isDef(i.create)) i.create(emptyNode, vnode);
      if (isDef(i.insert)) insertedVnodeQueue.push(vnode);
    }
  }

  // set scope id attribute for scoped CSS. => 为作用域CSS设置作用域id属性。
  // this is implemented as a special case to avoid the overhead => 这是作为特殊情况实现的，以避免性能销毁
  // of going through the normal attribute patching process. => 通过正常的属性修补过程。
  function setScope(vnode) {
    let i;
    if (isDef((i = vnode.fnScopeId))) {
      nodeOps.setStyleScope(vnode.elm, i);
    } else {
      let ancestor = vnode;
      while (ancestor) {
        if (isDef((i = ancestor.context)) && isDef((i = i.$options._scopeId))) {
          nodeOps.setStyleScope(vnode.elm, i);
        }
        ancestor = ancestor.parent;
      }
    }
    // for slot content they should also get the scopeId from the host instance.
    if (
      isDef((i = activeInstance)) &&
      i !== vnode.context &&
      i !== vnode.fnContext &&
      isDef((i = i.$options._scopeId))
    ) {
      nodeOps.setStyleScope(vnode.elm, i);
    }
  }

  /* => 添加节点 */
  function addVnodes(parentElm, refElm, vnodes, startIdx, endIdx, insertedVnodeQueue) {
    for (; startIdx <= endIdx; ++startIdx) {
      createElm(vnodes[startIdx], insertedVnodeQueue, parentElm, refElm, false, vnodes, startIdx);
    }
  }

  /* => 调用销毁hook */
  function invokeDestroyHook(vnode) {
    let i, j;
    const data = vnode.data;
    if (isDef(data)) {
      if (isDef((i = data.hook)) && isDef((i = i.destroy))) i(vnode);
      for (i = 0; i < cbs.destroy.length; ++i) cbs.destroy[i](vnode);
    }
    if (isDef((i = vnode.children))) {
      for (j = 0; j < vnode.children.length; ++j) {
        invokeDestroyHook(vnode.children[j]);
      }
    }
  }

  /* => 删除节点 */
  function removeVnodes(vnodes, startIdx, endIdx) {
    for (; startIdx <= endIdx; ++startIdx) {
      const ch = vnodes[startIdx];
      if (isDef(ch)) {
        if (isDef(ch.tag)) {
          removeAndInvokeRemoveHook(ch);
          invokeDestroyHook(ch);
        } else {
          // Text node
          removeNode(ch.elm);
        }
      }
    }
  }

  /* => 删除和调用删除hook */
  function removeAndInvokeRemoveHook(vnode, rm) {
    if (isDef(rm) || isDef(vnode.data)) {
      let i;
      const listeners = cbs.remove.length + 1;
      if (isDef(rm)) {
        // we have a recursively passed down rm callback
        // increase the listeners count
        rm.listeners += listeners;
      } else {
        // directly removing
        rm = createRmCb(vnode.elm, listeners);
      }
      // recursively invoke hooks on child component root node
      if (isDef((i = vnode.componentInstance)) && isDef((i = i._vnode)) && isDef(i.data)) {
        removeAndInvokeRemoveHook(i, rm);
      }
      for (i = 0; i < cbs.remove.length; ++i) {
        cbs.remove[i](vnode, rm);
      }
      if (isDef((i = vnode.data.hook)) && isDef((i = i.remove))) {
        i(vnode, rm);
      } else {
        rm();
      }
    } else {
      removeNode(vnode.elm);
    }
  }

  /* => 更新子节点（核心），diff算法核心 */
  function updateChildren(parentElm, oldCh, newCh, insertedVnodeQueue, removeOnly) {
    let oldStartIdx = 0; // => old 节点头指针
    let oldEndIdx = oldCh.length - 1; // => old 节点尾指针
    let oldStartVnode = oldCh[0]; // => old 节点头节点
    let oldEndVnode = oldCh[oldEndIdx]; // => old 节点尾指针

    let newStartIdx = 0; // => new 节点头指针
    let newEndIdx = newCh.length - 1; // => new 节点尾指针
    let newStartVnode = newCh[0]; // => new 节点头节点
    let newEndVnode = newCh[newEndIdx]; // => new 节点尾节点

    let oldKeyToIdx, idxInOld, vnodeToMove, refElm;

    /* => removeOnly是一个特殊标志，仅由<transition group>使用，以确保在离开转换期间移除的元素保持在正确的相对位置 */
    // removeOnly is a special flag used only by <transition-group>
    // to ensure removed elements stay in correct relative positions
    // during leaving transitions
    const canMove = !removeOnly;

    /* => 可忽略，开发环境下报告是否含有重复键 */
    if (process.env.NODE_ENV !== 'production') {
      checkDuplicateKeys(newCh);
    }

    /* => 循环遍历（ old 头指针是否小于等于 old 尾指针 和  new 头指针是否小于等于 new 尾指针） */
    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
      if (isUndef(oldStartVnode)) {
        /* => 如果 old 头节点不存在 ===> 将 old 的头结点 => 往右移 */
        oldStartVnode = oldCh[++oldStartIdx]; // Vnode has been moved left => Vnode已左移
      } else if (isUndef(oldEndVnode)) {
        /* => 如果 old 尾结点不存在 ===> 将 old 的尾结点 => 往左移 */
        oldEndVnode = oldCh[--oldEndIdx];
      } else if (sameVnode(oldStartVnode, newStartVnode)) {
        /* => 1.如果 old 头结点和 new 头结点相同（递归打补丁）===> 从左往右比较 */
        patchVnode(oldStartVnode, newStartVnode, insertedVnodeQueue, newCh, newStartIdx);

        /* => 将 old 头结点和 new 头结点 => 往右移 */
        oldStartVnode = oldCh[++oldStartIdx];
        newStartVnode = newCh[++newStartIdx];
      } else if (sameVnode(oldEndVnode, newEndVnode)) {
        /* => 2.如果 old 尾结点和 new 尾结点相同（递归打补丁）===> 从右往左比较 */
        patchVnode(oldEndVnode, newEndVnode, insertedVnodeQueue, newCh, newEndIdx);

        /* => 将 old 尾结点和 new 尾结点 => 往左移 */
        oldEndVnode = oldCh[--oldEndIdx];
        newEndVnode = newCh[--newEndIdx];
      } else if (sameVnode(oldStartVnode, newEndVnode)) {
        // Vnode moved right => Vnode向右移动
        /* => 3.如果 old 头结点和 new 尾结点相同 ===> 将 old 头结点移动到末尾 */
        patchVnode(oldStartVnode, newEndVnode, insertedVnodeQueue, newCh, newEndIdx);

        /* => 参数：父元素、new 节点、参照节点（ old 尾结点的下一个节点） */
        canMove &&
          nodeOps.insertBefore(parentElm, oldStartVnode.elm, nodeOps.nextSibling(oldEndVnode.elm));

        /* => 将 old 头结点 => 往右移 & 将 new 尾结点 => 往左移 */
        oldStartVnode = oldCh[++oldStartIdx];
        newEndVnode = newCh[--newEndIdx];
      } else if (sameVnode(oldEndVnode, newStartVnode)) {
        // Vnode moved left => Vnode向左移动
        /* => 4.如果 old 尾结点和 new 头结点相同 ===> 将 old 尾结点移动到开头 */
        patchVnode(oldEndVnode, newStartVnode, insertedVnodeQueue, newCh, newStartIdx);

        /* => 参数：父元素、new 节点、参照节点（ old 头结点） */
        canMove && nodeOps.insertBefore(parentElm, oldEndVnode.elm, oldStartVnode.elm);

        /* => 将 old 尾结点 => 往左移 && 将 new 头结点 => 往右移 */
        oldEndVnode = oldCh[--oldEndIdx];
        newStartVnode = newCh[++newStartIdx];
      } else {
        /* => 5.以上都不满足（最后一种复杂的情况，比较中间不同） ===> 比较节点的 key 值 */
        /* => 如果 old 节点的 key 不存在，则给它创建一个，该函数返回一个 key - i 对象 */
        if (isUndef(oldKeyToIdx)) oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx);

        /* => 如果 new 节点的头结点的 key 存在，则返回这个节点的索引。否则查找 old 节点的索引 */
        idxInOld = isDef(newStartVnode.key)
          ? oldKeyToIdx[newStartVnode.key]
          : findIdxInOld(newStartVnode, oldCh, oldStartIdx, oldEndIdx);

        /* => 如果不存在 old 节点的索引，则创建新元素 */
        if (isUndef(idxInOld)) {
          // New element => 创建新元素
          createElm(
            newStartVnode,
            insertedVnodeQueue,
            parentElm,
            oldStartVnode.elm,
            false,
            newCh,
            newStartIdx,
          );
        } else {
          /* => 5.1.如果存在，进行移动操作 */
          /* => 拿到 old 子节点中的当前节点 */
          vnodeToMove = oldCh[idxInOld];

          /* => 比较与 new 头节点是否相同（包含key的比较） */
          if (sameVnode(vnodeToMove, newStartVnode)) {
            patchVnode(vnodeToMove, newStartVnode, insertedVnodeQueue, newCh, newStartIdx);

            /* => 如果相同，则移动到 old 节点的头结点前，并且将当前节点置空，方便后续清除 */
            oldCh[idxInOld] = undefined;

            /* => 参数：父元素、new 节点、参照节点（ old 头结点） */
            canMove && nodeOps.insertBefore(parentElm, vnodeToMove.elm, oldStartVnode.elm);
          } else {
            // same key but different element. treat as new element => 相同的键，但不同的元素。视为新元素
            createElm(
              newStartVnode,
              insertedVnodeQueue,
              parentElm,
              oldStartVnode.elm,
              false,
              newCh,
              newStartIdx,
            );
          }
        }

        /* => 将 new 头结点 ===> 往右移 */
        newStartVnode = newCh[++newStartIdx];
      }
    }

    /* => 6.如果 old 头指针超过了 old 尾指针，diff结束，增加新节点（...） */
    if (oldStartIdx > oldEndIdx) {
      refElm = isUndef(newCh[newEndIdx + 1]) ? null : newCh[newEndIdx + 1].elm;
      addVnodes(parentElm, refElm, newCh, newStartIdx, newEndIdx, insertedVnodeQueue);
    } else if (newStartIdx > newEndIdx) {
      /* => 7.如果 new 头指针超过了 new 尾指针，diff结束，从 old 节点中的 old 头指针开始到 old 尾指针结束之间清除节点 */
      removeVnodes(oldCh, oldStartIdx, oldEndIdx);
    }
  }

  /* => 检查重复键 v-for --- key 中的key */
  function checkDuplicateKeys(children) {
    const seenKeys = {};
    for (let i = 0; i < children.length; i++) {
      /* => 获取节点中的key */
      const vnode = children[i];
      const key = vnode.key;

      /* => 如果key存在 */
      if (isDef(key)) {
        /* => 且在缓存对象中已存在，抛出警告 */
        if (seenKeys[key]) {
          /* => 检测到重复键：'${key}'。这可能会导致更新错误。 */
          warn(`Duplicate keys detected: '${key}'. This may cause an update error.`, vnode.context);
        } else {
          /* => 不存在则存入缓存对象，值标记为true */
          seenKeys[key] = true;
        }
      }
    }
  }

  /* => 查找 old 节点的索引 */
  function findIdxInOld(node, oldCh, start, end) {
    for (let i = start; i < end; i++) {
      const c = oldCh[i];
      if (isDef(c) && sameVnode(node, c)) return i;
    }
  }

  /* => 给 VNode 打补丁（核心），diff算法核心 */
  function patchVnode(oldVnode, vnode, insertedVnodeQueue, ownerArray, index, removeOnly) {
    /* => 递归时，如果是静态的节点。（没有动态绑定属性、事件的节点） */
    if (oldVnode === vnode) {
      return;
    }

    if (isDef(vnode.elm) && isDef(ownerArray)) {
      // clone reused vnode => 克隆 new 节点
      vnode = ownerArray[index] = cloneVNode(vnode);
    }

    const elm = (vnode.elm = oldVnode.elm);

    /* => 异步组件处理 */
    if (isTrue(oldVnode.isAsyncPlaceholder)) {
      if (isDef(vnode.asyncFactory.resolved)) {
        hydrate(oldVnode.elm, vnode, insertedVnodeQueue);
      } else {
        vnode.isAsyncPlaceholder = true;
      }
      return;
    }

    /* => 静态节点可复用，会跳过 */
    // reuse element for static trees. => 对静态树重用元素。
    // note we only do this if the vnode is cloned - => 注意，我们只在vnode被克隆时才这样做
    // if the new node is not cloned it means the render functions have been => 如果新节点没有被克隆，这意味着渲染函数已经被热重载api重置
    // reset by the hot-reload-api and we need to do a proper re-render. => 我们需要正确的进行重新渲染。
    if (
      isTrue(vnode.isStatic) &&
      isTrue(oldVnode.isStatic) &&
      vnode.key === oldVnode.key &&
      (isTrue(vnode.isCloned) || isTrue(vnode.isOnce))
    ) {
      vnode.componentInstance = oldVnode.componentInstance;
      return;
    }

    let i;
    const data = vnode.data;
    if (isDef(data) && isDef((i = data.hook)) && isDef((i = i.prepatch))) {
      i(oldVnode, vnode);
    }

    /* => 获取 new old 的子节点 */
    const oldCh = oldVnode.children;
    const ch = vnode.children;

    /* => 属性更新 */
    if (isDef(data) && isPatchable(vnode)) {
      for (i = 0; i < cbs.update.length; ++i) cbs.update[i](oldVnode, vnode);
      if (isDef((i = data.hook)) && isDef((i = i.update))) i(oldVnode, vnode);
    }

    /* => 如果 new 节点不是文本，说明有子节点，做子节点更新操作 */
    if (isUndef(vnode.text)) {
      /* => 1.如果都存在 */
      if (isDef(oldCh) && isDef(ch)) {
        /* => 且两者不相同，直接执行更新子节点操作 */
        if (oldCh !== ch) updateChildren(elm, oldCh, ch, insertedVnodeQueue, removeOnly);

        /* => 2.如果 new 节点的子节点存在，执行增加操作 */
      } else if (isDef(ch)) {
        if (process.env.NODE_ENV !== 'production') {
          checkDuplicateKeys(ch);
        }

        /*=> 如果 old 节点是文本，将其设置为空 */
        if (isDef(oldVnode.text)) nodeOps.setTextContent(elm, '');

        /* => 给当前 old 节点追加 new 节点的子节点 */
        addVnodes(elm, null, ch, 0, ch.length - 1, insertedVnodeQueue);

        /* => 3.如果 old 节点的子节点存在，执行删除操作 */
      } else if (isDef(oldCh)) {
        /* => 从当前 old 节点中删除 new 节点中不存在的子节点 */
        removeVnodes(oldCh, 0, oldCh.length - 1);

        /* => 如果 old 节点是文本节点，将其设置为空 */
      } else if (isDef(oldVnode.text)) {
        nodeOps.setTextContent(elm, '');
      }

      /* => 4.如果 old new 节点中的文本不相等，执行替换操作 */
    } else if (oldVnode.text !== vnode.text) {
      /* => 将 old 节点的文本内容替换成 new 节点的文本内容 */
      nodeOps.setTextContent(elm, vnode.text);
    }

    if (isDef(data)) {
      if (isDef((i = data.hook)) && isDef((i = i.postpatch))) i(oldVnode, vnode);
    }
  }

  /* => 调用插入hook */
  function invokeInsertHook(vnode, queue, initial) {
    // delay insert hooks for component root nodes, invoke them after the
    // element is really inserted
    if (isTrue(initial) && isDef(vnode.parent)) {
      vnode.parent.data.pendingInsert = queue;
    } else {
      for (let i = 0; i < queue.length; ++i) {
        queue[i].data.hook.insert(queue[i]);
      }
    }
  }

  let hydrationBailed = false;

  /* => 在水合过程中可以跳过create hook的模块列表，因为它们已经在客户端上呈现或不需要初始化。 */
  // list of modules that can skip create hook during hydration because they
  // are already rendered on the client or has no need for initialization

  /* => 注意：样式被排除，因为它依赖于初始克隆进行将来的深层更新 */
  // Note: style is excluded because it relies on initial clone for future
  // deep updates (#7063).
  const isRenderedModule = makeMap('attrs,class,staticClass,staticStyle,key');

  /* => 注意：这是一个仅限浏览器的函数，因此我们可以假设elm是DOM节点。 */
  // Note: this is a browser-only function so we can assume elms are DOM nodes.
  function hydrate(elm, vnode, insertedVnodeQueue, inVPre) {
    let i;
    const { tag, data, children } = vnode;
    inVPre = inVPre || (data && data.pre);
    vnode.elm = elm;

    if (isTrue(vnode.isComment) && isDef(vnode.asyncFactory)) {
      vnode.isAsyncPlaceholder = true;
      return true;
    }
    // assert node match
    if (process.env.NODE_ENV !== 'production') {
      if (!assertNodeMatch(elm, vnode, inVPre)) {
        return false;
      }
    }
    if (isDef(data)) {
      if (isDef((i = data.hook)) && isDef((i = i.init))) i(vnode, true /* hydrating */);
      if (isDef((i = vnode.componentInstance))) {
        // child component. it should have hydrated its own tree.
        initComponent(vnode, insertedVnodeQueue);
        return true;
      }
    }
    if (isDef(tag)) {
      if (isDef(children)) {
        // empty element, allow client to pick up and populate children
        if (!elm.hasChildNodes()) {
          createChildren(vnode, children, insertedVnodeQueue);
        } else {
          // v-html and domProps: innerHTML
          if (isDef((i = data)) && isDef((i = i.domProps)) && isDef((i = i.innerHTML))) {
            if (i !== elm.innerHTML) {
              /* istanbul ignore if */
              if (
                process.env.NODE_ENV !== 'production' &&
                typeof console !== 'undefined' &&
                !hydrationBailed
              ) {
                hydrationBailed = true;
                console.warn('Parent: ', elm);
                console.warn('server innerHTML: ', i);
                console.warn('client innerHTML: ', elm.innerHTML);
              }
              return false;
            }
          } else {
            // iterate and compare children lists
            let childrenMatch = true;
            let childNode = elm.firstChild;
            for (let i = 0; i < children.length; i++) {
              if (!childNode || !hydrate(childNode, children[i], insertedVnodeQueue, inVPre)) {
                childrenMatch = false;
                break;
              }
              childNode = childNode.nextSibling;
            }
            // if childNode is not null, it means the actual childNodes list is
            // longer than the virtual children list.
            if (!childrenMatch || childNode) {
              /* istanbul ignore if */
              if (
                process.env.NODE_ENV !== 'production' &&
                typeof console !== 'undefined' &&
                !hydrationBailed
              ) {
                hydrationBailed = true;
                console.warn('Parent: ', elm);
                console.warn('Mismatching childNodes vs. VNodes: ', elm.childNodes, children);
              }
              return false;
            }
          }
        }
      }
      if (isDef(data)) {
        let fullInvoke = false;
        for (const key in data) {
          if (!isRenderedModule(key)) {
            fullInvoke = true;
            invokeCreateHooks(vnode, insertedVnodeQueue);
            break;
          }
        }
        if (!fullInvoke && data['class']) {
          // ensure collecting deps for deep class bindings for future updates
          traverse(data['class']);
        }
      }
    } else if (elm.data !== vnode.text) {
      elm.data = vnode.text;
    }
    return true;
  }

  /* => 断言节点匹配 */
  function assertNodeMatch(node, vnode, inVPre) {
    if (isDef(vnode.tag)) {
      return (
        vnode.tag.indexOf('vue-component') === 0 ||
        (!isUnknownElement(vnode, inVPre) &&
          vnode.tag.toLowerCase() === (node.tagName && node.tagName.toLowerCase()))
      );
    } else {
      return node.nodeType === (vnode.isComment ? 8 : 3);
    }
  }

  /* => 返回一个浏览器中使用的 patch 方法 */
  /* 核心diff算法：通过同层的树节点进行比较，而不是对树的逐层搜索遍历。时间复杂度只有O(n)
   * 比较规则：
   * 1.新 VNode 中有节点不存在时，则从旧 VNode 中删除
   * 2.新 VNode 中有节点而在旧 VNode 中不存在时，则在旧 VNode 中新增
   * 3.如果新旧 VNode 的节点层次都一样，就比较他们的节点类型、属性、内容、子节点等等。发现不同则进行相关操作
   */
  return function patch(oldVnode, vnode, hydrating, removeOnly) {
    /* => isUndefined 是否未定义（null） isDef 是否已定义（非null） */
    /* => 如果 new 节点不存在 */
    if (isUndef(vnode)) {
      /* => 且 old 节点存在，则删除（调用销毁hook，执行第一种规则） */
      if (isDef(oldVnode)) invokeDestroyHook(oldVnode);

      return;
    }

    let isInitialPatch = false;
    const insertedVnodeQueue = [];

    /* => 如果 old 节点不存在，则增加（调用创建元素函数，执行第二种规则） */
    if (isUndef(oldVnode)) {
      // empty mount (likely as component), create new root element => 空挂载（可能是组件），创建新的根元素
      isInitialPatch = true;
      createElm(vnode, insertedVnodeQueue);
    } else {
      /* => 替换操作，执行第三种规则 */

      /* => 判断 old 的节点类型是否存在，如果存在，则说明是 DOM 节点 */
      const isRealElement = isDef(oldVnode.nodeType);

      /* => 如果不是真实 DOM ，且 new old 相同 */
      if (!isRealElement && sameVnode(oldVnode, vnode)) {
        // patch existing root node => 修补现有根节点
        /* => 自定义的补丁操作，比较节点的属性、内容、子节点 ... */
        patchVnode(oldVnode, vnode, insertedVnodeQueue, null, null, removeOnly);
      } else {
        /* => 如果是真实 DOM （服务端渲染相关） */
        if (isRealElement) {
          /* => 挂载到真正的元素检查这是否是服务端渲染的内容，以及我们是否可以执行成功的水合 */
          // mounting to a real element
          // check if this is server-rendered content and if we can perform
          // a successful hydration.
          if (oldVnode.nodeType === 1 && oldVnode.hasAttribute(SSR_ATTR)) {
            oldVnode.removeAttribute(SSR_ATTR);
            hydrating = true;
          }
          if (isTrue(hydrating)) {
            if (hydrate(oldVnode, vnode, insertedVnodeQueue)) {
              invokeInsertHook(vnode, insertedVnodeQueue, true);
              return oldVnode;
            } else if (process.env.NODE_ENV !== 'production') {
              warn(
                'The client-side rendered virtual DOM tree is not matching ' +
                  'server-rendered content. This is likely caused by incorrect ' +
                  'HTML markup, for example nesting block-level elements inside ' +
                  '<p>, or missing <tbody>. Bailing hydration and performing ' +
                  'full client-side render.',
              );
            }
          }
          // either not server-rendered, or hydration failed. => 不是服务端渲染，就是水合失败。x
          // create an empty node and replace it => 创建一个空节点并替换它
          oldVnode = emptyNodeAt(oldVnode);
        }

        // replacing existing element => 替换现有元素

        /* => new old 不相同（替换，执行第三种规则） */
        /*
         * 1.获取 old 节点里的内容（相关信息）
         * 2.根据 old 节点的相关信息，创建 new 节点
         * 3.拿到数据并替换 new 节点里的插值文本（更新数据）
         * 4.销毁 old 节点，将 new 节点渲染
         */

        /* => 获取 old 节点树的根元素（$el），以及它的父节点 */
        const oldElm = oldVnode.elm;
        const parentElm = nodeOps.parentNode(oldElm);

        // create new node => 创建新节点
        createElm(
          vnode,
          insertedVnodeQueue,
          /* => 极为罕见的边缘情况：如果旧元素处于离开转换中，请不要插入。只有在组合transition + keep alive + hooks 时才会发生。 */
          // extremely rare edge case: do not insert if old element is in a
          // leaving transition. Only happens when combining transition +
          // keep-alive + HOCs. (#4590)
          oldElm._leaveCb ? null : parentElm,
          nodeOps.nextSibling(oldElm),
        );

        // update parent placeholder node element, recursively => 递归更新父元素里的占位符节点元素（替换插值文本为真实数据）
        /* => 如果 new 节点的父级存在 */
        if (isDef(vnode.parent)) {
          /* => 拿到父级 */
          let ancestor = vnode.parent;

          /* => 调用可修补函数 */
          const patchable = isPatchable(vnode);
          while (ancestor) {
            for (let i = 0; i < cbs.destroy.length; ++i) {
              cbs.destroy[i](ancestor);
            }
            ancestor.elm = vnode.elm;
            if (patchable) {
              for (let i = 0; i < cbs.create.length; ++i) {
                cbs.create[i](emptyNode, ancestor);
              }
              // #6513
              // invoke insert hooks that may have been merged by create hooks.
              // e.g. for directives that uses the "inserted" hook.
              const insert = ancestor.data.hook.insert;
              if (insert.merged) {
                // start at index 1 to avoid re-invoking component mounted hook
                for (let i = 1; i < insert.fns.length; i++) {
                  insert.fns[i]();
                }
              }
            } else {
              registerRef(ancestor);
            }
            ancestor = ancestor.parent;
          }
        }

        // destroy old node => 销毁 old 节点。在此之前，会存在两个 DOM 树，即 old new 两个DOM节点
        if (isDef(parentElm)) {
          removeVnodes([oldVnode], 0, 0);
        } else if (isDef(oldVnode.tag)) {
          invokeDestroyHook(oldVnode);
        }
      }
    }

    /* => 调用插入hook */
    invokeInsertHook(vnode, insertedVnodeQueue, isInitialPatch);

    /* 返回 new 节点树的根元素（用于追加至页面） */
    return vnode.elm;
  };
}
