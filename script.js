const DYNMAP_SERVER_ADDRESS = 'https://map.torosaba.net';
const DYNMAP_WORLD_NAME = 'main';
const DYNMAP_MARKERS_API_ENDPOINT = `${DYNMAP_SERVER_ADDRESS}/tiles/_markers_/marker_${DYNMAP_WORLD_NAME}.json`;
const DYNMAP_UPDATE_API_ENDPOINT = `${DYNMAP_SERVER_ADDRESS}/up/world/${DYNMAP_WORLD_NAME}/`;
const PLAYER_TRACKING_INTERVAL = 1000;
const DYNMAP_ICON_BASE_URL = `${DYNMAP_SERVER_ADDRESS}/tiles/_markers_/`;
const PLAYER_ARROW_ICON_URL = `icon.png`; // 絶対パスに変更
const DYNMAP_MIN_NATIVE_ZOOM = 0;
const DYNMAP_MAX_NATIVE_ZOOM = 5;
const LEAFLET_MIN_ZOOM = 0;
const LEAFLET_MAX_ZOOM = DYNMAP_MAX_NATIVE_ZOOM - DYNMAP_MIN_NATIVE_ZOOM + 5;
const DYNMAP_INITIAL_LEAFLET_ZOOM = 1;

// --- グローバル変数 ---
let map;
let playerMarker;
let dynmapPinsLayer = L.layerGroup();
let dynmapLinesLayer = L.layerGroup();
let allPlayersLayer = L.layerGroup();
let allPinsData = [];
let allLinesData = [];
let trackedPlayerNameGlobal = null;
let playerTrackingIntervalId = null;
let lastKnownPlayerDynmapCoords = null;
let previousTrackedPlayerPosition = null;
let otherPlayerMarkers = {};
let isFollowingPlayer = false;
let programmaticMove = false;
let currentMapRotation = 0;
let selectedPlayerForTracking = null;
let userInteractionDetected = false;

// DOM要素
let mapContainer;
let mapDiv;
let loadingMessageMap;
let playerSelectBtn;
let trackingToggleBtn;
let playerSelectModal;
let modalPlayerList;
let trackedPlayerNameDisplay;
let playerDynmapCoordsDisplay;
let playerWorldDisplay;
let roadDisplay;
let facilitiesList;
let statusMessageArea;

// --- 初期化 ---
document.addEventListener('DOMContentLoaded', async () => {
    mapContainer = document.getElementById('map-container');
    mapDiv = document.getElementById('map');
    loadingMessageMap = mapDiv.querySelector('.loading-message');
    playerSelectBtn = document.getElementById('player-select-btn');
    trackingToggleBtn = document.getElementById('tracking-toggle-btn');
    playerSelectModal = document.getElementById('player-select-modal');
    modalPlayerList = document.getElementById('modal-player-list');
    trackedPlayerNameDisplay = document.getElementById('tracked-player-name');
    playerDynmapCoordsDisplay = document.getElementById('player-dynmap-coords');
    playerWorldDisplay = document.getElementById('player-world');
    roadDisplay = document.getElementById('current-road');
    facilitiesList = document.getElementById('nearby-facilities');
    statusMessageArea = document.getElementById('status-message-area');

    // マップdivのサイズ調整
    function resizeMapDiv() {
        if (mapContainer && mapDiv) {
            mapDiv.style.width = mapContainer.offsetWidth + "px";
            mapDiv.style.height = mapContainer.offsetHeight + "px";
        }
    }
    resizeMapDiv();
    window.addEventListener('resize', resizeMapDiv);

    // イベントリスナー
    if (playerSelectBtn) playerSelectBtn.addEventListener('click', openPlayerSelectModal);
    if (trackingToggleBtn) trackingToggleBtn.addEventListener('click', toggleTracking);
    if (playerSelectModal) {
        playerSelectModal.addEventListener('click', (e) => {
            if (e.target === playerSelectModal) closePlayerSelectModal();
        });
    }

    try {
        map = L.map('map', {
            crs: L.CRS.Simple,
            minZoom: LEAFLET_MIN_ZOOM,
            maxZoom: LEAFLET_MAX_ZOOM,
        }).setView([0, 0], DYNMAP_INITIAL_LEAFLET_ZOOM);

        // タイルレイヤーの追加
        L.tileLayer(`${DYNMAP_SERVER_ADDRESS}/tiles/${DYNMAP_WORLD_NAME}/flat/{z}/{x}_{y}.png`, {
       
        });

        dynmapPinsLayer.addTo(map);
        dynmapLinesLayer.addTo(map);
        allPlayersLayer.addTo(map);

        // Dynmapデータの読み込み
        await loadDynmapStaticData();
        centerMapOnSpawn();
        if (loadingMessageMap) loadingMessageMap.style.display = 'none';
    } catch (error) {
        console.error("マップ初期化エラー:", error);
        if (loadingMessageMap) loadingMessageMap.textContent = "マップの読み込みに失敗しました。";
        const errorBox = document.createElement('div');
        errorBox.className = 'error-message';
        errorBox.textContent = `マップの初期化に失敗しました: ${error.message}`;
        mapDiv.replaceChildren(errorBox);
        return;
    }

    // マップ移動時の追跡停止
    map.on('movestart', function() {
        if (programmaticMove) {
            programmaticMove = false;
            return;
        }
        if (isFollowingPlayer) {
            stopPlayerTracking();
            statusMessageArea.textContent = "マップを動かすと追跡は停止します。";
            statusMessageArea.className = 'status-message';
            rotateMap(0);
            if (trackedPlayerNameGlobal && playerMarker) {
                fetchAndUpdatePlayerData();
            }
        }
    });

    // プレイヤーデータの定期取得開始
    fetchAndUpdatePlayerData();
});

// --- 外部データの文字列の表示 ---
// Leaflet のポップアップとツールチップは、文字列を HTML として扱う。Dynmap から来る文字列は要素にして渡す
function textSpan(text) {
    const span = document.createElement('span');
    span.textContent = text;
    return span;
}

function popupWithCoords(titleTag, title, coordsText) {
    const box = document.createElement('div');
    const titleEl = document.createElement(titleTag);
    titleEl.textContent = title;
    box.append(titleEl, document.createElement('br'), coordsText);
    return box;
}

// Dynmap のラベルや説明は HTML のことがある。DOMParser はスクリプトも画像も動かさないので、文字だけを取り出して使う
function plainLabel(value, fallback) {
    if (typeof value !== 'string' || value === '') return String(fallback);
    const text = new DOMParser().parseFromString(value, 'text/html').body.textContent.trim();
    return text || String(fallback);
}

function playerAvatarUrl(account) {
    return `https://mc-heads.net/avatar/${encodeURIComponent(account)}`;
}

// --- プレイヤー選択モーダル ---
function openPlayerSelectModal() {
    updateModalPlayerList();
    playerSelectModal.style.display = 'flex';
}
function closePlayerSelectModal() {
    playerSelectModal.style.display = 'none';
}
function updateModalPlayerList() {
    modalPlayerList.innerHTML = '<li class="player-item">プレイヤーを読み込み中...</li>';
    fetch(`${DYNMAP_UPDATE_API_ENDPOINT}?_=${new Date().getTime()}`)
        .then(response => response.json())
        .then(data => {
            modalPlayerList.innerHTML = '';
            if (data.players && data.players.length > 0) {
                const mainWorldPlayers = data.players.filter(player => player.world === DYNMAP_WORLD_NAME);
                if (mainWorldPlayers.length > 0) {
                    mainWorldPlayers.forEach(player => {
                        const li = document.createElement('li');
                        li.className = 'player-item';
                        const avatar = document.createElement('img');
                        avatar.className = 'player-avatar';
                        avatar.alt = player.account;
                        avatar.addEventListener('error', () => { avatar.style.display = 'none'; });
                        avatar.src = playerAvatarUrl(player.account);
                        li.append(avatar, textSpan(player.account));
                        li.addEventListener('click', () => {
                            selectedPlayerForTracking = player.account;
                            closePlayerSelectModal();
                            if (trackingToggleBtn) {
                                trackingToggleBtn.classList.remove('disabled');
                                trackingToggleBtn.title = `${player.account} の追跡を開始`;
                            }
                        });
                        modalPlayerList.appendChild(li);
                    });
                } else {
                    modalPlayerList.innerHTML = '<li class="player-item">対象ワールドにプレイヤーがいません</li>';
                }
            } else {
                modalPlayerList.innerHTML = '<li class="player-item">オンラインのプレイヤーがいません</li>';
            }
        })
        .catch(error => {
            modalPlayerList.innerHTML = '<li class="player-item">エラー: プレイヤーリストを取得できません</li>';
        });
}

// --- プレイヤー名保存ユーティリティ ---
function saveTrackedPlayerToStorage(playerName) {
    try {
        localStorage.setItem('toro_tracked_player', playerName);
    } catch (e) {}
}
function loadTrackedPlayerFromStorage() {
    try {
        return localStorage.getItem('toro_tracked_player');
    } catch (e) { return null; }
}
function clearTrackedPlayerFromStorage() {
    try {
        localStorage.removeItem('toro_tracked_player');
    } catch (e) {}
}

// --- 追跡トグル ---
function toggleTracking() {
    if (trackingToggleBtn && trackingToggleBtn.classList.contains('disabled')) return;
    if (isFollowingPlayer && trackedPlayerNameGlobal) {
        stopPlayerTracking();
        clearTrackedPlayerFromStorage();
        if (trackingToggleBtn) {
            trackingToggleBtn.classList.remove('active');
            trackingToggleBtn.title = selectedPlayerForTracking ?
                `${selectedPlayerForTracking} の追跡を開始` : '追跡開始';
        }
    } else if (selectedPlayerForTracking) {
        startTrackingPlayer(selectedPlayerForTracking);
        saveTrackedPlayerToStorage(selectedPlayerForTracking);
        if (trackingToggleBtn) {
            trackingToggleBtn.classList.add('active');
            trackingToggleBtn.title = `${selectedPlayerForTracking} の追跡を停止`;
        }
    } else {
        openPlayerSelectModal();
    }
}

function startTrackingPlayer(playerName) {
    if (playerTrackingIntervalId) {
        clearInterval(playerTrackingIntervalId);
        playerTrackingIntervalId = null;
    }
    if (playerMarker) {
        playerMarker.remove();
        playerMarker = null;
    }
    trackedPlayerNameGlobal = playerName;
    isFollowingPlayer = true;
    saveTrackedPlayerToStorage(playerName);
    previousTrackedPlayerPosition = null;
    lastKnownPlayerDynmapCoords = null;
    if (trackedPlayerNameDisplay) trackedPlayerNameDisplay.textContent = playerName;
    if (statusMessageArea) {
        statusMessageArea.textContent = `${playerName} を追跡開始します...`;
        statusMessageArea.className = 'status-message';
    }
    fetchAndUpdatePlayerData();
    playerTrackingIntervalId = setInterval(fetchAndUpdatePlayerData, PLAYER_TRACKING_INTERVAL);
}

function stopPlayerTracking() {
    isFollowingPlayer = false;
    trackedPlayerNameGlobal = null;
    clearTrackedPlayerFromStorage();
    if (trackedPlayerNameDisplay) trackedPlayerNameDisplay.textContent = '-';
    clearPlayerSpecificInfo();
    if (playerTrackingIntervalId) {
        clearInterval(playerTrackingIntervalId);
        playerTrackingIntervalId = null;
    }
    if (playerMarker) {
        playerMarker.remove();
        playerMarker = null;
    }
    previousTrackedPlayerPosition = null;
    lastKnownPlayerDynmapCoords = null;
    if (trackingToggleBtn) {
        trackingToggleBtn.classList.remove('active');
    }
}

// --- マーカー・ライン・地図描画 ---
function dynmapToLeafletCoords(dynmapX, dynmapZ) {
    return [-dynmapZ, dynmapX];
}

async function loadDynmapStaticData() {
    try {
        const response = await fetch(DYNMAP_MARKERS_API_ENDPOINT);
        if (!response.ok) throw new Error(`マーカー取得失敗: ${response.status} ${response.statusText}`);
        const rawMarkerData = await response.json();
        if (!rawMarkerData || !rawMarkerData.sets) {
            throw new Error('マーカーデータが無効または空です');
        }
        parseAndStoreDynmapMarkers(rawMarkerData);
        displayDynmapFeatures();
        if (loadingMessageMap) loadingMessageMap.style.display = 'none';
    } catch (error) {
        console.error('Dynmap静的データエラー:', error);
        statusMessageArea.textContent = `マーカー読込エラー: ${error.message}`;
        statusMessageArea.className = 'error-message';
        if (loadingMessageMap) loadingMessageMap.textContent = "マーカー読み込みに失敗しました。サーバー接続を確認してください。";
        // フォールバック: スポーン位置を中心にマップを表示
        centerMapOnSpawn();
    }
}

function parseAndStoreDynmapMarkers(rawData) {
    allPinsData = [];
    allLinesData = [];
    if (!rawData || !rawData.sets) return;
    for (const setName in rawData.sets) {
        const set = rawData.sets[setName];
        if (!set) continue;
        if (set.markers) {
            for (const markerId in set.markers) {
                const marker = set.markers[markerId];
                if (marker && typeof marker.x === 'number' && typeof marker.y === 'number' && typeof marker.z === 'number') {
                    allPinsData.push({
                        id: markerId, x: marker.x, y: marker.y, z: marker.z,
                        label: plainLabel(marker.label, markerId),
                        icon: marker.icon || 'default'
                    });
                }
            }
        }
        if (set.lines) {
            for (const lineId in set.lines) {
                const line = set.lines[lineId];
                if (line && Array.isArray(line.x) && Array.isArray(line.y) && Array.isArray(line.z) &&
                    line.x.length === line.y.length && line.x.length === line.z.length && line.x.length > 1) {
                    const points = [];
                    for (let i = 0; i < line.x.length; i++) {
                        if (typeof line.x[i] === 'number' && typeof line.y[i] === 'number' && typeof line.z[i] === 'number') {
                            points.push({ x: line.x[i], y: line.y[i], z: line.z[i] });
                        }
                    }
                    if (points.length === line.x.length) {
                        allLinesData.push({
                            id: lineId, points: points, label: plainLabel(line.label || line.desc, lineId),
                            color: formatColor(line.color, '#FFFFFF'),
                            weight: line.weight || 2
                        });
                    }
                }
            }
        }
        if (set.areas) {
            for (const areaId in set.areas) {
                const area = set.areas[areaId];
                if (area && Array.isArray(area.x) && Array.isArray(area.z) &&
                    area.x.length === area.z.length && area.x.length > 1) {
                    const points = [];
                    const defaultY = typeof area.ybottom === 'number' ? area.ybottom : (typeof area.ytop === 'number' ? area.ytop : 64);
                    for (let i = 0; i < area.x.length; i++) {
                        if (typeof area.x[i] === 'number' && typeof area.z[i] === 'number') {
                            points.push({ x: area.x[i], y: defaultY, z: area.z[i] });
                        }
                    }
                    if (points.length === area.x.length) {
                        let closedPoints = [...points];
                        if (closedPoints.length > 2 && (closedPoints[0].x !== closedPoints[closedPoints.length - 1].x || closedPoints[0].z !== closedPoints[closedPoints.length - 1].z)) {
                            closedPoints.push(closedPoints[0]);
                        }
                        allLinesData.push({
                            id: areaId, points: closedPoints, label: plainLabel(area.label || area.desc, areaId),
                            color: formatColor(area.strokecolor || area.color, '#AAAAAA'),
                            weight: area.strokeweight || area.weight || 1,
                            isAreaOutline: true
                        });
                    }
                }
            }
        }
    }
}

function formatColor(colorValue, defaultColor) {
    if (typeof colorValue === 'string' && colorValue.startsWith('#')) {
        return colorValue;
    } else if (typeof colorValue === 'number') {
        return `#${colorValue.toString(16).padStart(6, '0')}`;
    }
    return defaultColor;
}

function displayDynmapFeatures() {
    dynmapPinsLayer.clearLayers();
    dynmapLinesLayer.clearLayers();

    // 描画範囲を画面の3倍に拡張
    if (map && mapContainer && mapDiv) {
        const width = mapContainer.offsetWidth;
        const height = mapContainer.offsetHeight;
        mapDiv.style.width = (width * 3) + "px";
        mapDiv.style.height = (height * 3) + "px";
        mapDiv.style.left = (-width) + "px";
        mapDiv.style.top = (-height) + "px";
        map.invalidateSize(true);
    }

    allPinsData.forEach(pin => {
        const coords = dynmapToLeafletCoords(pin.x, pin.z);
        const iconUrl = `${DYNMAP_ICON_BASE_URL}${encodeURIComponent(pin.icon)}.png`;
        const dynmapIcon = L.icon({
            iconUrl: iconUrl,
            iconSize: [16, 16],
            iconAnchor: [8, 8],
            popupAnchor: [0, -8]
        });
        L.marker(coords, { icon: dynmapIcon })
            .bindPopup(popupWithCoords('b', pin.label, `座標: X:${pin.x.toFixed(0)}, Y:${pin.y.toFixed(0)}, Z:${pin.z.toFixed(0)}`))
            .bindTooltip(textSpan(pin.label), {
                permanent: true,
                direction: 'top',
                className: 'dynmap-marker-label',
                offset: [0, 0]
            })
            .addTo(dynmapPinsLayer);
    });

    allLinesData.forEach((line) => {
        if (!line || !Array.isArray(line.points) || line.points.length < 2) return;
        const latLngs = line.points.map(p => dynmapToLeafletCoords(p.x, p.z));
        try {
            L.polyline(latLngs, { color: line.color, weight: line.weight })
                .bindPopup(textSpan(line.label || `Line ${line.id}`))
                .addTo(dynmapLinesLayer);
        } catch (e) {
            console.error(`Error drawing polyline for line (id: ${line.id}):`, line, e);
        }
    });

    if (map) {
        map.invalidateSize(true);
        dynmapPinsLayer.eachLayer(layer => { if (layer.redraw) layer.redraw(); });
        dynmapLinesLayer.eachLayer(layer => { if (layer.redraw) layer.redraw(); });
    }
}

// --- Spawn中心化 ---
function centerMapOnSpawn() {
    const spawnMarker = allPinsData.find(pin =>
        typeof pin.label === "string" &&
        (pin.label.toLowerCase().includes('spawn') || pin.label.includes('ワールドスポーン'))
    );
    if (spawnMarker) {
        const spawnLatLng = dynmapToLeafletCoords(spawnMarker.x, spawnMarker.z);
        map.setView(spawnLatLng, LEAFLET_MIN_ZOOM, { animate: true, duration: 1.0 });
    } else {
        map.setView(dynmapToLeafletCoords(0, 0), DYNMAP_INITIAL_LEAFLET_ZOOM);
    }
}

// --- プレイヤー追跡・情報パネル・その他 ---
async function fetchAndUpdatePlayerData() {
    try {
        const response = await fetch(`${DYNMAP_UPDATE_API_ENDPOINT}?_=${new Date().getTime()}`);
        if (!response.ok) throw new Error(`プレイヤーデータ取得失敗: ${response.status} ${response.statusText}`);
        const updateData = await response.json();
        if (!updateData.players || !Array.isArray(updateData.players)) {
            throw new Error('プレイヤーデータが無効または空です');
        }

        if (trackedPlayerNameGlobal) {
            const playerData = updateData.players.find(p => p.name === trackedPlayerNameGlobal || p.account === trackedPlayerNameGlobal);

            if (playerData && playerData.world === DYNMAP_WORLD_NAME) {
                lastKnownPlayerDynmapCoords = { x: playerData.x, y: playerData.y, z: playerData.z, world: playerData.world, yaw: playerData.yaw };

                if (playerDynmapCoordsDisplay) {
                    playerDynmapCoordsDisplay.textContent = `X:${playerData.x.toFixed(0)}, Y:${playerData.y.toFixed(0)}, Z:${playerData.z.toFixed(0)}`;
                }
                if (playerWorldDisplay) {
                    playerWorldDisplay.textContent = playerData.world;
                }

                // --- 現在の道路名をroad-panel(div)に表示 ---
                const roadPanel = document.getElementById('road-panel');
                if (roadPanel) {
                    roadPanel.style.display = "none";
                    if (allLinesData.length > 0) {
                        const playerX = playerData.x;
                        const playerZ = playerData.z;
                        let closestRoad = null;
                        let minDistance = Infinity;
                        const threshold = 25;
                        allLinesData.filter(line => !line.isAreaOutline).forEach(line => {
                            if (!line.points || line.points.length < 2) return;
                            for (let i = 0; i < line.points.length - 1; i++) {
                                const dist = distanceToSegment({x: playerX, z: playerZ}, line.points[i], line.points[i+1]);
                                if (dist < minDistance) {
                                    minDistance = dist;
                                    if (minDistance < threshold) closestRoad = line;
                                }
                            }
                        });
                        if (closestRoad) {
                            roadPanel.textContent = closestRoad.label || '道路';
                            roadPanel.style.display = "";
                        } else {
                            roadPanel.style.display = "none";
                        }
                    } else {
                        roadPanel.style.display = "none";
                    }
                }

                // --- プレイヤーアイコンの更新 ---
                const leafletCoords = dynmapToLeafletCoords(playerData.x, playerData.z);

                let playerIcon;
                let mapRotationDeg = currentMapRotation;

                if (isFollowingPlayer) {
                    // 追跡中はicon.pngを使用
                    playerIcon = L.icon({
                        iconUrl: PLAYER_ARROW_ICON_URL,
                        iconSize: [48, 48],
                        iconAnchor: [24, 24], // 中心に調整
                        popupAnchor: [0, -24],
                        className: 'tracked-player'
                    });

                    // 進行方向の回転計算（マップ回転用）
                    if (previousTrackedPlayerPosition &&
                        (Math.abs(playerData.x - previousTrackedPlayerPosition.x) > 0.1 || Math.abs(playerData.z - previousTrackedPlayerPosition.z) > 0.1)) {
                        const deltaX = playerData.x - previousTrackedPlayerPosition.x;
                        const deltaZ = playerData.z - previousTrackedPlayerPosition.z;
                        const moveAngleRad = Math.atan2(-deltaZ, -deltaX);
                        mapRotationDeg = -(moveAngleRad * (180 / Math.PI) - 90);
                        mapRotationDeg = (mapRotationDeg % 360 + 360) % 360;
                    } else if (!previousTrackedPlayerPosition && typeof playerData.yaw === 'number' && !isNaN(playerData.yaw)) {
                        mapRotationDeg = -(playerData.yaw - 90);
                        mapRotationDeg = (mapRotationDeg % 360 + 360) % 360;
                    }

                    rotateMap(mapRotationDeg, leafletCoords);
                } else {
                    // 追跡していないときはスキンアイコン
                    playerIcon = L.icon({
                        iconUrl: playerAvatarUrl(playerData.account),
                        iconSize: [24, 24],
                        iconAnchor: [12, 12],
                        popupAnchor: [0, -12],
                        className: 'tracked-player'
                    });
                    rotateMap(0);
                }

                if (!playerMarker) {
                    playerMarker = L.marker(leafletCoords, {
                        icon: playerIcon,
                        zIndexOffset: 1000
                    }).addTo(map);
                } else {
                    playerMarker.setLatLng(leafletCoords);
                    playerMarker.setIcon(playerIcon);
                }

                if (isFollowingPlayer) {
                    programmaticMove = true;
                    map.setView(leafletCoords, map.getZoom());
                    setTimeout(() => { programmaticMove = false; }, 100);
                }

                previousTrackedPlayerPosition = { x: playerData.x, z: playerData.z };
            } else if (playerData) {
                if (statusMessageArea) {
                    statusMessageArea.textContent = `${trackedPlayerNameGlobal} は別のワールドにいます`;
                    statusMessageArea.className = 'error-message';
                }
            } else {
                if (statusMessageArea) {
                    statusMessageArea.textContent = `プレイヤー '${trackedPlayerNameGlobal}' が見つかりません`;
                    statusMessageArea.className = 'error-message';
                }
            }
        } else {
            // 追跡していないときはroad-panel非表示
            const roadPanel = document.getElementById('road-panel');
            if (roadPanel) roadPanel.style.display = "none";
        }

        // 他のプレイヤーの表示
        if (updateData.players && Array.isArray(updateData.players)) {
            let currentVisiblePlayers = {};
            for (const p of updateData.players) {
                if (p.world === DYNMAP_WORLD_NAME && (!trackedPlayerNameGlobal || (p.name !== trackedPlayerNameGlobal && p.account !== trackedPlayerNameGlobal))) {
                    currentVisiblePlayers[p.account] = true;

                    const pCoords = dynmapToLeafletCoords(p.x, p.z);
                    const otherPlayerIcon = L.icon({
                        iconUrl: playerAvatarUrl(p.account),
                        iconSize: [24, 24],
                        iconAnchor: [12, 12],
                        popupAnchor: [0, -12]
                    });

                    if (otherPlayerMarkers[p.account]) {
                        otherPlayerMarkers[p.account].setLatLng(pCoords);
                        otherPlayerMarkers[p.account].setIcon(otherPlayerIcon);
                    } else {
                        const marker = L.marker(pCoords, {
                            icon: otherPlayerIcon,
                            playerName: p.account
                        })
                            .bindPopup(popupWithCoords('span', p.account, `X:${p.x.toFixed(0)}, Y:${p.y.toFixed(0)}, Z:${p.z.toFixed(0)}`))
                            .bindTooltip(textSpan(p.account), {
                                permanent: true,
                                direction: 'top',
                                className: 'player-label',
                                offset: [0, 0]
                            })
                            .addTo(allPlayersLayer);

                        // 画像が404の場合はデフォルトアイコンにフォールバック
                        marker.on('add', function() {
                            const img = marker._icon;
                            if (img) {
                                img.onerror = function() {
                                    img.src = L.Icon.Default.imagePath
                                        ? L.Icon.Default.imagePath + '/marker-icon.png'
                                        : 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
                                };
                            }
                        });

                        otherPlayerMarkers[p.account] = marker;
                    }
                }
            }

            for (const playerNameKey in otherPlayerMarkers) {
                if (!currentVisiblePlayers[playerNameKey]) {
                    allPlayersLayer.removeLayer(otherPlayerMarkers[playerNameKey]);
                    delete otherPlayerMarkers[playerNameKey];
                }
            }
        }
    } catch (error) {
        console.error('プレイヤーデータ更新エラー:', error);
        if (statusMessageArea) {
            statusMessageArea.textContent = `エラー: ${error.message}`;
            statusMessageArea.className = 'error-message';
        }
    }
}

function clearPlayerSpecificInfo() {
    if (playerDynmapCoordsDisplay) playerDynmapCoordsDisplay.textContent = '-';
    if (playerWorldDisplay) playerWorldDisplay.textContent = '-';
    if (roadDisplay) roadDisplay.textContent = '-';
    if (facilitiesList) facilitiesList.innerHTML = '<li>プレイヤーを追跡していません。</li>';
}

function setElementCounterRotation(element, degrees, offsetY = 0) {
    if (element) {
        let currentTransform = L.DomUtil.getStyle(element, 'transform') || "";
        if (currentTransform === "none") currentTransform = "";
        let newTransform = currentTransform.replace(/rotate\([^)]+\)/g, '').replace(/translateY\([^)]+\)/g, '').trim();
        if (degrees !== 0) {
            newTransform += ` rotate(${degrees}deg)`;
        }
        if (offsetY !== 0) {
            newTransform += ` translateY(${offsetY}px)`;
        }
        element.style.transform = newTransform;
    }
}

function applyMarkerCounterRotation() {
    requestAnimationFrame(() => {
        const counterRotationDeg = -currentMapRotation;

        // playerMarkerを常に上方向に保つ
        if (playerMarker && playerMarker.getElement()) {
            setElementCounterRotation(playerMarker.getElement(), counterRotationDeg);
            const tooltipElement = playerMarker.getTooltip() ? playerMarker.getTooltip().getElement() : null;
            if (tooltipElement) {
                const iconSize = playerMarker.options.icon.options.iconSize[1] || 48;
                const offsetY = -iconSize;
                setElementCounterRotation(tooltipElement, counterRotationDeg, offsetY);
            }
        }

        // 他のピンの回転補正
        dynmapPinsLayer.eachLayer(layer => {
            if (layer.getElement()) {
                setElementCounterRotation(layer.getElement(), counterRotationDeg);
                const tooltipElement = layer.getTooltip() ? layer.getTooltip().getElement() : null;
                if (tooltipElement) {
                    const iconSize = layer.getIcon().options.iconSize[1] || 16;
                    const offsetY = -iconSize;
                    setElementCounterRotation(tooltipElement, counterRotationDeg, offsetY);
                }
            }
        });

        // 他のプレイヤーマーカーの回転補正
        allPlayersLayer.eachLayer(layer => {
            if (layer.getElement()) {
                setElementCounterRotation(layer.getElement(), counterRotationDeg);
                const tooltipElement = layer.getTooltip() ? layer.getTooltip().getElement() : null;
                if (tooltipElement) {
                    const iconSize = layer.getIcon().options.iconSize[1] || 24;
                    const offsetY = -iconSize;
                    setElementCounterRotation(tooltipElement, counterRotationDeg, offsetY);
                }
            }
        });
    });
}

function rotateMap(degrees, centerCoords) {
    if (!map || !map.getContainer()) return;

    const mapDivElement = map.getContainer();
    currentMapRotation = (degrees % 360 + 360) % 360;

    const containerWidth = mapContainer.offsetWidth;
    const containerHeight = mapContainer.offsetHeight;
    const diagonal = Math.sqrt(containerWidth * containerWidth + containerHeight * containerHeight);
    const requiredSize = diagonal * 1.05;

    mapDivElement.style.width = `${requiredSize}px`;
    mapDivElement.style.height = `${requiredSize}px`;
    mapDivElement.style.left = `${(containerWidth - requiredSize) / 2}px`;
    mapDivElement.style.top = `${(containerHeight - requiredSize) / 2}px`;

    const absCos = Math.abs(Math.cos(degrees * Math.PI / 180));
    const absSin = Math.abs(Math.sin(degrees * Math.PI / 180));
    const scaleFactor = 1 / Math.max(absCos, absSin, 1);
    const boundedScale = Math.min(scaleFactor, 1.414);

    // スムーズな回転
    mapDivElement.style.transition = "transform 0.4s cubic-bezier(0.4,0,0.2,1)";
    mapDivElement.style.transform = `rotate(${degrees}deg) scale(${boundedScale})`;
    mapDivElement.style.transformOrigin = 'center center';

    map.invalidateSize(false);

    if (isFollowingPlayer && centerCoords) {
        programmaticMove = true;
        map.setView(centerCoords, map.getZoom(), { animate: true, duration: 0.3 });
    }

    applyMarkerCounterRotation();
    console.log(`Map rotated to ${degrees}deg, scale: ${boundedScale}, center: ${centerCoords ? JSON.stringify(centerCoords) : 'none'}`);
}

// --- 距離計算ユーティリティ ---
function sqr(x) { return x * x }
function dist2(v, w) { return sqr(v.x - w.x) + sqr(v.z - w.z) }
function distanceToSegmentSquared(p, v, w) {
    const l2 = dist2(v, w); if (l2 === 0) return dist2(p, v);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.z - v.z) * (w.z - v.z)) / l2;
    t = Math.max(0, Math.min(1, t));
    return dist2(p, { x: v.x + t * (w.x - v.x), z: v.z + t * (w.z - v.z) });
}
function distanceToSegment(p, v, w) { return Math.sqrt(distanceToSegmentSquared(p, v, w)); }