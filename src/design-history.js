export function createDesignHistory({ currentRegion, snapshot, restore, onChange, limit }) {
  const histories = new Map();
  function historyFor(region = currentRegion()) {
    if (!histories.has(region)) histories.set(region, { past: [], future: [], transaction: null });
    return histories.get(region);
  }

  function push(stack, state) {
    stack.push(state);
    if (stack.length > limit) stack.shift();
  }

  function refresh() {
    const { past, future } = historyFor();
    onChange(past.length, future.length);
  }

  function recordHistory(transaction = null, region = currentRegion()) {
    const history = historyFor(region);
    if (transaction && history.transaction === transaction) return;
    if (region !== currentRegion()) clearTransaction();
    push(history.past, snapshot(region));
    history.future.length = 0;
    history.transaction = transaction;
    refresh();
  }

  function endHistoryTransaction(transaction) {
    const history = historyFor();
    if (history.transaction === transaction) history.transaction = null;
  }

  function clearTransaction() {
    historyFor().transaction = null;
  }

  async function step(from, to) {
    const region = currentRegion();
    const history = historyFor(region);
    if (!history[from].length) return;
    history.transaction = null;
    push(history[to], snapshot(region));
    const next = history[from].pop();
    refresh();
    await restore(next);
  }

  return {
    recordHistory, endHistoryTransaction, clearTransaction, refresh,
    undo: () => step('past', 'future'),
    redo: () => step('future', 'past'),
  };
}
