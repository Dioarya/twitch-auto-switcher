// ==UserScript==
// @name         Twitch Auto Switcher
// @version      0.9.6
// @downloadURL  https://github.com/dioarya/twitch-auto-switcher/raw/master/twitch-auto-switcher.user.js
// @updateURL    https://github.com/dioarya/twitch-auto-switcher/raw/master/twitch-auto-switcher.user.js
// @description  Automatically switches to a live Twitch streamer inside the customizable list, which nth *live* streamer chosen customizable per tab
// @author       Arxhield/Dioarya
// @match        https://www.twitch.tv/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // The list below is customizable.
    const streamers = ["papamutt", "markiplier", "moistcr1tikal", "ludwig", "cdawgva", "zajef77", "zy0xxx", "ottomated", "qtcinderella", "dish", "emiru", "rtgame", "slimecicle", "gigguk", "sallyisadog", "tinakitten", "fanfan", "39daph", "kkatamina", "disguisedtoast", "lilypichu", "pokimane", "masayoshi", "quarterjade", "scarra", "yvonnie", "itsryanhiga", "ariasaki", "gmhikaru", "gothamchess", "botezlive", "dantes", "loltyler1", "drututt", "keshaeuw", "hasanabi", "shroud", "btmc", "zhangkuu", "vincewuff", "skaifox", "zephyxus", "toastedtoastertv", "valorant", "lifeline", "tarik", "kyedae", "ninja", "kettletoro", "glittr", "okcode", "xlice", "hilto77", "branonline", "asianguystream", "enviosity", "tsikyo", "doro44", "mtashed", "xqc", "binfy", "zylice", "kariyu", "aceu", "philza", "tubbo", "sneegsnag", "wilbursoot", "quackitytoo", "tapl", "foolish_gamers", "gosugeneraltv", "zyruvias", "jackie_codes", "fedmyster"];
    let currentLiveStreamer = null;
    let liveStreamers = [];
    let liveStreamersLastUpdate = Date.now();
    let autoSwitch = (JSON.parse(localStorage.getItem("nthLiveStreamerList")) ?? []).length != 0;
    let initialized = false;
    let scanning = false;
    const status = document.createElement("span");
    const label = document.createElement("span");
    const dropdown = document.createElement("div");
    var golden = goldenAvailable();

    let style = document.createElement("style");
    style.textContent = `
    .unselectable {
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        -khtml-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
        user-select: none;
    }

    .twitch-switcher-hud {
        display: flex;
        align-items: center;
        background-color: var(--color-opac-gd-1);
        border-radius: 5px;
        gap: 10px;
        margin-top: 10px;
        margin-bottom: 10px;
        padding-left: 10px;
        padding-right: 10px;
    }

    .twitch-switcher-status {
        padding: 10px;
        white-space: nowrap;
    }

    .twitch-switcher-dropdown {
        display: block;
        position: relative;
        width: 100%;
    }

    .twitch-switcher-label {
        border-radius: 5px;
        white-space: nowrap;
    }

    .twitch-switcher-input {
        width: 30px;
    }

    .twitch-switcher-autoswitch {

    }

    .twitch-switcher-dropdown-content {
        display: none;
        position: absolute;
        white-space: nowrap;
        background-color: var(--color-hinted-grey-1);
        width: 100%;
        overflow-x: auto;
        flex-direction: column;
        border-radius: 5px;
        padding: 5px;
    }
    `;

    // TODO: Add a switch for status:
    //           - X symbol red uninitialized
    //           - check symbol green initialized
    //           - fraction for progress

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

    function goldenAvailable() {
        return (Date.now() - (localStorage.getItem("goldenLastSeen") ?? 0) > 5000);
    }

    async function heartbeatGolden() {
        if (golden) {
            localStorage.setItem("goldenLastSeen", Date.now());
        }
        if (goldenAvailable()) {
            golden = true;
            label.style.color = "gold";
            localStorage.setItem("goldenLastSeen", Date.now());
            if (!initialized) await updateLiveStreamers();
        }
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
        element.addEventListener("mouseover", () => { element.style.backgroundColor = "rgba(83, 83, 95, 0.38)"; });
        element.addEventListener("mouseout", () => { element.style.backgroundColor = ""; });
        return element;
    }

    async function toggleDropdown() {
        const dropdown = document.getElementById("twitch-switcher-dropdown-content");
        let nextDisplay = dropdown.style.display === "flex" ? "none" : "flex";
        if (nextDisplay != "none") {
            if (!initialized) updateLiveStreamers(true);
            updateDropdown();
        }
        dropdown.style.display = nextDisplay;
    }

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
            if (Date.now() - liveStreamersLastUpdateGolden <= 30000) {
                initialized = true;
                liveStreamers = liveStreamersGolden;
                liveStreamersLastUpdate = liveStreamersLastUpdateGolden;
            }
        }
    }

    function createUI() {
        const container = document.createElement("div");
        container.className = "twitch-switcher-hud";

        status.className = "twitch-switcher-status";
        status.hidden = true;

        const container2 = document.createElement("div");
        container2.classList = "unselectable twitch-switcher-dropdown";

        label.textContent = "Twitch Switcher v0.9.5";
        label.className = "twitch-switcher-label";
        label.id = "twitch-switcher-dropdown-btn";
        label.addEventListener("mouseover", () => { label.style.backgroundColor = "var(--color-opac-gd-1)"; });
        label.addEventListener("mouseout", () => { label.style.backgroundColor = ""; });
        label.addEventListener("click", toggleDropdown);

        const input = document.createElement("input");
        input.className = "twitch-switcher-input";
        input.type = "number";
        input.min = "0";
        input.id = "twitch-switcher-input";
        let nthLiveStreamerList = JSON.parse(localStorage.getItem("nthLiveStreamerList")) ?? [];
        if (nthLiveStreamerList.length == 0) nthLiveStreamerList = [0];
        input.value = nthLiveStreamerList.shift();
        localStorage.setItem("nthLiveStreamerList", JSON.stringify(nthLiveStreamerList));

        const checkbox = document.createElement("input");
        checkbox.className = "twitch-switcher-autoswitch"
        checkbox.type = "checkbox";
        checkbox.checked = autoSwitch;
        checkbox.addEventListener("change", () => {
            autoSwitch = checkbox.checked;
            if (autoSwitch) updateCurrentStreamer();
        });

        dropdown.className = "twitch-switcher-dropdown-content"
        dropdown.id = "twitch-switcher-dropdown-content";

        container2.appendChild(label);
        container2.appendChild(dropdown);

        container.appendChild(status);
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

        status.hidden = false;
        status.textContent = `0 / ${streamers.length}`;

        const promises = streamers.map(username => checkIfLive(username));

        const newLiveStreamers = [];
        for (let i = 0; i < streamers.length; i++) {
            const isLive = await promises[i];

            if (isLive) {
                newLiveStreamers.push(streamers[i]);
            }

            status.textContent = `${i + 1} / ${streamers.length}`;
        }

        status.hidden = true;
        status.textContent = "";
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
                await updateLiveStreamers();
            }
        }

        const nthLiveStreamer = parseInt(document.getElementById("twitch-switcher-input").value) || 0;
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
        const dropdown = document.getElementById("twitch-switcher-dropdown-content");
        const button = document.getElementById("twitch-switcher-dropdown-btn");

        if (!dropdown.contains(event.target) && !button.contains(event.target)) {
            dropdown.style.display = "none";
        }
    });

})();
