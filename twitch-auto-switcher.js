// ==UserScript==
// @name         Twitch Auto Switcher
// @namespace    http://tampermonkey.net/
// @version      0.9.4
// @downloadURL  https://github.com/dioarya/twitch-auto-switcher/raw/master/twitch-auto-switcher.js
// @updateURL    https://github.com/dioarya/twitch-auto-switcher/raw/master/twitch-auto-switcher.js
// @description  Automatically switches to a live Twitch streamer inside the customizable list, which nth *live* streamer chosen customizable per tab
// @author       Arxhield
// @match        https://www.twitch.tv/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let style = document.createElement("style");
    style.textContent = `
    .unselectable {
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        -khtml-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
        user-select: none;
    }`;

    document.head.appendChild(style);

    Object.defineProperty(document, "hidden", { get: () => false, configurable: true });
    Object.defineProperty(document, "visibilityState", { get: () => "visible", configurable: true });
    Object.defineProperty(document, "webkitVisibilityState", { get: () => "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    document.hasFocus = () => true;
    window.localStorage.setItem("video-quality", '{"default":"chunked"}');

    async function checkIfLive(username, retries = 3) {
        const query = {
            query: `query {
              user(login: "${username}") {
                stream {
                  id
                }
              }
            }`,
            variables: {}
        };

        try {
            const response = await fetch("https://gql.twitch.tv/gql", {
                method: "POST",
                headers: {
                    "client-id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(query)
            });

            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

            const data = await response.json();
            return Boolean(data.data?.user?.stream);
        } catch (error) {
            console.error(`Error fetching Twitch data for ${username}:`, error);

            if (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                return checkIfLive(username, retries - 1);
            }
            return false;
        }
    }

    async function heartbeatGolden() {
        if (golden) {
            label.style.color = "gold";
            localStorage.setItem("goldenLastSeen", Date.now());
        }
        if (goldenAvailable()) {
            golden = true;
            localStorage.setItem("goldenLastSeen", Date.now());
            if (!initialized) await updateLiveStreamers();
        }
    }

    function goldenAvailable() {
        return (Date.now() - (localStorage.getItem("goldenLastSeen") ?? 0) > 5000);
    }

    function updateDropdown() {
        dropdown.innerHTML = "";
        for (const streamer of liveStreamers) {
            dropdown.appendChild(createDropdownElement(streamer));
        }
    }

    function createDropdownElement(username) {
        const elementSpan = document.createElement("span");
        let element = elementSpan;
        let elementA;
        elementSpan.textContent = username;
        elementSpan.style.whiteSpace = "nowrap";
        elementSpan.style.color = "white";

        if (window.location.href == `https://www.twitch.tv/${username}`) {
            element.style.color = "gold";
        } else {
            elementA = document.createElement("a");
            elementA.href = `/${username}`;
            elementA.appendChild(elementSpan);
            element = elementA;
        }

        element.style.borderRadius = "4px";
        element.addEventListener("mouseover", () => { element.style.backgroundColor = "rgba(255, 255, 255, 0.1)"; });
        element.addEventListener("mouseout", () => { element.style.backgroundColor = ""; });
        return element;
    }

    async function toggleDropdown() {
        const dropdown = document.getElementById("twitch-switcher-dropdown");
        let nextDisplay = dropdown.style.display === "flex" ? "none" : "flex";
        if (nextDisplay != "none") {
            if (!initialized) await updateLiveStreamers(true);
            updateDropdown();
        }
        dropdown.style.display = nextDisplay;
    }

    // The list below is customizable.
    const streamers = ["papamutt", "markiplier", "moistcr1tikal", "ludwig", "cdawgva", "zajef77", "zy0xxx", "ottomated", "qtcinderella", "dish", "emiru", "rtgame", "slimecicle", "gigguk", "sallyisadog", "tinakitten", "fanfan", "39daph", "kkatamina", "disguisedtoast", "lilypichu", "pokimane", "masayoshi", "quarterjade", "scarra", "yvonnie", "itsryanhiga", "ariasaki", "gmhikaru", "gothamchess", "botezlive", "dantes", "loltyler1", "drututt", "keshaeuw", "hasanabi", "shroud", "btmc", "zhangkuu", "vincewuff", "skaifox", "zephyxus", "toastedtoastertv", "valorant", "lifeline", "tarik", "kyedae", "ninja", "kettletoro", "glittr", "okcode", "xlice", "hilto77", "branonline", "asianguystream", "enviosity", "tsikyo", "doro44", "mtashed", "xqc", "binfy", "zylice", "kariyu", "aceu", "philza", "tubbo", "sneegsnag", "wilbursoot", "quackitytoo", "tapl", "foolish_gamers", "gosugeneraltv", "zyruvias", "jackie_codes", "fedmyster"];
    let currentLiveStreamer = null;
    let liveStreamers = [];
    let liveStreamersLastUpdate = Date.now();
    let autoSwitch = (JSON.parse(localStorage.getItem("nthLiveStreamerList")) ?? []).length != 0;
    let initialized = false;
    let scanning = false;
    var golden = goldenAvailable();
    var progress = document.createElement("span");
    var label = document.createElement("span");
    var dropdown = document.createElement("div");

    function saveSyncState() {
        if (golden) {
            localStorage.setItem("liveStreamers", JSON.stringify(liveStreamers));
            localStorage.setItem("liveStreamersLastUpdate", liveStreamersLastUpdate);
        }
    }

    function getSyncState() {
        if (!golden) {
            let liveStreamersGolden = JSON.parse(localStorage.getItem("liveStreamers")) ?? [];
            let liveStreamersLastUpdateGolden = JSON.parse(localStorage.getItem("liveStreamersLastUpdate")) ?? 0;
            localStorage.setItem("liveStreamersLastObserved", Date.now());
            if (liveStreamersLastUpdateGolden - Date.now() <= 30000) {
                initialized = true;
                liveStreamers = liveStreamersGolden;
                liveStreamersLastUpdate = liveStreamersLastUpdateGolden;
            }
        }
    }


    function createUI() {
        const container = document.createElement("div");
        container.style.display = "flex";
        container.style.alignItems = "center";
        container.style.margin = "10px";
        container.style.backgroundColor = "rgba(83, 83, 95, 0.38)";
        container.style.borderRadius = "4px";

        progress.textContent = "";
        progress.hidden = true;
        progress.style.margin = "5px";
        progress.style.whiteSpace = "nowrap";

        const container2 = document.createElement("div");
        container2.style.position = "relative";
        container2.style.display = "block";
        container2.style.width = "100%";
        container2.className = "unselectable";

        label.id = "twitch-switcher-dropdown-btn"
        label.textContent = "Twitch Switcher v1.9";
        label.style.margin = "5px";
        label.style.borderRadius = "5px";
        label.style.whiteSpace = "nowrap";
        label.addEventListener("mouseover", () => { element.style.backgroundColor = "rgba(255, 255, 255, 0.1)"; });
        label.addEventListener("mouseout", () => { element.style.backgroundColor = ""; });
        label.addEventListener("click", toggleDropdown);

        const input = document.createElement("input");
        input.type = "number";
        input.min = "0";
        input.style.width = "30px";
        input.style.margin = "10px";
        input.id = "twitchSwitcherInput";
        let nthLiveStreamerList = JSON.parse(localStorage.getItem("nthLiveStreamerList")) ?? [];
        if (nthLiveStreamerList.length == 0) nthLiveStreamerList = [0];
        input.value = nthLiveStreamerList.shift();
        localStorage.setItem("nthLiveStreamerList", JSON.stringify(nthLiveStreamerList));

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = autoSwitch;
        checkbox.style.margin = "10px";
        checkbox.id = "twitchSwitcherCheckbox";
        checkbox.addEventListener("change", () => {
            autoSwitch = checkbox.checked;
            if (autoSwitch) updateCurrentStreamer();
        });

        dropdown.id = "twitch-switcher-dropdown";
        dropdown.style.display = "none";
        dropdown.style.position = "absolute";
        dropdown.style.whiteSpace = "nowrap";
        dropdown.style.backgroundColor = "rgb(24, 24, 27)";
        dropdown.style.width = "100%";
        dropdown.style.overflowX = "auto";
        dropdown.style.flexDirection = "column";
        dropdown.style.borderRadius = "5px";
        dropdown.style.padding = "5px";
        dropdown.style.border = "rgba(255, 255, 255, 0.3)";

        container2.appendChild(label);
        container2.appendChild(dropdown);

        container.appendChild(progress);
        container.appendChild(container2);
        container.appendChild(input);
        container.appendChild(checkbox);

        const target = document.evaluate('//*[@id="root"]/div/div[1]/nav/div/div[3]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        if (target) target.parentNode.insertBefore(container, target);
    }

    async function updateLiveStreamers(force = false) {
        if (!force) {
            if (!golden || scanning) return;
            let liveStreamersLastObserved = JSON.parse(localStorage.getItem("liveStreamersLastObserved")) ?? Date.now();
            if (!(Date.now() - liveStreamersLastObserved < 10000 || autoSwitch)) return;
        }
        scanning = true;

        progress.hidden = false;
        progress.textContent = `0 / ${streamers.length}`;

        const promises = streamers.map(username => checkIfLive(username));

        const newLiveStreamers = [];
        for (let i = 0; i < streamers.length; i++) {
            const isLive = await promises[i];

            if (isLive) {
                newLiveStreamers.push(streamers[i]);
            }

            progress.textContent = `${i + 1} / ${streamers.length}`;
        }

        progress.hidden = true;
        initialized = true;
        liveStreamers = newLiveStreamers;
        liveStreamersLastUpdate = Date.now();
        saveSyncState();
        scanning = false;
    }

    async function updateCurrentStreamer() {
        if (!autoSwitch || !initialized) return;

        if (currentLiveStreamer) {
            const isLive = await checkIfLive(currentLiveStreamer);
            if (!isLive) {
                currentLiveStreamer = null;
            }
        }

        const nthLiveStreamer = parseInt(document.getElementById("twitchSwitcherInput").value) || 0;
        const selectedStreamer = liveStreamers[nthLiveStreamer] || "dioarya";
        if (currentLiveStreamer !== selectedStreamer) {
            currentLiveStreamer = selectedStreamer;
            if (window.location.href !== `https://www.twitch.tv/${selectedStreamer}`) {
                let nthLiveStreamerList = JSON.parse(localStorage.getItem("nthLiveStreamerList")) ?? [];
                nthLiveStreamerList.push(nthLiveStreamer);
                localStorage.setItem("nthLiveStreamerList", JSON.stringify(nthLiveStreamerList));
                window.location.href = `https://www.twitch.tv/${selectedStreamer}`;
            }
        }
    }

    heartbeatGolden();
    setInterval(heartbeatGolden, 1000);

    createUI();

    setInterval(getSyncState, 5000);
    setInterval(updateLiveStreamers, 30000);
    setInterval(updateCurrentStreamer, 3000);
    getSyncState();
    updateLiveStreamers();
    updateCurrentStreamer();

    document.addEventListener("click", function(event) {
        const dropdown = document.getElementById("twitch-switcher-dropdown");
        const button = document.getElementById("twitch-switcher-dropdown-btn");

        if (!dropdown.contains(event.target) && !button.contains(event.target)) {
            dropdown.style.display = "none";
        }
    });

})();
