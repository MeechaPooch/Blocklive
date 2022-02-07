// Listen for See Inside
chrome.tabs.onUpdated.addListener(function
  (tabId, changeInfo, tab) {
  // console.log("HIII")
  // read changeInfo data and do something with it (like read the url)
  if (changeInfo.url) {
    // do something here
    console.log(changeInfo.url)
  }
}
);

let ports = []
// Connections to scratch editor instances
chrome.runtime.onConnectExternal.addListener(function(port) {
  ports.push(port)
  // console.assert(port.name === "knockknock");
  port.onMessage.addListener(function(msg) {
    console.log(msg)
    if(msg.meta=="blockly.event" || msg.meta=="sprite.proxy"||msg.meta=="vm.blockListen"||msg.meta=="vm.shareBlocks") {
      ports.forEach(p=>{try{if(p!=port){p.postMessage(msg)}}catch(e){console.log(e)}})
    }
  });
  port.onDisconnect.addListener((p)=>ports.splice(ports.indexOf(port),1))
});


// Proxy project update messages
chrome.runtime.onMessageExternal.addListener(
  function (request, sender, sendResponse) {
    console.log("external message:" + request);
  });