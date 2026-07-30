// Minimal file-backed key/value store used for runtime-configurable bot settings.
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'config.json');

function readDB() {
    try {
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch {
        return {};
    }
}

function writeDB(data) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function getConfig(key) {
    return readDB()[key];
}

function setConfig(key, value) {
    const db = readDB();
    db[key] = value;
    writeDB(db);
    return value;
}

module.exports = { getConfig, setConfig };
