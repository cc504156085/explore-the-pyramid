import attrs from './attrs';
import klass from './class';
import events from './events';
import domProps from './dom-props';
import style from './style';
import transition from './transition';

/* => 所有属性操作（ klass 是故意的，因为不能用 class 作为变量） */
export default [attrs, klass, events, domProps, style, transition];
