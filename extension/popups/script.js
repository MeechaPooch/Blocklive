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
        item.innerHTML = `${name}  <span class="x" href="page2.html">(x)</span>`;
        item.children[0].onclick = ()=>{removeFriend(name)}
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