document.querySelector("button.viewall").addEventListener("click", function() {
    chrome.tabs.create({
        url: "/projects/index.html"
    })
})

chrome.runtime.sendMessage({meta:"getUsernamePlus"},function(info){
    let username = info.uname


    function setSignedin(info) {
    if(info.signedin) {
        document.querySelector('#loggedout').style.display = 'none'
        document.querySelector('#normal').style.display = 'unset'
    } else {
        document.querySelector('#loggedout').style.display = 'unset'
        document.querySelector('#normal').style.display = 'none'
    }
    }
    setSignedin(info)

setTimeout(()=>{chrome.runtime.sendMessage({meta:"getUsernamePlus"},setSignedin)},1000)

    document.querySelector('#listtitle').innerHTML = username + "'s Allow&nbsp;List"


    let alreadyAdded = {}

    function addFriendGUI(name) {
        console.log(name)
        if(name?.toLowerCase() in alreadyAdded) {return}
        alreadyAdded[name.toLowerCase()] = true

        let item = document.createElement('li')
        item.username = name
        item.innerHTML = `<span class="friend-name" >@${name}</span>  <span class="x" href="page2.html">x</span>`;
        item.onclick=(e)=>{
            if(e.target?.classList?.contains('x')) {removeFriend(name)}
            else {chrome.tabs.create({url: `https://scratch.mit.edu/users/${name}`});}
        }
       
        document.querySelector('#friends').appendChild(item)
    }

    function addFriend(name) {
        if(name.toLowerCase() in alreadyAdded) {return}
        if(name.toLowerCase() == username.toLowerCase()) {return}
        if(!name.trim()) {return}
        if(name.includes(' ')) {return}
        document.querySelector('#searchh').value = ''
        addFriendGUI(name)
        fetch(`https://spore.us.to:4000/friends/${username}/${name}`,{method:"POST"});
    }

    function removeFriend(name) {
        delete alreadyAdded[name.toLowerCase()]
        for(let child of document.querySelector('#friends').children) {
            if(child.username == name) {child.remove(); break;}
        }
        fetch(`https://spore.us.to:4000/friends/${username}/${name}`,{method:"DELETE"});
    }

    document.querySelector('#searchh').addEventListener("keyup", function(event) {
        if (event.keyCode === 13) {
            addFriend(document.querySelector('#searchh').value)
        }
    });
    document.querySelector('#submit').onclick = ()=>{addFriend(document.querySelector('#searchh').value)}


    // populate with current friends
    fetch(`https://spore.us.to:4000/friends/${username}`)
        .then((res)=>{document.querySelector('#friends').innerHTML = '';return res})
        .then(res=>res.json().then(list=>list.forEach(addFriendGUI)))
        .catch(()=>{document.querySelector('#friends').innerHTML = '<span style="color:red;">Error: Request Failed :(<span>'})
});


document.getElementById('discord').onclick = ()=>{
    chrome.tabs.create({url: `https:\/\/discord.gg/9ZQQhvAvqp`});
}
document.getElementById('support').onclick = ()=>{
    chrome.tabs.create({url: `https://www.buymeacoffee.com/ilhp10`});
}
document.getElementById('rgantzos').onclick = ()=>{
    chrome.tabs.create({url: `https://scratch.mit.edu/users/rgantzos`});
}
document.getElementById('ilhp10').onclick = ()=>{
    chrome.tabs.create({url: `https://scratch.mit.edu/users/ilhp10`});
}

/// request permissions
(async()=>{
document.querySelector('#notifs').checked = (await chrome.storage.local.get(['notifs']))?.notifs ?? false
})()
document.querySelector('#notifs').addEventListener('change', (event) => {
    let on = event.currentTarget.checked;
    chrome.storage.local.set({notifs:on})
    // Permissions must be requested from inside a user gesture, like a button's
    // click handler.
    chrome.permissions.request({
      permissions: ['notifications'],
    }, (granted) => {
      // The callback argument will be true if the user granted the permissions.
      if (granted) {
        // doSomething();
      } else {
        chrome.storage.local.set({notifs:false})
        document.querySelector('#notifs').checked = false;
      }
    });
  });
  

let logo = document.getElementById('logo')
document.addEventListener('mousemove',(e)=>{
    logo.style.transform = (e.pageX > 190 && e.pageY < 137) ? `rotate(360deg)` : `rotate(0deg)`
})