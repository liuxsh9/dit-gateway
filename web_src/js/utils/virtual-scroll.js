export function createVirtualScroll({items, itemHeight = 36, containerHeight = 600, overscan = 5}) {
  const state = {
    scrollTop: 0,
    get startIndex() {
      return Math.max(0, Math.floor(state.scrollTop / itemHeight) - overscan);
    },
    get endIndex() {
      const visible = Math.ceil(containerHeight / itemHeight);
      return Math.min(items.length, state.startIndex + visible + overscan * 2);
    },
    get visibleItems() {
      return items.slice(state.startIndex, state.endIndex);
    },
    get containerStyle() {
      return {
        height: `${items.length * itemHeight}px`,
        position: 'relative',
      };
    },
    get offsetStyle() {
      return {
        transform: `translateY(${state.startIndex * itemHeight}px)`,
      };
    },
    onScroll(event) {
      state.scrollTop = event.target.scrollTop;
    },
  };
  return state;
}
