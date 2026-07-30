const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DB_PATH = path.join(__dirname, '..', 'data', 'config.json');

function cleanup() {
    fs.rmSync(DB_PATH, { force: true });
}

beforeEach(cleanup);
afterEach(cleanup);

test('getConfig returns undefined for unknown keys with no db file', () => {
    const { getConfig } = require('../lib/configdb');
    assert.equal(getConfig('NOPE'), undefined);
});

test('setConfig persists a value that getConfig can read back', () => {
    const { getConfig, setConfig } = require('../lib/configdb');
    setConfig('PREFIX', '!');
    assert.equal(getConfig('PREFIX'), '!');
    assert.ok(fs.existsSync(DB_PATH));
});

test('setConfig does not clobber other keys', () => {
    const { getConfig, setConfig } = require('../lib/configdb');
    setConfig('A', 1);
    setConfig('B', 2);
    assert.equal(getConfig('A'), 1);
    assert.equal(getConfig('B'), 2);
});
