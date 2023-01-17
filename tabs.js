/* using broadcast channel to sync state between tabs */
class Tabs {
  constructor(channel, attributes={}) {
    this.bc         = new BroadcastChannel(channel);
    this.tabs       = new Map();
    this.dirty      = new Set();
    this.updateHandlers = {
      'update': [],
      'message': []
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
        //console.log("changed:", oldTabAttrs, newTabAttrs);
        this.dirty.add(event.data.id);
      }
      this.tabs.set(event.data.id, event.data.attributes);
      break;
    default:
      this.updateHandlers['message'].forEach( (h) => {
        h(event);
      });
    }
  }

  update(force=false) {
    if (force || this.dirty.size || (this.oldTabs?.size != this.tabs.size)) {
      //console.log(`changes detected: ${this.dirty.size}, ${this.oldTabs?.size} != ${this.tabs.size}`);
      this.updateHandlers.update.forEach( (h) => {
        try {
          h(this.dirty, this.tabs);
        } catch (e) {
          console.error(e);
        }
      });
      this.dirty = new Set(); // clear dirty has flushed
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

/* extending Tabs to support electing a single tab as the "Leader" and
   designating the rest as either followers (e.g. can become a leader or not) */
class TabLeaderFollower extends Tabs {
  constructor(channel, attributes={}) {
    super(channel, attributes);
    this.attributes.leader = false;
    this.attributes.follower = true;
    this.electionTimer = null;
  }

  start() {
    this.on('message', this.messageHandler.bind(this));
    this.on('update', this.updateHandler.bind(this));
    super.start();
  }

  messageHandler(event) {
    if (event.data.action == 'elect' && event.data.id == this.id) {
      this.elect(); // elect self
    } else {
      this.attributes.leader = false;
      sessionStorage['tab.leader'] = event.data.id;
    }
  }

  updateHandler(dirty, tabs) {
    let hasLeader = false;
    for (const entry of this.tabs.entries()) {
      const id = entry[0];
      const tab = entry[1];
      if (tab.leader) { hasLeader = true; break; }
    }
    if (hasLeader) { return; }
    // no leader do an election
    this.election();
  }

  elect() {
    this.attributes.leader = true;
    sessionStorage['tab.leader'] = this.id;
    this.update(true);
  }

  async election() {
    if (this.electing) { console.warn("dup electing"); return; }
    // ensure only 1 tab starts the election
    if (this.attributes.follower) { // only if we can become a leader should we do an election
      try {
        this.electing = true;
        await navigator.locks.request("tabs.election", {ifAvailable: true}, async (lock) => {
          const election = crypto.randomUUID();
          if (!lock) { console.warn("another tab doing election", election); return; }
          const promise = new Promise( (resolve, reject) => {
            let hasLeader = false;
            for (const entry of this.tabs.entries()) {
              const id = entry[0];
              const tab = entry[1];
              if (tab.leader) { hasLeader = id; break; }
            }
            if (hasLeader) { this.postElected(hasLeader); return; }
            if (this.electionTimer) { clearTimeout(this.electionTimer); }
            this.electionTimer = setTimeout( async () => {
              const priorityTabs = [];
              for (const entry of this.tabs.entries()) {
                const id = entry[0];
                const tab = entry[1];
                priorityTabs.push(entry);
              }
              priorityTabs.sort( (a, b) => {
                return a.created - b.created;
              });

              for (const entry of priorityTabs) {
                const id = entry[0];
                const tab = entry[1];
                if (tab.follower) {
                  this.postElected(id);
                  break;
                }
              }
              this.electionTimer = null;
              resolve();
            }, 200);
          });
          return promise;
        });
      } catch (e) {
        console.error(e);
      } finally {
        this.electing = false;
      }
    }
  }
  async postElected(id) {
    await navigator.locks.request("tabs.elect", {ifAvailable: true}, async (l) => {
      if (!l) { console.warn("lock not available"); return; }
      if (id == this.id) {
        this.elect();
      }
      this.bc.postMessage({action: 'elect', id: id});
      this.ping();
    });
  }
}

