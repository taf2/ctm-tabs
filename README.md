# CTM Tabs

Reliably detect and keep track of multiple tabs within your application.
Your users will open multiple tabs while using your web application.  You can use tabs to keep track of the 
tabs by id and mark a specific tab if it supports specific features such as voice (WebRTC) phone or other features.


# Usage

Simple tracking of tabs and their associated attributes
see: tabs.html

```html
<script src="tabs.js"></script>
<script>
  addEventListener('DOMContentLoaded', (event) => {
    const tabs = new Tabs("tabs-demo");
    tabs.on('update', (dirty, tabs) => {
      console.log("a tab was added removed or updated");
    });
    tabs.start();
  });
</script>
```

Leader/Follower, elect a single leader relying on web locks API to ensure atomic selection process.
see: tabs-leader.html

```html
<script src="tabs.js"></script>
<script src="tab-leader-follower.js"></script>
<script>
  addEventListener('DOMContentLoaded', (event) => {
    window.page = new TabLeaderFollower(new Tabs("tabs-demo"))
    tabs.on('update', (dirty, tabs) => {
      console.log("a tab was added removed or updated");
    });
    window.page.join();
  });
</script>
```

# Development/Testing
Chrome allows broadcast channel via file:// but Safari does not.  To test with Safari you can run ```sh serv.sh``` if you have python3 installed it'll open a websever on port 8912.
