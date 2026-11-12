// Minimal DOM surface for exercising the real picker event handlers in Node.
export class Element {
  constructor(tag = 'div') {
    this.tag = tag;
    this.childNodes = [];
    this.listeners = new Map();
    this.dataset = {};
    this.attributes = new Map();
    this.classes = new Set();
    this.classList = {
      add: value => this.classes.add(value),
      remove: value => this.classes.delete(value),
      toggle: (value, enabled) => enabled ? this.classes.add(value) : this.classes.delete(value),
    };
    this.value = '';
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.open = false;
  }
  addEventListener(name, listener) {
    const listeners = this.listeners.get(name) || [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
  }
  async emit(name, event = {}) {
    await Promise.all((this.listeners.get(name) || []).map(listener => listener({ target: this, ...event })));
  }
  append(...nodes) {
    for (const node of nodes) {
      if (node.tag === 'fragment') {
        this.append(...node.childNodes);
        node.childNodes = [];
      } else {
        if (node.parent) node.parent.childNodes = node.parent.childNodes.filter(child => child !== node);
        this.childNodes.push(node);
        node.parent = this;
      }
    }
  }
  appendChild(node) { this.append(node); }
  prepend(node) {
    const previous = [...this.childNodes];
    this.replaceChildren(node, ...previous);
  }
  replaceChildren(...nodes) {
    this.childNodes.forEach(node => { node.parent = null; });
    this.childNodes = [];
    this.append(...nodes);
  }
  add(node) { this.append(node); }
  setAttribute(key, value) { this.attributes.set(key, value); }
  removeAttribute(key) { this.attributes.delete(key); }
  querySelectorAll(selector) {
    return this.childNodes.flatMap(node => [
      ...(selector.startsWith('.') && node.classes.has(selector.slice(1)) ? [node] : []),
      ...node.querySelectorAll(selector),
    ]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0]; }
  getBoundingClientRect() { return { top: 0, bottom: 0, height: 0 }; }
  showModal() { this.open = true; }
  close() { this.open = false; return this.emit('close'); }
}

export function pickerDOM() {
  const nodes = new Map();
  const get = selector => {
    if (!nodes.has(selector)) nodes.set(selector, new Element());
    return nodes.get(selector);
  };
  return {
    get,
    document: {
      querySelector: get,
      createElement: tag => new Element(tag),
      createDocumentFragment: () => new Element('fragment'),
    },
  };
}
