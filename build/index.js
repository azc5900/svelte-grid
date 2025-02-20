(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.Grid = factory());
}(this, (function () { 'use strict';

    function noop() { }
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if ($$scope.dirty === undefined) {
                return lets;
            }
            if (typeof lets === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }
    function update_slot(slot, slot_definition, ctx, $$scope, dirty, get_slot_changes_fn, get_slot_context_fn) {
        const slot_changes = get_slot_changes(slot_definition, $$scope, dirty, get_slot_changes_fn);
        if (slot_changes) {
            const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
            slot.p(slot_context, slot_changes);
        }
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }

    const globals = (typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
            ? globalThis
            : global);
    function outro_and_destroy_block(block, lookup) {
        transition_out(block, 1, 1, () => {
            lookup.delete(block.key);
        });
    }
    function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
        let o = old_blocks.length;
        let n = list.length;
        let i = o;
        const old_indexes = {};
        while (i--)
            old_indexes[old_blocks[i].key] = i;
        const new_blocks = [];
        const new_lookup = new Map();
        const deltas = new Map();
        i = n;
        while (i--) {
            const child_ctx = get_context(ctx, list, i);
            const key = get_key(child_ctx);
            let block = lookup.get(key);
            if (!block) {
                block = create_each_block(key, child_ctx);
                block.c();
            }
            else if (dynamic) {
                block.p(child_ctx, dirty);
            }
            new_lookup.set(key, new_blocks[i] = block);
            if (key in old_indexes)
                deltas.set(key, Math.abs(i - old_indexes[key]));
        }
        const will_move = new Set();
        const did_move = new Set();
        function insert(block) {
            transition_in(block, 1);
            block.m(node, next);
            lookup.set(block.key, block);
            next = block.first;
            n--;
        }
        while (o && n) {
            const new_block = new_blocks[n - 1];
            const old_block = old_blocks[o - 1];
            const new_key = new_block.key;
            const old_key = old_block.key;
            if (new_block === old_block) {
                // do nothing
                next = new_block.first;
                o--;
                n--;
            }
            else if (!new_lookup.has(old_key)) {
                // remove old block
                destroy(old_block, lookup);
                o--;
            }
            else if (!lookup.has(new_key) || will_move.has(new_key)) {
                insert(new_block);
            }
            else if (did_move.has(old_key)) {
                o--;
            }
            else if (deltas.get(new_key) > deltas.get(old_key)) {
                did_move.add(new_key);
                insert(new_block);
            }
            else {
                will_move.add(old_key);
                o--;
            }
        }
        while (o--) {
            const old_block = old_blocks[o];
            if (!new_lookup.has(old_block.key))
                destroy(old_block, lookup);
        }
        while (n)
            insert(new_blocks[n - 1]);
        return new_blocks;
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = on_mount.map(run).filter(is_function);
                if (on_destroy) {
                    on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function throttle(func, timeFrame) {
      let lastTime = 0;
      return function (...args) {
        let now = new Date();
        if (now - lastTime >= timeFrame) {
          func(...args);
          lastTime = now;
        }
      };
    }

    function getRowsCount(items, cols) {
      const getItemsMaxHeight = items.map((val) => {
        const item = val[cols];

        return (item && item.y) + (item && item.h) || 0;
      });

      return Math.max(...getItemsMaxHeight, 1);
    }

    const getColumn = (containerWidth, columns) => {
      const sortColumns = columns.slice().sort((a, b) => a[0] - b[0]);

      const breakpoint = sortColumns.find((value) => {
        const [width] = value;
        return containerWidth <= width;
      });

      if (breakpoint) {
        return breakpoint[1];
      } else {
        return sortColumns[sortColumns.length - 1][1];
      }
    };

    function getContainerHeight(items, yPerPx, cols) {
      return getRowsCount(items, cols) * yPerPx;
    }

    const makeMatrix = (rows, cols) => Array.from(Array(rows), () => new Array(cols)); // make 2d array

    function makeMatrixFromItems(items, _row, _col) {
      let matrix = makeMatrix(_row, _col);

      for (var i = 0; i < items.length; i++) {
        const value = items[i][_col];
        if (value) {
          const { x, y, h } = value;
          const id = items[i].id;
          const w = Math.min(_col, value.w);

          for (var j = y; j < y + h; j++) {
            const row = matrix[j];
            for (var k = x; k < x + w; k++) {
              row[k] = { ...value, id };
            }
          }
        }
      }
      return matrix;
    }

    function findCloseBlocks(items, matrix, curObject) {
      const { h, x, y } = curObject;

      const w = Math.min(matrix[0].length, curObject.w);
      const tempR = matrix.slice(y, y + h);

      let result = [];
      for (var i = 0; i < tempR.length; i++) {
        let tempA = tempR[i].slice(x, x + w);
        result = [...result, ...tempA.map((val) => val.id && val.id !== curObject.id && val.id).filter(Boolean)];
      }

      return [...new Set(result)];
    }

    function makeMatrixFromItemsIgnore(items, ignoreList, _row, _col) {
      let matrix = makeMatrix(_row, _col);
      for (var i = 0; i < items.length; i++) {
        const value = items[i][_col];
        const id = items[i].id;
        const { x, y, h } = value;
        const w = Math.min(_col, value.w);

        if (ignoreList.indexOf(id) === -1) {
          for (var j = y; j < y + h; j++) {
            const row = matrix[j];
            if (row) {
              for (var k = x; k < x + w; k++) {
                row[k] = { ...value, id };
              }
            }
          }
        }
      }
      return matrix;
    }

    function findItemsById(closeBlocks, items) {
      return items.filter((value) => closeBlocks.indexOf(value.id) !== -1);
    }

    function getItemById(id, items) {
      return items.find((value) => value.id === id);
    }

    function findFreeSpaceForItem(matrix, item) {
      const cols = matrix[0].length;
      const w = Math.min(cols, item.w);
      let xNtime = cols - w;
      let getMatrixRows = matrix.length;

      for (var i = 0; i < getMatrixRows; i++) {
        const row = matrix[i];
        for (var j = 0; j < xNtime + 1; j++) {
          const sliceA = row.slice(j, j + w);
          const empty = sliceA.every((val) => val === undefined);
          if (empty) {
            const isEmpty = matrix.slice(i, i + item.h).every((a) => a.slice(j, j + w).every((n) => n === undefined));

            if (isEmpty) {
              return { y: i, x: j };
            }
          }
        }
      }

      return {
        y: getMatrixRows,
        x: 0,
      };
    }

    const getItem = (item, col) => {
      return { ...item[col], id: item.id };
    };

    const updateItem = (elements, active, position, col) => {
      return elements.map((value) => {
        if (value.id === active.id) {
          return { ...value, [col]: { ...value[col], ...position } };
        }
        return value;
      });
    };

    function moveItemsAroundItem(active, items, cols, original, maxRows) {
      // Get current item from the breakpoint
      const activeItem = getItem(active, cols);
      const ids = items.map((value) => value.id).filter((value) => value !== activeItem.id);

      const els = items.filter((value) => value.id !== activeItem.id);

      // Update items
      let newItems = updateItem(items, active, activeItem, cols);

      let matrix = makeMatrixFromItemsIgnore(newItems, ids, getRowsCount(newItems, cols), cols);
      let tempItems = newItems;

      // Exclude resolved elements ids in array
      let exclude = [];

      els.forEach((item) => {
        // Find position for element
        let position = findFreeSpaceForItem(matrix, item[cols]);

        // Only apply maxRows constraint if defined
        if (maxRows !== undefined) {
          position.y = Math.min(position.y, maxRows - item[cols].h);
        }
        position.x = Math.min(position.x, cols - item[cols].w);

        // Exclude item
        exclude.push(item.id);

        tempItems = updateItem(tempItems, item, position, cols);

        // Recreate ids of elements
        let getIgnoreItems = ids.filter((value) => exclude.indexOf(value) === -1);

        // Update matrix for next iteration
        matrix = makeMatrixFromItemsIgnore(tempItems, getIgnoreItems, getRowsCount(tempItems, cols), cols);
      });

      // Return result
      return tempItems;
    }

    function moveItem(active, items, cols, original, maxRows) {
      // Get current item from the breakpoint
      const item = getItem(active, cols);

      // Create matrix from the items except the active
      let matrix = makeMatrixFromItemsIgnore(items, [item.id], getRowsCount(items, cols), cols);
      // Getting the ids of items under active Array<String>
      const closeBlocks = findCloseBlocks(items, matrix, item);
      // Getting the objects of items under active Array<Object>
      let closeObj = findItemsById(closeBlocks, items);
      // Getting whenever of these items is fixed
      const fixed = closeObj.find((value) => value[cols].fixed);

      // If found fixed, reset the active to its original position
      if (fixed) return items;

      // Update items
      items = updateItem(items, active, item, cols);

      // Create matrix of items except close elements
      matrix = makeMatrixFromItemsIgnore(items, closeBlocks, getRowsCount(items, cols), cols);

      // Create temp vars
      let tempItems = items;
      let tempCloseBlocks = closeBlocks;

      // Exclude resolved elements ids in array
      let exclude = [];

      // Iterate over close elements under active item
      closeObj.forEach((item) => {
        // Find position for element
        let position = findFreeSpaceForItem(matrix, item[cols]);

        // Only apply maxRows constraint if defined
        if (maxRows !== undefined) {
          position.y = Math.min(position.y, maxRows - item[cols].h);
        }

        // Ensure the item does not move out of bounds
        position.y = Math.min(position.y, maxRows - item[cols].h); // Ensure the y position is within the row bounds

        // Exclude item
        exclude.push(item.id);

        // Assign the position to the element in the column
        tempItems = updateItem(tempItems, item, position, cols);

        // Recreate ids of elements
        let getIgnoreItems = tempCloseBlocks.filter((value) => exclude.indexOf(value) === -1);

        // Update matrix for next iteration
        matrix = makeMatrixFromItemsIgnore(tempItems, getIgnoreItems, getRowsCount(tempItems, cols), cols);
      });

      // Return result
      return tempItems;
    }

    function getUndefinedItems(items, col, breakpoints) {
      return items
        .map((value) => {
          if (!value[col]) {
            return value.id;
          }
        })
        .filter(Boolean);
    }

    function getClosestColumn(items, item, col, breakpoints) {
      return breakpoints
        .map(([_, column]) => item[column] && column)
        .filter(Boolean)
        .reduce(function (acc, value) {
          const isLower = Math.abs(value - col) < Math.abs(acc - col);

          return isLower ? value : acc;
        });
    }

    function specifyUndefinedColumns(items, col, breakpoints) {
      let matrix = makeMatrixFromItems(items, getRowsCount(items, col), col);

      const getUndefinedElements = getUndefinedItems(items, col);

      let newItems = [...items];

      getUndefinedElements.forEach((elementId) => {
        const getElement = items.find((item) => item.id === elementId);

        const closestColumn = getClosestColumn(items, getElement, col, breakpoints);

        const position = findFreeSpaceForItem(matrix, getElement[closestColumn]);

        const newItem = {
          ...getElement,
          [col]: {
            ...getElement[closestColumn],
            ...position,
          },
        };

        newItems = newItems.map((value) => (value.id === elementId ? newItem : value));

        matrix = makeMatrixFromItems(newItems, getRowsCount(newItems, col), col);
      });
      return newItems;
    }

    /* src\MoveResize\index.svelte generated by Svelte v3.35.0 */

    const { document: document_1 } = globals;

    function add_css$1() {
    	var style = element("style");
    	style.id = "svelte-x23om8-style";
    	style.textContent = ".svlt-grid-item.svelte-x23om8{touch-action:none;position:absolute;will-change:auto;backface-visibility:hidden;-webkit-backface-visibility:hidden}.svlt-grid-resizer.svelte-x23om8{user-select:none;width:20px;height:20px;position:absolute;right:0;bottom:0;cursor:se-resize}.svlt-grid-resizer.svelte-x23om8::after{content:\"\";position:absolute;right:3px;bottom:3px;width:5px;height:5px;border-right:2px solid rgba(0, 0, 0, 0.4);border-bottom:2px solid rgba(0, 0, 0, 0.4)}.svlt-grid-active.svelte-x23om8{z-index:3;cursor:grabbing;position:fixed;opacity:0.5;backface-visibility:hidden;-webkit-backface-visibility:hidden;-moz-backface-visibility:hidden;-o-backface-visibility:hidden;-ms-backface-visibility:hidden;user-select:none}.shadow-active.svelte-x23om8{z-index:2;transition:all 0.2s}.svlt-grid-shadow.svelte-x23om8{position:absolute;background:red;will-change:transform;background:pink;backface-visibility:hidden;-webkit-backface-visibility:hidden}";
    	append(document_1.head, style);
    }

    const get_default_slot_changes$1 = dirty => ({});

    const get_default_slot_context$1 = ctx => ({
    	movePointerDown: /*pointerdown*/ ctx[18],
    	resizePointerDown: /*resizePointerDown*/ ctx[19]
    });

    // (68:2) {#if resizable && !item.customResizer}
    function create_if_block_1$1(ctx) {
    	let div;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			div = element("div");
    			attr(div, "class", "svlt-grid-resizer svelte-x23om8");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (!mounted) {
    				dispose = listen(div, "pointerdown", /*resizePointerDown*/ ctx[19]);
    				mounted = true;
    			}
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (73:0) {#if active || trans}
    function create_if_block$1(ctx) {
    	let div;

    	return {
    		c() {
    			div = element("div");
    			attr(div, "class", "svlt-grid-shadow shadow-active svelte-x23om8");
    			set_style(div, "width", /*shadow*/ ctx[12].w * /*xPerPx*/ ctx[6] - /*gapX*/ ctx[8] * 2 + "px");
    			set_style(div, "height", /*shadow*/ ctx[12].h * /*yPerPx*/ ctx[7] - /*gapY*/ ctx[9] * 2 + "px");
    			set_style(div, "transform", "translate(" + (/*shadow*/ ctx[12].x * /*xPerPx*/ ctx[6] + /*gapX*/ ctx[8]) + "px, " + (/*shadow*/ ctx[12].y * /*yPerPx*/ ctx[7] + /*gapY*/ ctx[9]) + "px)");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			/*div_binding*/ ctx[31](div);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*shadow, xPerPx, gapX*/ 4416) {
    				set_style(div, "width", /*shadow*/ ctx[12].w * /*xPerPx*/ ctx[6] - /*gapX*/ ctx[8] * 2 + "px");
    			}

    			if (dirty[0] & /*shadow, yPerPx, gapY*/ 4736) {
    				set_style(div, "height", /*shadow*/ ctx[12].h * /*yPerPx*/ ctx[7] - /*gapY*/ ctx[9] * 2 + "px");
    			}

    			if (dirty[0] & /*shadow, xPerPx, gapX, yPerPx, gapY*/ 5056) {
    				set_style(div, "transform", "translate(" + (/*shadow*/ ctx[12].x * /*xPerPx*/ ctx[6] + /*gapX*/ ctx[8]) + "px, " + (/*shadow*/ ctx[12].y * /*yPerPx*/ ctx[7] + /*gapY*/ ctx[9]) + "px)");
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			/*div_binding*/ ctx[31](null);
    		}
    	};
    }

    function create_fragment$1(ctx) {
    	let div;
    	let t0;
    	let div_style_value;
    	let t1;
    	let if_block1_anchor;
    	let current;
    	let mounted;
    	let dispose;
    	const default_slot_template = /*#slots*/ ctx[30].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[29], get_default_slot_context$1);
    	let if_block0 = /*resizable*/ ctx[4] && !/*item*/ ctx[10].customResizer && create_if_block_1$1(ctx);
    	let if_block1 = (/*active*/ ctx[13] || /*trans*/ ctx[16]) && create_if_block$1(ctx);

    	return {
    		c() {
    			div = element("div");
    			if (default_slot) default_slot.c();
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			if_block1_anchor = empty();
    			attr(div, "draggable", false);
    			attr(div, "class", "svlt-grid-item svelte-x23om8");

    			attr(div, "style", div_style_value = "width: " + (/*active*/ ctx[13]
    			? /*newSize*/ ctx[15].width
    			: /*width*/ ctx[0]) + "px; height:" + (/*active*/ ctx[13]
    			? /*newSize*/ ctx[15].height
    			: /*height*/ ctx[1]) + "px;\r\n  " + (/*active*/ ctx[13]
    			? `transform: translate(${/*cordDiff*/ ctx[14].x}px, ${/*cordDiff*/ ctx[14].y}px);top:${/*rect*/ ctx[17].top}px;left:${/*rect*/ ctx[17].left}px;`
    			: /*trans*/ ctx[16]
    				? `transform: translate(${/*cordDiff*/ ctx[14].x}px, ${/*cordDiff*/ ctx[14].y}px); position:absolute; transition: width 0.2s, height 0.2s;`
    				: `transition: transform 0.2s, opacity 0.2s; transform: translate(${/*left*/ ctx[2]}px, ${/*top*/ ctx[3]}px); `) + " ");

    			toggle_class(div, "svlt-grid-active", /*active*/ ctx[13] || /*trans*/ ctx[16] && /*rect*/ ctx[17]);
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			append(div, t0);
    			if (if_block0) if_block0.m(div, null);
    			insert(target, t1, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert(target, if_block1_anchor, anchor);
    			current = true;

    			if (!mounted) {
    				dispose = listen(div, "pointerdown", function () {
    					if (is_function(/*item*/ ctx[10] && /*item*/ ctx[10].customDragger
    					? null
    					: /*draggable*/ ctx[5] && /*pointerdown*/ ctx[18])) (/*item*/ ctx[10] && /*item*/ ctx[10].customDragger
    					? null
    					: /*draggable*/ ctx[5] && /*pointerdown*/ ctx[18]).apply(this, arguments);
    				});

    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (default_slot) {
    				if (default_slot.p && dirty[0] & /*$$scope*/ 536870912) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[29], dirty, get_default_slot_changes$1, get_default_slot_context$1);
    				}
    			}

    			if (/*resizable*/ ctx[4] && !/*item*/ ctx[10].customResizer) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_1$1(ctx);
    					if_block0.c();
    					if_block0.m(div, null);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (!current || dirty[0] & /*active, newSize, width, height, cordDiff, rect, trans, left, top*/ 253967 && div_style_value !== (div_style_value = "width: " + (/*active*/ ctx[13]
    			? /*newSize*/ ctx[15].width
    			: /*width*/ ctx[0]) + "px; height:" + (/*active*/ ctx[13]
    			? /*newSize*/ ctx[15].height
    			: /*height*/ ctx[1]) + "px;\r\n  " + (/*active*/ ctx[13]
    			? `transform: translate(${/*cordDiff*/ ctx[14].x}px, ${/*cordDiff*/ ctx[14].y}px);top:${/*rect*/ ctx[17].top}px;left:${/*rect*/ ctx[17].left}px;`
    			: /*trans*/ ctx[16]
    				? `transform: translate(${/*cordDiff*/ ctx[14].x}px, ${/*cordDiff*/ ctx[14].y}px); position:absolute; transition: width 0.2s, height 0.2s;`
    				: `transition: transform 0.2s, opacity 0.2s; transform: translate(${/*left*/ ctx[2]}px, ${/*top*/ ctx[3]}px); `) + " ")) {
    				attr(div, "style", div_style_value);
    			}

    			if (dirty[0] & /*active, trans, rect*/ 204800) {
    				toggle_class(div, "svlt-grid-active", /*active*/ ctx[13] || /*trans*/ ctx[16] && /*rect*/ ctx[17]);
    			}

    			if (/*active*/ ctx[13] || /*trans*/ ctx[16]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block$1(ctx);
    					if_block1.c();
    					if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (default_slot) default_slot.d(detaching);
    			if (if_block0) if_block0.d();
    			if (detaching) detach(t1);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach(if_block1_anchor);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	const dispatch = createEventDispatcher();
    	let { sensor } = $$props;
    	let { width } = $$props;
    	let { height } = $$props;
    	let { left } = $$props;
    	let { top } = $$props;
    	let { resizable } = $$props;
    	let { draggable } = $$props;
    	let { id } = $$props;
    	let { container } = $$props;
    	let { xPerPx } = $$props;
    	let { yPerPx } = $$props;
    	let { gapX } = $$props;
    	let { gapY } = $$props;
    	let { item } = $$props;
    	let { max } = $$props;
    	let { min } = $$props;
    	let { maxRows } = $$props;
    	let { rowHeight } = $$props;
    	let { cols } = $$props;
    	let { nativeContainer } = $$props;
    	let shadowElement;
    	let shadow = {};
    	let active = false;
    	let initX, initY;
    	let capturePos = { x: 0, y: 0 };
    	let cordDiff = { x: 0, y: 0 };
    	let newSize = { width, height };
    	let trans = false;
    	let anima;
    	let maxY;

    	const inActivate = () => {
    		const shadowBound = shadowElement.getBoundingClientRect();
    		const xdragBound = rect.left + cordDiff.x;
    		const ydragBound = rect.top + cordDiff.y;
    		$$invalidate(14, cordDiff.x = shadow.x * xPerPx + gapX - (shadowBound.x - xdragBound), cordDiff);
    		$$invalidate(14, cordDiff.y = shadow.y * yPerPx + gapY - (shadowBound.y - ydragBound), cordDiff);
    		$$invalidate(13, active = false);
    		$$invalidate(16, trans = true);
    		clearTimeout(anima);

    		anima = setTimeout(
    			() => {
    				$$invalidate(16, trans = false);
    			},
    			100
    		);

    		dispatch("pointerup", { id });
    	};

    	let repaint = (cb, isPointerUp) => {
    		dispatch("repaint", { id, shadow, isPointerUp, onUpdate: cb });
    	};

    	// Autoscroll
    	let _scrollTop = 0;

    	let containerFrame;
    	let rect;
    	let scrollElement;

    	const getContainerFrame = element => {
    		if (element === document.documentElement || !element) {
    			const { height, top, right, bottom, left } = nativeContainer.getBoundingClientRect();

    			return {
    				top: Math.max(0, top),
    				bottom: Math.min(window.innerHeight, bottom)
    			};
    		}

    		return element.getBoundingClientRect();
    	};

    	const getScroller = element => !element ? document.documentElement : element;

    	function getHeightDifference() {
    		const { y: itemY, h: itemHeight } = item;
    		const itemBottomIndex = itemY + itemHeight;
    		return maxRows - itemBottomIndex;
    	}

    	const pointerdown = ({ clientX, clientY, target }) => {
    		initX = clientX;
    		initY = clientY;

    		if (maxRows) {
    			const diff = getHeightDifference();
    			maxY = initY + rowHeight * diff;
    		}

    		capturePos = { x: left, y: top };

    		$$invalidate(12, shadow = {
    			x: item.x,
    			y: item.y,
    			w: item.w,
    			h: item.h
    		});

    		$$invalidate(15, newSize = { width, height });
    		containerFrame = getContainerFrame(container);
    		scrollElement = getScroller(container);
    		$$invalidate(14, cordDiff = { x: 0, y: 0 });
    		$$invalidate(17, rect = target.closest(".svlt-grid-item").getBoundingClientRect());
    		$$invalidate(13, active = true);
    		$$invalidate(16, trans = false);
    		_scrollTop = scrollElement.scrollTop;
    		window.addEventListener("pointermove", pointermove);
    		window.addEventListener("pointerup", pointerup);
    	};

    	let sign = { x: 0, y: 0 };
    	let vel = { x: 0, y: 0 };
    	let intervalId = 0;

    	const stopAutoscroll = () => {
    		clearInterval(intervalId);
    		intervalId = false;
    		sign = { x: 0, y: 0 };
    		vel = { x: 0, y: 0 };
    	};

    	const update = () => {
    		const _newScrollTop = scrollElement.scrollTop - _scrollTop;
    		const boundX = capturePos.x + cordDiff.x;
    		let boundY = capturePos.y + (cordDiff.y + _newScrollTop);
    		let gridX = Math.round(boundX / xPerPx);
    		let gridY = Math.round(boundY / yPerPx);

    		// Only apply maxRows constraint if defined
    		if (maxRows !== undefined) {
    			const maxYPosition = maxRows * rowHeight - item.h * rowHeight;
    			$$invalidate(12, shadow.y = Math.min(Math.max(gridY, 0), maxYPosition), shadow);
    		} else {
    			$$invalidate(12, shadow.y = Math.max(gridY, 0), shadow);
    		}

    		// Enforce grid bounds for x (left position)
    		$$invalidate(12, shadow.x = Math.max(Math.min(gridX, cols - shadow.w), 0), shadow);

    		if (max.y) {
    			$$invalidate(12, shadow.y = Math.min(shadow.y, max.y), shadow);
    		}

    		// Ensure x position doesn't go beyond grid
    		$$invalidate(12, shadow.x = Math.max(0, Math.min(shadow.x, cols - shadow.w)), shadow);

    		// Only apply maxRows constraint if defined
    		if (maxRows !== undefined) {
    			$$invalidate(12, shadow.y = Math.max(0, Math.min(shadow.y, maxRows - shadow.h)), shadow);
    		}

    		repaint();
    	};

    	const pointermove = event => {
    		event.preventDefault();
    		event.stopPropagation();
    		event.stopImmediatePropagation();
    		let { clientX, clientY } = event;

    		if (maxRows && clientY >= maxY) {
    			clientY = maxY;
    		}

    		$$invalidate(14, cordDiff = { x: clientX - initX, y: clientY - initY });
    		const Y_SENSOR = sensor;
    		let velocityTop = Math.max(0, (containerFrame.top + Y_SENSOR - clientY) / Y_SENSOR);
    		let velocityBottom = Math.max(0, (clientY - (containerFrame.bottom - Y_SENSOR)) / Y_SENSOR);
    		const topSensor = velocityTop > 0 && velocityBottom === 0;
    		const bottomSensor = velocityBottom > 0 && velocityTop === 0;
    		sign.y = topSensor ? -1 : bottomSensor ? 1 : 0;
    		vel.y = sign.y === -1 ? velocityTop : velocityBottom;

    		if (vel.y > 0) {
    			if (!intervalId) {
    				// Start scrolling
    				intervalId = setInterval(
    					() => {
    						scrollElement.scrollTop += 2 * (vel.y + Math.sign(vel.y)) * sign.y;
    						update();
    					},
    					10
    				);
    			}
    		} else if (intervalId) {
    			stopAutoscroll();
    		} else {
    			update();
    		}
    	};

    	const pointerup = e => {
    		stopAutoscroll();
    		window.removeEventListener("pointerdown", pointerdown);
    		window.removeEventListener("pointermove", pointermove);
    		window.removeEventListener("pointerup", pointerup);
    		repaint(inActivate, true);
    	};

    	// Resize
    	let resizeInitPos = { x: 0, y: 0 };

    	let initSize = { width: 0, height: 0 };

    	const resizePointerDown = e => {
    		e.stopPropagation();
    		const { pageX, pageY } = e;
    		resizeInitPos = { x: pageX, y: pageY };
    		initSize = { width, height };
    		$$invalidate(14, cordDiff = { x: 0, y: 0 });
    		$$invalidate(17, rect = e.target.closest(".svlt-grid-item").getBoundingClientRect());
    		$$invalidate(15, newSize = { width, height });
    		$$invalidate(13, active = true);
    		$$invalidate(16, trans = false);

    		$$invalidate(12, shadow = {
    			x: item.x,
    			y: item.y,
    			w: item.w,
    			h: item.h
    		});

    		containerFrame = getContainerFrame(container);
    		scrollElement = getScroller(container);
    		window.addEventListener("pointermove", resizePointerMove);
    		window.addEventListener("pointerup", resizePointerUp);
    	};

    	const resizePointerMove = ({ pageX, pageY }) => {
    		$$invalidate(15, newSize.width = initSize.width + pageX - resizeInitPos.x, newSize);
    		$$invalidate(15, newSize.height = initSize.height + pageY - resizeInitPos.y, newSize);
    		const diff = getHeightDifference();
    		const maxHeight = diff * rowHeight + item.h * rowHeight;

    		// Get max col number
    		let maxWidth = cols - shadow.x;

    		maxWidth = Math.min(max.w, maxWidth) || maxWidth;

    		// Limit bound
    		$$invalidate(15, newSize.width = Math.max(Math.min(newSize.width, maxWidth * xPerPx - gapX * 2), min.w * xPerPx - gapX * 2), newSize);

    		$$invalidate(15, newSize.height = Math.max(newSize.height, min.h * yPerPx - gapY * 2), newSize);

    		if (max.h) {
    			$$invalidate(15, newSize.height = Math.min(newSize.height, max.h * yPerPx - gapY * 2), newSize);
    		}

    		if (newSize.height > maxHeight) {
    			$$invalidate(15, newSize.height = maxHeight, newSize);
    		}

    		// Limit col & row
    		$$invalidate(12, shadow.w = Math.round((newSize.width + gapX * 2) / xPerPx), shadow);

    		$$invalidate(12, shadow.h = Math.round((newSize.height + gapY * 2) / yPerPx), shadow);
    		repaint();
    	};

    	const resizePointerUp = e => {
    		e.stopPropagation();
    		repaint(inActivate, true);
    		window.removeEventListener("pointermove", resizePointerMove);
    		window.removeEventListener("pointerup", resizePointerUp);
    	};

    	function div_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			shadowElement = $$value;
    			$$invalidate(11, shadowElement);
    		});
    	}

    	$$self.$$set = $$props => {
    		if ("sensor" in $$props) $$invalidate(20, sensor = $$props.sensor);
    		if ("width" in $$props) $$invalidate(0, width = $$props.width);
    		if ("height" in $$props) $$invalidate(1, height = $$props.height);
    		if ("left" in $$props) $$invalidate(2, left = $$props.left);
    		if ("top" in $$props) $$invalidate(3, top = $$props.top);
    		if ("resizable" in $$props) $$invalidate(4, resizable = $$props.resizable);
    		if ("draggable" in $$props) $$invalidate(5, draggable = $$props.draggable);
    		if ("id" in $$props) $$invalidate(21, id = $$props.id);
    		if ("container" in $$props) $$invalidate(22, container = $$props.container);
    		if ("xPerPx" in $$props) $$invalidate(6, xPerPx = $$props.xPerPx);
    		if ("yPerPx" in $$props) $$invalidate(7, yPerPx = $$props.yPerPx);
    		if ("gapX" in $$props) $$invalidate(8, gapX = $$props.gapX);
    		if ("gapY" in $$props) $$invalidate(9, gapY = $$props.gapY);
    		if ("item" in $$props) $$invalidate(10, item = $$props.item);
    		if ("max" in $$props) $$invalidate(23, max = $$props.max);
    		if ("min" in $$props) $$invalidate(24, min = $$props.min);
    		if ("maxRows" in $$props) $$invalidate(25, maxRows = $$props.maxRows);
    		if ("rowHeight" in $$props) $$invalidate(26, rowHeight = $$props.rowHeight);
    		if ("cols" in $$props) $$invalidate(27, cols = $$props.cols);
    		if ("nativeContainer" in $$props) $$invalidate(28, nativeContainer = $$props.nativeContainer);
    		if ("$$scope" in $$props) $$invalidate(29, $$scope = $$props.$$scope);
    	};

    	return [
    		width,
    		height,
    		left,
    		top,
    		resizable,
    		draggable,
    		xPerPx,
    		yPerPx,
    		gapX,
    		gapY,
    		item,
    		shadowElement,
    		shadow,
    		active,
    		cordDiff,
    		newSize,
    		trans,
    		rect,
    		pointerdown,
    		resizePointerDown,
    		sensor,
    		id,
    		container,
    		max,
    		min,
    		maxRows,
    		rowHeight,
    		cols,
    		nativeContainer,
    		$$scope,
    		slots,
    		div_binding
    	];
    }

    class MoveResize extends SvelteComponent {
    	constructor(options) {
    		super();
    		if (!document_1.getElementById("svelte-x23om8-style")) add_css$1();

    		init(
    			this,
    			options,
    			instance$1,
    			create_fragment$1,
    			safe_not_equal,
    			{
    				sensor: 20,
    				width: 0,
    				height: 1,
    				left: 2,
    				top: 3,
    				resizable: 4,
    				draggable: 5,
    				id: 21,
    				container: 22,
    				xPerPx: 6,
    				yPerPx: 7,
    				gapX: 8,
    				gapY: 9,
    				item: 10,
    				max: 23,
    				min: 24,
    				maxRows: 25,
    				rowHeight: 26,
    				cols: 27,
    				nativeContainer: 28
    			},
    			[-1, -1]
    		);
    	}
    }

    /* src\index.svelte generated by Svelte v3.35.0 */

    function add_css() {
    	var style = element("style");
    	style.id = "svelte-1k5vgfu-style";
    	style.textContent = ".svlt-grid-container.svelte-1k5vgfu{position:relative;width:100%}";
    	append(document.head, style);
    }

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[29] = list[i];
    	child_ctx[31] = i;
    	return child_ctx;
    }

    const get_default_slot_changes = dirty => ({
    	movePointerDown: dirty[1] & /*movePointerDown*/ 4,
    	resizePointerDown: dirty[1] & /*resizePointerDown*/ 2,
    	dataItem: dirty[0] & /*items*/ 1,
    	item: dirty[0] & /*items, getComputedCols*/ 65,
    	index: dirty[0] & /*items*/ 1
    });

    const get_default_slot_context = ctx => ({
    	movePointerDown: /*movePointerDown*/ ctx[33],
    	resizePointerDown: /*resizePointerDown*/ ctx[32],
    	dataItem: /*item*/ ctx[29],
    	item: /*item*/ ctx[29][/*getComputedCols*/ ctx[6]],
    	index: /*i*/ ctx[31]
    });

    // (9:2) {#if xPerPx || !fastStart}
    function create_if_block(ctx) {
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let each_1_anchor;
    	let current;
    	let each_value = /*items*/ ctx[0];
    	const get_key = ctx => /*item*/ ctx[29].id;

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
    	}

    	return {
    		c() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, each_1_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*items, getComputedCols, xPerPx, yPerPx, gapX, gapY, sensor, maxRows, rowHeight, scroller, container, handleRepaint, pointerup, $$scope*/ 4225019 | dirty[1] & /*movePointerDown, resizePointerDown*/ 6) {
    				each_value = /*items*/ ctx[0];
    				group_outros();
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, each_1_anchor.parentNode, outro_and_destroy_block, create_each_block, each_1_anchor, get_each_context);
    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d(detaching);
    			}

    			if (detaching) detach(each_1_anchor);
    		}
    	};
    }

    // (36:8) {#if item[getComputedCols]}
    function create_if_block_1(ctx) {
    	let current;
    	const default_slot_template = /*#slots*/ ctx[20].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[22], get_default_slot_context);

    	return {
    		c() {
    			if (default_slot) default_slot.c();
    		},
    		m(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty[0] & /*$$scope, items, getComputedCols*/ 4194369 | dirty[1] & /*movePointerDown, resizePointerDown*/ 6) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[22], dirty, get_default_slot_changes, get_default_slot_context);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    // (11:6) <MoveResize          on:repaint={handleRepaint}          on:pointerup={pointerup}          id={item.id}          resizable={item[getComputedCols] && item[getComputedCols].resizable}          draggable={item[getComputedCols] && item[getComputedCols].draggable}          {xPerPx}          {yPerPx}          width={Math.min(getComputedCols, item[getComputedCols] && item[getComputedCols].w) * xPerPx - gapX * 2}          height={(item[getComputedCols] && item[getComputedCols].h) * yPerPx - gapY * 2}          top={(item[getComputedCols] && item[getComputedCols].y) * yPerPx + gapY}          left={(item[getComputedCols] && item[getComputedCols].x) * xPerPx + gapX}          item={item[getComputedCols]}          min={item[getComputedCols] && item[getComputedCols].min}          max={item[getComputedCols] && item[getComputedCols].max}          cols={getComputedCols}          {gapX}          {gapY}          {sensor}          {maxRows}          {rowHeight}          container={scroller}          nativeContainer={container}          let:resizePointerDown          let:movePointerDown>
    function create_default_slot(ctx) {
    	let t;
    	let current;
    	let if_block = /*item*/ ctx[29][/*getComputedCols*/ ctx[6]] && create_if_block_1(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			t = space();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert(target, t, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (/*item*/ ctx[29][/*getComputedCols*/ ctx[6]]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty[0] & /*items, getComputedCols*/ 65) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block_1(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(t.parentNode, t);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(t);
    		}
    	};
    }

    // (10:4) {#each items as item, i (item.id)}
    function create_each_block(key_1, ctx) {
    	let first;
    	let moveresize;
    	let current;

    	moveresize = new MoveResize({
    			props: {
    				id: /*item*/ ctx[29].id,
    				resizable: /*item*/ ctx[29][/*getComputedCols*/ ctx[6]] && /*item*/ ctx[29][/*getComputedCols*/ ctx[6]].resizable,
    				draggable: /*item*/ ctx[29][/*getComputedCols*/ ctx[6]] && /*item*/ ctx[29][/*getComputedCols*/ ctx[6]].draggable,
    				xPerPx: /*xPerPx*/ ctx[8],
    				yPerPx: /*yPerPx*/ ctx[12],
    				width: Math.min(/*getComputedCols*/ ctx[6], /*item*/ ctx[29][/*getComputedCols*/ ctx[6]] && /*item*/ ctx[29][/*getComputedCols*/ ctx[6]].w) * /*xPerPx*/ ctx[8] - /*gapX*/ ctx[9] * 2,
    				height: (/*item*/ ctx[29][/*getComputedCols*/ ctx[6]] && /*item*/ ctx[29][/*getComputedCols*/ ctx[6]].h) * /*yPerPx*/ ctx[12] - /*gapY*/ ctx[10] * 2,
    				top: (/*item*/ ctx[29][/*getComputedCols*/ ctx[6]] && /*item*/ ctx[29][/*getComputedCols*/ ctx[6]].y) * /*yPerPx*/ ctx[12] + /*gapY*/ ctx[10],
    				left: (/*item*/ ctx[29][/*getComputedCols*/ ctx[6]] && /*item*/ ctx[29][/*getComputedCols*/ ctx[6]].x) * /*xPerPx*/ ctx[8] + /*gapX*/ ctx[9],
    				item: /*item*/ ctx[29][/*getComputedCols*/ ctx[6]],
    				min: /*item*/ ctx[29][/*getComputedCols*/ ctx[6]] && /*item*/ ctx[29][/*getComputedCols*/ ctx[6]].min,
    				max: /*item*/ ctx[29][/*getComputedCols*/ ctx[6]] && /*item*/ ctx[29][/*getComputedCols*/ ctx[6]].max,
    				cols: /*getComputedCols*/ ctx[6],
    				gapX: /*gapX*/ ctx[9],
    				gapY: /*gapY*/ ctx[10],
    				sensor: /*sensor*/ ctx[5],
    				maxRows: /*maxRows*/ ctx[3],
    				rowHeight: /*rowHeight*/ ctx[1],
    				container: /*scroller*/ ctx[4],
    				nativeContainer: /*container*/ ctx[7],
    				$$slots: {
    					default: [
    						create_default_slot,
    						({ resizePointerDown, movePointerDown }) => ({
    							32: resizePointerDown,
    							33: movePointerDown
    						}),
    						({ resizePointerDown, movePointerDown }) => [0, (resizePointerDown ? 2 : 0) | (movePointerDown ? 4 : 0)]
    					]
    				},
    				$$scope: { ctx }
    			}
    		});

    	moveresize.$on("repaint", /*handleRepaint*/ ctx[14]);
    	moveresize.$on("pointerup", /*pointerup*/ ctx[13]);

    	return {
    		key: key_1,
    		first: null,
    		c() {
    			first = empty();
    			create_component(moveresize.$$.fragment);
    			this.first = first;
    		},
    		m(target, anchor) {
    			insert(target, first, anchor);
    			mount_component(moveresize, target, anchor);
    			current = true;
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			const moveresize_changes = {};
    			if (dirty[0] & /*items*/ 1) moveresize_changes.id = /*item*/ ctx[29].id;
    			if (dirty[0] & /*items, getComputedCols*/ 65) moveresize_changes.resizable = /*item*/ ctx[29][/*getComputedCols*/ ctx[6]] && /*item*/ ctx[29][/*getComputedCols*/ ctx[6]].resizable;
    			if (dirty[0] & /*items, getComputedCols*/ 65) moveresize_changes.draggable = /*item*/ ctx[29][/*getComputedCols*/ ctx[6]] && /*item*/ ctx[29][/*getComputedCols*/ ctx[6]].draggable;
    			if (dirty[0] & /*xPerPx*/ 256) moveresize_changes.xPerPx = /*xPerPx*/ ctx[8];
    			if (dirty[0] & /*getComputedCols, items, xPerPx, gapX*/ 833) moveresize_changes.width = Math.min(/*getComputedCols*/ ctx[6], /*item*/ ctx[29][/*getComputedCols*/ ctx[6]] && /*item*/ ctx[29][/*getComputedCols*/ ctx[6]].w) * /*xPerPx*/ ctx[8] - /*gapX*/ ctx[9] * 2;
    			if (dirty[0] & /*items, getComputedCols, gapY*/ 1089) moveresize_changes.height = (/*item*/ ctx[29][/*getComputedCols*/ ctx[6]] && /*item*/ ctx[29][/*getComputedCols*/ ctx[6]].h) * /*yPerPx*/ ctx[12] - /*gapY*/ ctx[10] * 2;
    			if (dirty[0] & /*items, getComputedCols, gapY*/ 1089) moveresize_changes.top = (/*item*/ ctx[29][/*getComputedCols*/ ctx[6]] && /*item*/ ctx[29][/*getComputedCols*/ ctx[6]].y) * /*yPerPx*/ ctx[12] + /*gapY*/ ctx[10];
    			if (dirty[0] & /*items, getComputedCols, xPerPx, gapX*/ 833) moveresize_changes.left = (/*item*/ ctx[29][/*getComputedCols*/ ctx[6]] && /*item*/ ctx[29][/*getComputedCols*/ ctx[6]].x) * /*xPerPx*/ ctx[8] + /*gapX*/ ctx[9];
    			if (dirty[0] & /*items, getComputedCols*/ 65) moveresize_changes.item = /*item*/ ctx[29][/*getComputedCols*/ ctx[6]];
    			if (dirty[0] & /*items, getComputedCols*/ 65) moveresize_changes.min = /*item*/ ctx[29][/*getComputedCols*/ ctx[6]] && /*item*/ ctx[29][/*getComputedCols*/ ctx[6]].min;
    			if (dirty[0] & /*items, getComputedCols*/ 65) moveresize_changes.max = /*item*/ ctx[29][/*getComputedCols*/ ctx[6]] && /*item*/ ctx[29][/*getComputedCols*/ ctx[6]].max;
    			if (dirty[0] & /*getComputedCols*/ 64) moveresize_changes.cols = /*getComputedCols*/ ctx[6];
    			if (dirty[0] & /*gapX*/ 512) moveresize_changes.gapX = /*gapX*/ ctx[9];
    			if (dirty[0] & /*gapY*/ 1024) moveresize_changes.gapY = /*gapY*/ ctx[10];
    			if (dirty[0] & /*sensor*/ 32) moveresize_changes.sensor = /*sensor*/ ctx[5];
    			if (dirty[0] & /*maxRows*/ 8) moveresize_changes.maxRows = /*maxRows*/ ctx[3];
    			if (dirty[0] & /*rowHeight*/ 2) moveresize_changes.rowHeight = /*rowHeight*/ ctx[1];
    			if (dirty[0] & /*scroller*/ 16) moveresize_changes.container = /*scroller*/ ctx[4];
    			if (dirty[0] & /*container*/ 128) moveresize_changes.nativeContainer = /*container*/ ctx[7];

    			if (dirty[0] & /*$$scope, items, getComputedCols*/ 4194369 | dirty[1] & /*movePointerDown, resizePointerDown*/ 6) {
    				moveresize_changes.$$scope = { dirty, ctx };
    			}

    			moveresize.$set(moveresize_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(moveresize.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(moveresize.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(first);
    			destroy_component(moveresize, detaching);
    		}
    	};
    }

    function create_fragment(ctx) {
    	let div;
    	let current;
    	let if_block = (/*xPerPx*/ ctx[8] || !/*fastStart*/ ctx[2]) && create_if_block(ctx);

    	return {
    		c() {
    			div = element("div");
    			if (if_block) if_block.c();
    			attr(div, "class", "svlt-grid-container svelte-1k5vgfu");
    			set_style(div, "height", /*containerHeight*/ ctx[11] + "px");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			if (if_block) if_block.m(div, null);
    			/*div_binding*/ ctx[21](div);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (/*xPerPx*/ ctx[8] || !/*fastStart*/ ctx[2]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty[0] & /*xPerPx, fastStart*/ 260) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(div, null);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}

    			if (!current || dirty[0] & /*containerHeight*/ 2048) {
    				set_style(div, "height", /*containerHeight*/ ctx[11] + "px");
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block) if_block.d();
    			/*div_binding*/ ctx[21](null);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let gapX;
    	let gapY;
    	let containerHeight;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	const dispatch = createEventDispatcher();
    	let { fillSpace = false } = $$props;
    	let { items } = $$props;
    	let { rowHeight } = $$props;
    	let { cols } = $$props;
    	let { gap = [10, 10] } = $$props;
    	let { fastStart = false } = $$props;
    	let { throttleUpdate = 100 } = $$props;
    	let { throttleResize = 100 } = $$props;
    	let { maxRows } = $$props;
    	let { scroller = undefined } = $$props;
    	let { sensor = 20 } = $$props;
    	let getComputedCols;
    	let container;
    	let xPerPx = 0;
    	let yPerPx = rowHeight;
    	let containerWidth;

    	const pointerup = ev => {
    		dispatch("pointerup", { id: ev.detail.id, cols: getComputedCols });
    	};

    	const onResize = throttle(
    		() => {
    			$$invalidate(0, items = specifyUndefinedColumns(items, getComputedCols, cols));

    			dispatch("resize", {
    				cols: getComputedCols,
    				xPerPx,
    				yPerPx,
    				width: containerWidth
    			});
    		},
    		throttleUpdate
    	);

    	onMount(() => {
    		const sizeObserver = new ResizeObserver(entries => {
    				requestAnimationFrame(() => {
    					let width = entries[0].contentRect.width;
    					if (width === containerWidth) return;
    					$$invalidate(6, getComputedCols = getColumn(width, cols));
    					$$invalidate(8, xPerPx = width / getComputedCols);

    					if (!containerWidth) {
    						$$invalidate(0, items = specifyUndefinedColumns(items, getComputedCols, cols));

    						dispatch("mount", {
    							cols: getComputedCols,
    							xPerPx,
    							yPerPx, // same as rowHeight
    							
    						});
    					} else {
    						onResize();
    					}

    					containerWidth = width;
    				});
    			});

    		sizeObserver.observe(container);
    		return () => sizeObserver.disconnect();
    	});

    	const updateMatrix = ({ detail }) => {
    		let activeItem = getItemById(detail.id, items);

    		if (activeItem) {
    			activeItem = {
    				...activeItem,
    				[getComputedCols]: {
    					...activeItem[getComputedCols],
    					...detail.shadow
    				}
    			};

    			if (fillSpace) {
    				$$invalidate(0, items = moveItemsAroundItem(activeItem, items, getComputedCols, getItemById(detail.id, items), maxRows));
    			} else {
    				$$invalidate(0, items = moveItem(activeItem, items, getComputedCols, getItemById(detail.id, items), maxRows));
    			}

    			if (detail.onUpdate) detail.onUpdate();

    			dispatch("change", {
    				unsafeItem: activeItem,
    				id: activeItem.id,
    				cols: getComputedCols
    			});
    		}
    	};

    	const throttleMatrix = throttle(updateMatrix, throttleResize);

    	const handleRepaint = ({ detail }) => {
    		if (!detail.isPointerUp) {
    			throttleMatrix({ detail });
    		} else {
    			updateMatrix({ detail });
    		}
    	};

    	function div_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			container = $$value;
    			$$invalidate(7, container);
    		});
    	}

    	$$self.$$set = $$props => {
    		if ("fillSpace" in $$props) $$invalidate(15, fillSpace = $$props.fillSpace);
    		if ("items" in $$props) $$invalidate(0, items = $$props.items);
    		if ("rowHeight" in $$props) $$invalidate(1, rowHeight = $$props.rowHeight);
    		if ("cols" in $$props) $$invalidate(16, cols = $$props.cols);
    		if ("gap" in $$props) $$invalidate(17, gap = $$props.gap);
    		if ("fastStart" in $$props) $$invalidate(2, fastStart = $$props.fastStart);
    		if ("throttleUpdate" in $$props) $$invalidate(18, throttleUpdate = $$props.throttleUpdate);
    		if ("throttleResize" in $$props) $$invalidate(19, throttleResize = $$props.throttleResize);
    		if ("maxRows" in $$props) $$invalidate(3, maxRows = $$props.maxRows);
    		if ("scroller" in $$props) $$invalidate(4, scroller = $$props.scroller);
    		if ("sensor" in $$props) $$invalidate(5, sensor = $$props.sensor);
    		if ("$$scope" in $$props) $$invalidate(22, $$scope = $$props.$$scope);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*gap*/ 131072) {
    			$$invalidate(9, [gapX, gapY] = gap, gapX, ($$invalidate(10, gapY), $$invalidate(17, gap)));
    		}

    		if ($$self.$$.dirty[0] & /*items, getComputedCols*/ 65) {
    			$$invalidate(11, containerHeight = getContainerHeight(items, yPerPx, getComputedCols));
    		}
    	};

    	return [
    		items,
    		rowHeight,
    		fastStart,
    		maxRows,
    		scroller,
    		sensor,
    		getComputedCols,
    		container,
    		xPerPx,
    		gapX,
    		gapY,
    		containerHeight,
    		yPerPx,
    		pointerup,
    		handleRepaint,
    		fillSpace,
    		cols,
    		gap,
    		throttleUpdate,
    		throttleResize,
    		slots,
    		div_binding,
    		$$scope
    	];
    }

    class Src extends SvelteComponent {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-1k5vgfu-style")) add_css();

    		init(
    			this,
    			options,
    			instance,
    			create_fragment,
    			safe_not_equal,
    			{
    				fillSpace: 15,
    				items: 0,
    				rowHeight: 1,
    				cols: 16,
    				gap: 17,
    				fastStart: 2,
    				throttleUpdate: 18,
    				throttleResize: 19,
    				maxRows: 3,
    				scroller: 4,
    				sensor: 5
    			},
    			[-1, -1]
    		);
    	}
    }

    return Src;

})));
