// ==UserScript==
// @name         Twitch Auto Switcher
// @version      0.9.7
// @downloadURL  https://github.com/dioarya/twitch-auto-switcher/raw/master/twitch-auto-switcher.user.js
// @updateURL    https://github.com/dioarya/twitch-auto-switcher/raw/master/twitch-auto-switcher.user.js
// @description  Automatically switches to a live Twitch streamer inside the customizable list, which nth *live* streamer chosen customizable per tab
// @author       Arxhield/Dioarya
// @match        https://www.twitch.tv/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const VERSION = "0.9.7";

    // The list below is customizable.
    const streamers = ["papamutt", "markiplier", "moistcr1tikal", "ludwig", "cdawgva", "zajef77", "zy0xxx", "ottomated", "qtcinderella", "dish", "emiru", "rtgame", "slimecicle", "gigguk", "sallyisadog", "tinakitten", "fanfan", "39daph", "kkatamina", "disguisedtoast", "lilypichu", "pokimane", "masayoshi", "quarterjade", "scarra", "yvonnie", "itsryanhiga", "ariasaki", "gmhikaru", "gothamchess", "botezlive", "dantes", "loltyler1", "drututt", "keshaeuw", "hasanabi", "shroud", "btmc", "zhangkuu", "vincewuff", "skaifox", "zephyxus", "toastedtoastertv", "valorant", "lifeline", "tarik", "kyedae", "ninja", "kettletoro", "glittr", "okcode", "xlice", "hilto77", "branonline", "asianguystream", "enviosity", "tsikyo", "doro44", "mtashed", "xqc", "binfy", "zylice", "kariyu", "aceu", "philza", "tubbo", "sneegsnag", "wilbursoot", "quackitytoo", "tapl", "foolish_gamers", "gosugeneraltv", "zyruvias", "jackie_codes", "fedmyster"];
    const app = document.createElement("div");
    let currentLiveStreamer = null;
    let liveStreamers = [];
    let liveStreamersLastUpdate = Date.now();
    let autoSwitch = false;
    let initialized = false;
    let scanning = false;
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
        flex-direction: row;
        gap: 10px;
        align-items: center;
        background-color: var(--color-opac-gd-1);
        border-radius: 0px 0px 5px 5px;
        margin: 0px 0px 10px 0px;
        padding: 5px 10px;
    }

    .twitch-switcher-status {
        padding: 10px;
        white-space: nowrap;
    }

    .twitch-switcher-dropdown {
        display: block;
        height: 100%;
    }

    .twitch-switcher-dropdown-btn {
        display: flex;
        border-radius: 5px;
        align-items: center;
        width: 100%;
        height: 100%;
        background-color: transparent;
        transition: background-color 0.1s;
    }

    .twitch-switcher-dropdown-btn:hover {
        background-color: var(--color-opac-gd-1);
    }

    .twitch-switcher-label {
        white-space: nowrap;
        color: white;
    }

    .twitch-switcher-input {
        width: 30px;
    }

    .twitch-switcher-checkbox {
        position: relative;
        display: flex;
        height: 100%;
        aspect-ratio: 1 / 1;
    }

    .twitch-switcher-checkbox input {
        position: relative;
        cursor: pointer;
        opacity: 100%;
        width: 100%;
        height: 100%;
    }

    .twitch-switcher-checkmark {
        position: absolute;
        top: 0px;
        left: 0px;
        width: 100%;
        height: 100%;
    }

    .twitch-switcher-dropdown-content {
        display: none;
        position: relative;
        white-space: nowrap;
        background-color: var(--color-hinted-grey-2);
        min-width: 100%;
        flex-direction: column;
        border-radius: 5px;
        padding: 5px;
    }

    .twitch-switcher-dropdown-item {
        display: inline;
        border-radius: 5px;
        white-space: nowrap;
        color: white;
        background-color: transparent;
    }

    .twitch-switcher-dropdown-item:hover {
        background-color: var(--color-opac-gd-1);
    }

    .golden {
        color: gold;
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
            let label = document.getElementById("twitch-switcher-label");
            label.classList.add(["golden"]);
            localStorage.setItem("goldenLastSeen", Date.now());
            if (!initialized) await updateLiveStreamers();
        }
    }

    function updateDropdown() {
        const dropdown = document.getElementById("twitch-switcher-dropdown-content")
        dropdown.innerHTML = "";
        for (const streamer of liveStreamers) {
            dropdown.appendChild(createDropdownElement(streamer));
        }
    }

    function createDropdownElement(username) {
        const elementSpan = document.createElement("span");
        let classList = ["twitch-switcher-dropdown-item"];
        let element = elementSpan;
        let elementA;
        elementSpan.textContent = username;

        if (window.location.href == `https://www.twitch.tv/${username}`) {
            classList.push('golden');
        } else {
            elementA = document.createElement("a");
            elementA.href = `/${username}`;
            elementA.appendChild(elementSpan);
            element = elementA;
        }

        element.classList.add(...classList);
        return element;
    }

    async function toggleDropdown() {
        const dropdown = document.getElementById("twitch-switcher-dropdown-content");
        let nextDisplay = dropdown.style.display === "flex" ? "none" : "flex";
        if (nextDisplay != "none") {
            if (!initialized) await updateLiveStreamers(true);
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
        app.className = "twitch-switcher-hud";

        app.innerHTML = `
        <span class="twitch-switcher-status" id="twitch-switcher-status" hidden>

        </span>
        <div class="unselectable twitch-switcher-dropdown">
            <div class="twitch-switcher-dropdown-btn" id="twitch-switcher-dropdown-btn">
                <span class="twitch-switcher-label" id="twitch-switcher-label">
                    Twitch Switcher v${VERSION}
                </span>
            </div>
            <div class="twitch-switcher-dropdown-content" id="twitch-switcher-dropdown-content">

            </div>
        </div>
        <input class="twitch-switcher-input" id="twitch-switcher-input" type="number" min="0" value="0">
        <div class="twitch-switcher-checkbox">
            <input id="twitch-switcher-autoswitch" type="checkbox" checked="false">
            <!-- <span class="twitch-switcher-checkmark"></span> -->
        </div>
        `

        const target = document.evaluate('//*[@id="root"]/div/div[1]/nav/div/div[3]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        if (target) target.parentNode.insertBefore(app, target);

        let element;
        element = document.getElementById("twitch-switcher-dropdown-btn");
        element.addEventListener("click", toggleDropdown);

        element = document.getElementById("twitch-switcher-autoswitch");
        element.addEventListener("change", () => {
            autoSwitch = element.checked;
            if (autoSwitch) updateCurrentStreamer();
        });
    }

    function syncUiState() {
        let element;

        let nthLiveStreamerList = JSON.parse(localStorage.getItem("nthLiveStreamerList")) ?? []
        autoSwitch = (nthLiveStreamerList).length != 0;

        element = document.getElementById("twitch-switcher-input");
        if (nthLiveStreamerList.length == 0) nthLiveStreamerList = [0];
        element.value = nthLiveStreamerList.shift();
        localStorage.setItem("nthLiveStreamerList", JSON.stringify(nthLiveStreamerList));

        element = document.getElementById("twitch-switcher-autoswitch");
        element.checked = autoSwitch;
    }

    async function updateLiveStreamers(force = false) {
        if (!force) {
            if (!golden || scanning) return;
            let liveStreamersLastObserved = JSON.parse(localStorage.getItem("liveStreamersLastObserved")) ?? Date.now();
            if (!(Date.now() - liveStreamersLastObserved < 10000 || autoSwitch)) return;
        }
        scanning = true;

        const status = document.getElementById("twitch-switcher-status");

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
        updateDropdown();
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
    syncUiState();

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
