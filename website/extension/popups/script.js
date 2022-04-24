chrome.runtime.sendMessage({meta:"getUsername"},function(username){

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
        fetch(`http://spore.us.to:4000/friends/${username}/${name}`,{method:"POST"});
    }

    function removeFriend(name) {
        delete alreadyAdded[name.toLowerCase()]
        for(let child of document.querySelector('#friends').children) {
            if(child.username == name) {child.remove(); break;}
        }
        fetch(`http://spore.us.to:4000/friends/${username}/${name}`,{method:"DELETE"});
    }

    document.querySelector('#searchh').addEventListener("keyup", function(event) {
        if (event.keyCode === 13) {
            addFriend(document.querySelector('#searchh').value)
        }
    });
    document.querySelector('#submit').onclick = ()=>{addFriend(document.querySelector('#searchh').value)}


    // populate with current friends
    fetch(`http://spore.us.to:4000/friends/${username}`).then(res=>res.json().then(list=>list.forEach(addFriendGUI)))
});


