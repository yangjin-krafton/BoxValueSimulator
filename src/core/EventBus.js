/**
 * 이벤트 버스 — 모듈 간 느슨한 결합.
 *
 * 사용:
 *   bus.on('box:select', (index) => { ... })
 *   bus.emit('box:select', 3)
 */
export class EventBus {
  /** @type {Map<string, Set<Function>>} */
  #listeners = new Map();

  /**
   * @param {string} event
   * @param {Function} fn
   * @returns {() => void} unsubscribe
   */
  on(event, fn) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    this.#listeners.get(event).add(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    this.#listeners.get(event)?.delete(fn);
  }

  emit(event, data) {
    this.#listeners.get(event)?.forEach(fn => fn(data));
  }
}
