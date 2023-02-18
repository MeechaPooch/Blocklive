// Copied from scratch addons https://github.com/ScratchAddons/ScratchAddons/blob/43b8721988251c77c597427afe58c420748ef76a/content-scripts/prototype-handler.js
// Authored by apple502j, towerofnix and WorldLanguages
function injectPrototype() {
    console.log("injecting prototype!")
    const oldBind = Function.prototype.bind;
    // Use custom event target
    window.__scratchAddonsTraps = new EventTarget();
    const onceMap = (__scratchAddonsTraps._onceMap = Object.create(null));
  
    Function.prototype.bind = function (...args) {
      if (Function.prototype.bind === oldBind) {
        // Just in case some code stores the bind function once on startup, then always uses it.
        return oldBind.apply(this, args);
      } else if (
        args[0] &&
        Object.prototype.hasOwnProperty.call(args[0], "editingTarget") &&
        Object.prototype.hasOwnProperty.call(args[0], "runtime")
      ) {
        onceMap.vm = args[0];
        // After finding the VM, return to previous Function.prototype.bind
        Function.prototype.bind = oldBind;
        return oldBind.apply(this, args);
      } else {
        return oldBind.apply(this, args);
      }
    };
  }
  
  if (!(document.documentElement instanceof SVGElement) && location.pathname.split("/")[1] === "projects") {
    const injectPrototypeScript = document.createElement("script");
    injectPrototypeScript.append(document.createTextNode("(" + injectPrototype + ")()"));
    (document.head || document.documentElement).appendChild(injectPrototypeScript);
  }