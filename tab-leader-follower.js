class TabLeaderFollower extends Tabs {
  constructor(channel, attributes={}) {
    super(channel, attributes);
    this.attributes.leader = false;
    this.attributes.follower = true;
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
    console.log("elected!", this.id);
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
            console.log("start election", election);
            let hasLeader = false;
            for (const entry of this.tabs.entries()) {
              const id = entry[0];
              const tab = entry[1];
              if (tab.leader) { hasLeader = id; console.log("found leader:", tab); break; }
            }
            if (hasLeader) { console.log("skip already have a leader", hasLeader); this.postElected(hasLeader); return; }
            setTimeout( async () => {
              console.log("do election?", this.tabs);
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
                console.log("can tab be elected?", tab);
                if (tab.follower) {
                  this.postElected(id);
                  break;
                }
              }
              resolve();
            }, 200);
          });
          return promise;
        });
      } catch (e) {
        console.error(e);
      } finally {
        console.log("done")
        this.electing = false;
      }
    }
  }
  async postElected(id) {
    console.log("elect tab:", id);
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

