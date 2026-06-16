class EventBus {
  constructor() {
    this._handlers = {};
  }

  on(event, fn) {
    (this._handlers[event] ??= []).push(fn);
    // Return unsubscribe function
    return () => this.off(event, fn);
  }

  off(event, fn) {
    const list = this._handlers[event];
    if (list) {
      this._handlers[event] = list.filter((h) => h !== fn);
    }
  }

  emit(event, data) {
    (this._handlers[event] || []).forEach((fn) => fn(data));
  }

  removeAllListeners(event) {
    if (event) {
      delete this._handlers[event];
    } else {
      this._handlers = {};
    }
  }
}

export const bus = new EventBus();
