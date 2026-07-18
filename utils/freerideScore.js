const fs = require('fs');
const path = require('path');
const terrainPath = process.env.FREERIDE_TERRAIN_PATH ||
    path.join(__dirname, '..', 'freeride_terrain.json');
function loadFreerideTerrain(filePath = terrainPath) {
    if (!fs.existsSync(filePath)) return { _metadata: {}, resorts: {} };
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const { _metadata = {}, ...resorts } = raw;
    return { _metadata, resorts };
}
function rankedTerrain(filePath = terrainPath) {
    const data = loadFreerideTerrain(filePath);
    const all = Object.entries(data.resorts).map(([resort, terrain]) => ({ resort, ...terrain }));
    return {
        metadata: data._metadata,
        ranked: all.filter(item => item.source === 'measured').sort((a, b) => b.score - a.score),
        unavailable: all.filter(item => item.source === 'unavailable')
    };
}
module.exports = { loadFreerideTerrain, rankedTerrain };
