// 接続先・定数の設定 (このファイルが正本。script.js はここで宣言された定数を使う)
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
// プレイヤーの顔画像のサービス (末尾にアカウント名が付く)
const PLAYER_AVATAR_BASE_URL = 'https://mc-heads.net/avatar/';
// Leaflet の標準マーカー画像を相対パスで解決できないときの絶対 URL
const LEAFLET_DEFAULT_MARKER_URL = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
