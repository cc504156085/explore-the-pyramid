/* @flow */

import { emptyNode } from 'core/vdom/patch';
import { resolveAsset, handleError } from 'core/util/index';
import { mergeVNodeHook } from 'core/vdom/helpers/index';

export default {
  create: updateDirectives,
  update: updateDirectives,
  destroy: function unbindDirectives(vnode: VNodeWithData) {
    updateDirectives(vnode, emptyNode);
  },
};

/* => 更新指令 */
function updateDirectives(oldVnode: VNodeWithData, vnode: VNodeWithData) {
  // => 只要其中一个虚拟节点含有指令，就执行 _update 方法处理指令
  if (oldVnode.data.directives || vnode.data.directives) _update(oldVnode, vnode);
}

function _update(oldVnode, vnode) {
  // => 是否是新创建的节点
  const isCreate = oldVnode === emptyNode;

  // => 当新虚拟节点不存在且旧虚拟节点存在时为 true
  const isDestroy = vnode === emptyNode;

  // => 在模板解析时，指令会从模板的属性中解析出来并存放在 vnode.data.directives 对象中
  const oldDirs = normalizeDirectives(oldVnode.data.directives, oldVnode.context);
  const newDirs = normalizeDirectives(vnode.data.directives, vnode.context);

  // => 保存需要触发 inserted 钩子函数的指令列表
  const dirsWithInsert = [];

  // => 保存需要触发 componentUpdated 钩子函数的指令列表
  const dirsWithPostpatch = [];

  let key, oldDir, dir;
  for (key in newDirs) {
    oldDir = oldDirs[key];
    dir = newDirs[key];
    if (!oldDir) {
      // => 新的指令，触发 bind 钩子函数，新增指令
      callHook(dir, 'bind', vnode, oldVnode);

      // => 如果该指令在注册时设置了 inserted 方法，则将其存入列表（保证执行完所有指令的 bind 方法后再执行指令的 inserted 方法）
      if (dir.def && dir.def.inserted) dirsWithInsert.push(dir);
    } else {
      // => 现有的指令，触发 update 钩子函数
      dir.oldValue = oldDir.value;
      dir.oldArg = oldDir.arg;

      // => 更新指令
      callHook(dir, 'update', vnode, oldVnode);

      // => 如果该指令设置了 componentUpdated 方法，将其存入列表（保证指令所在组件的 VNode 及其子 VNode 全部更新后，再调用 componentUpdated 方法）
      if (dir.def && dir.def.componentUpdated) dirsWithPostpatch.push(dir);
    }
  }

  if (dirsWithInsert.length) {
    // => 执行该函数时才会依次执行每个指令的 inserted 方法
    const callInsert = () => {
      for (let i = 0; i < dirsWithInsert.length; i++) {
        callHook(dirsWithInsert[i], 'inserted', vnode, oldVnode);
      }
    };

    // => 是否是新创建的节点
    if (isCreate) {
      /**
       * 与 VNode 现有的钩子函数合并
       * 当元素插入到父节点时会触发虚拟节点的 inserted 钩子函数
       * 将指令的 inserted 钩子函数推迟到元素插入到父节点之后执行
       * 保证 inserted 方法在元素插入到父节点后再调用
       */
      mergeVNodeHook(vnode, 'insert', callInsert);
    } else {
      callInsert();
    }
  }

  // => 同上（ VNode 在元素更新前触发 prepatch 钩子，正在更新时会触发 update 钩子，更新后会触发 postpatch 钩子）
  if (dirsWithPostpatch.length) {
    // => 虚拟节点更新后再触发指令的 componentUpdated 钩子
    mergeVNodeHook(vnode, 'postpatch', () => {
      for (let i = 0; i < dirsWithPostpatch.length; i++) {
        callHook(dirsWithPostpatch[i], 'componentUpdated', vnode, oldVnode);
      }
    });
  }

  // => 如果是新创建的节点，不需要解绑
  if (!isCreate) {
    for (key in oldDirs) {
      // => 指令不再存在，解除绑定
      if (!newDirs[key]) callHook(oldDirs[key], 'unbind', oldVnode, oldVnode, isDestroy);
    }
  }
}

const emptyModifiers = Object.create(null);

/* => 规范化指令 */
function normalizeDirectives(dirs: ?Array<VNodeDirective>, vm: Component): { [key: string]: VNodeDirective } {
  const res = Object.create(null);
  if (!dirs) return res;

  let i, dir;
  for (i = 0; i < dirs.length; i++) {
    dir = dirs[i];
    if (!dir.modifiers) dir.modifiers = emptyModifiers;

    res[getRawDirName(dir)] = dir;
    dir.def = resolveAsset(vm.$options, 'directives', dir.name, true);
  }

  return res;
}

/* => 获取原生指令名称 */
function getRawDirName(dir: VNodeDirective): string {
  return dir.rawName || `${dir.name}.${Object.keys(dir.modifiers || {}).join('.')}`;
}

/**
 * 调用钩子
 *
 * @param {*} dir       => 指令对象
 * @param {*} hook      => 将要触发的钩子函数名
 * @param {*} vnode     => 新虚拟节点
 * @param {*} oldVnode  => 旧虚拟节点
 * @param {*} isDestroy => 当新虚拟节点不存在且旧虚拟节点存在时为 true
 */
function callHook(dir, hook, vnode, oldVnode, isDestroy) {
  // => 取出钩子函数
  const fn = dir.def && dir.def[hook];

  if (fn) {
    try {
      fn(vnode.elm, dir, vnode, oldVnode, isDestroy);
    } catch (e) {
      handleError(e, vnode.context, `directive ${dir.name} ${hook} hook`);
    }
  }
}
