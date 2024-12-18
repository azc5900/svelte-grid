import { makeMatrix, makeMatrixFromItemsIgnore, findCloseBlocks, findItemsById, makeMatrixFromItems } from "./matrix.js";
import { getRowsCount } from "./other.js";

export function getItemById(id, items) {
  return items.find((value) => value.id === id);
}

export function findFreeSpaceForItem(matrix, item) {
  const cols = matrix[0].length;
  const w = Math.min(cols, item.w);
  const xNtime = cols - w;
  const getMatrixRows = matrix.length;

  for (let i = 0; i < getMatrixRows; i++) {
    const row = matrix[i];
    for (let j = 0; j < xNtime + 1; j++) {
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

  // Return null if no space is found
  return null;
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

export function moveItemsAroundItem(active, items, cols, original) {
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
    const position = findFreeSpaceForItem(matrix, item[cols]);
    if (position === null) {
      console.warn(`Cannot place item ${item.id}: Grid is full or no valid position.`);
      // Optional: Notify the user
      alert(`Cannot place item ${item.id}: Grid is full or no valid position.`);
      return; // Skip this item
    }

    exclude.push(item.id);
    tempItems = updateItem(tempItems, item, position, cols);

    // Update matrix for the next iteration
    const getIgnoreItems = ids.filter((value) => exclude.indexOf(value) === -1);
    matrix = makeMatrixFromItemsIgnore(tempItems, getIgnoreItems, getRowsCount(tempItems, cols), cols);
  });

  // Return result
  return tempItems;
}

export function moveItem(active, items, cols, original) {
  // Get current item from the breakpoint
  const item = getItem(active, cols);

  // Create matrix from the items expect the active
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

  // Create matrix of items expect close elements
  matrix = makeMatrixFromItemsIgnore(items, closeBlocks, getRowsCount(items, cols), cols);

  // Create temp vars
  let tempItems = items;
  let tempCloseBlocks = closeBlocks;

  // Exclude resolved elements ids in array
  let exclude = [];

  // Iterate over close elements under active item
  closeObj.forEach((item) => {
    const position = findFreeSpaceForItem(matrix, item[cols]);
    if (position === null) {
      console.warn(`Cannot place item ${item.id}: Grid is full or no valid position.`);
      // Optional: Notify the user
      alert(`Cannot place item ${item.id}: Grid is full or no valid position.`);
      return; // Skip this item
    }

    exclude.push(item.id);
    tempItems = updateItem(tempItems, item, position, cols);

    // Update matrix for the next iteration
    const getIgnoreItems = tempCloseBlocks.filter((value) => exclude.indexOf(value) === -1);
    matrix = makeMatrixFromItemsIgnore(tempItems, getIgnoreItems, getRowsCount(tempItems, cols), cols);
  });

  // Return result
  return tempItems;
}

// Helper function
export function normalize(items, col) {
  let result = items.slice();

  result.forEach((value) => {
    const getItem = value[col];
    if (!getItem.static) {
      result = moveItem(getItem, result, col, { ...getItem });
    }
  });

  return result;
}

// Helper function
export function adjust(items, col) {
  let matrix = makeMatrix(getRowsCount(items, col), col);

  const order = items.toSorted((a, b) => {
    const aItem = a[col];
    const bItem = b[col];

    return aItem.x - bItem.x || aItem.y - bItem.y;
  });

  return order.reduce((acc, item) => {
    let position = findFreeSpaceForItem(matrix, item[col]);

    acc.push({
      ...item,
      [col]: {
        ...item[col],
        ...position,
      },
    });

    matrix = makeMatrixFromItems(acc, getRowsCount(acc, col), col);

    return acc;
  }, []);
}

export function getUndefinedItems(items, col, breakpoints) {
  return items
    .map((value) => {
      if (!value[col]) {
        return value.id;
      }
    })
    .filter(Boolean);
}

export function getClosestColumn(items, item, col, breakpoints) {
  return breakpoints
    .map(([_, column]) => item[column] && column)
    .filter(Boolean)
    .reduce(function (acc, value) {
      const isLower = Math.abs(value - col) < Math.abs(acc - col);

      return isLower ? value : acc;
    });
}

export function specifyUndefinedColumns(items, col, breakpoints) {
  let matrix = makeMatrixFromItems(items, getRowsCount(items, col), col);

  const getUndefinedElements = getUndefinedItems(items, col, breakpoints);

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
