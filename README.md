# CTM Tabs

Reliably detect and keep track of multiple tabs within your application.
Your users will open multiple tabs while using your web application.  You can use tabs to keep track of the 
tabs by id and mark a specific tab if it supports specific features such as voice (WebRTC) phone or other features.


# Usage

```
  addEventListener('DOMContentLoaded', (event) => {
    const params = new URLSearchParams(window.location.search);
    window.tabs = new Tabs("tabs-demo", "#tabs", {canLeader: !params.get("notLeader")});
    window.tabs.start();
  });
```
