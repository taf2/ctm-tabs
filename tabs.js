/* using broadcast channel to sync state between tabs */
class Tabs {
  constructor(channel, attributes={canLeader:true}) {
    this.bc         = new BroadcastChannel(channel);
    this.tabs       = new Map();
    this.dirty      = new Set();
    this.updateHandlers = {
      'update': []
    }
    this.attributes = attributes;

    // generate the tabId and make it sticky to the tab
    if (sessionStorage['tabId']) {
      this.id = sessionStorage['tabId'];
      this.attributes.updated = new Date().getTime();
      if (!this.attributes.created) {
        this.attributes.created = sessionStorage['tabCreated'];
      }
    } else {
      this.id = sessionStorage['tabId'] = crypto.randomUUID();
      sessionStorage['tabCreated'] = this.attributes.created = new Date().getTime();
    }

    this.tabs.set(this.id, attributes);
    this.pingTimer = null;
    this.bc.onmessage = (event) => { this.onUpdate(event); }
  }

  start() {
    this.ping();
  }

  // ping requests each tab to pong with their current details
  ping() {
    this.update();

    this.oldTabs = this.tabs;
    this.tabs  = new Map();
    this.dirty = new Set();
    this.tabs.set(this.id, Object.assign({me: true}, this.attributes));
    this.bc.postMessage({action: "ping", id: this.id});

    this.stop();
    this.pingTimer = setTimeout(this.ping.bind(this), 100); // all open tabs have 100ms to respond
  }

  stop() {
    clearTimeout(this.pingTimer);
    this.pingTimer = null;
  }

  onUpdate(event) {
    switch (event.data.action) {
    case 'ping':
      this.bc.postMessage({action: "pong", id: this.id, attributes: this.attributes});
      break;
    case 'pong':
      const oldTabAttrs = JSON.stringify(this.oldTabs.get(event.data.id));
      const newTabAttrs = JSON.stringify(event.data.attributes);

      if (oldTabAttrs != newTabAttrs) {
        console.log("changed:", oldTabAttrs, newTabAttrs);
        this.dirty.add(event.data.id);
      }
      this.tabs.set(event.data.id, event.data.attributes);
      break;
    }
  }

  update() {
    if (this.dirty.size || (this.oldTabs?.size != this.tabs.size)) {
      console.log(`changes detected: ${this.dirty.size}, ${this.oldTabs?.size} != ${this.tabs.size}`);
      this.updateHandlers.update.forEach( (h) => {
        try {
          h(this.dirty, this.tabs);
        } catch (e) {
          console.error(e);
        }
      });
      this.dirty = new Set(); // clear dirty has flushed
      console.log(`cleared: ${this.dirty.size}`);
    }
  }

  on(event, handler) {
    if (!this.updateHandlers[event]) { console.error(`unknown event handler: ${event} not supported`); return; }
    this.updateHandlers[event].push(handler);
  }

  offAll(event) {
    if (!this.updateHandlers[event]) { console.error(`unknown event handler: ${event} not supported`); return; }
    this.updateHandlers[event] = [];
  }
}
