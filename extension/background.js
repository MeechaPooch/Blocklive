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








// Proxy project update messages
chrome.runtime.onMessage.addListener(
  function (request, sender, sendResponse) {
    console.log(request);
  });