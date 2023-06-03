async function getProjects() {
  res = await fetch("https://scratch.mit.edu/session/?blreferer", {
    headers: {
      "X-Requested-With": "XMLHttpRequest",
    },
  });
  let json = await res.json();
  var data = await (
    await fetch(
      `https://spore.us.to:4000/userProjectsScratch/${json.user.username}/`
    )
  ).json();
  data.forEach(function (project) {
    var div = document.createElement("div");
    div.className = "project";

    var img = document.createElement("img");
    img.src = `https://cdn2.scratch.mit.edu/get_image/project/${project.scratchId}_480x360.png`;

    var title = document.createElement("span");
    title.className = "title";
    title.textContent = project.title;

    div.appendChild(img);
    div.appendChild(title);
    document.querySelector(".projects").appendChild(div);

    div.addEventListener("click", function () {
      chrome.tabs.create({
        url: `https://scratch.mit.edu/projects/${project.scratchId}/editor`,
      });
    });
  });
}
getProjects();
