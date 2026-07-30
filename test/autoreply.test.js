// AUTO_REPLY is read once when config.js first loads, so set the env var
// before requiring anything from lib/ in this process.
process.env.AUTO_REPLY = 'true';

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

const { handleAutoReply, setAutoReply, getReplyMap } = require('../lib/autoreply');

function makeMsg(text, { fromMe = false } = {}) {
    return {
        key: { remoteJid: '123@s.whatsapp.net', fromMe },
        message: { conversation: text },
    };
}

function makeSock() {
    const sent = [];
    return {
        sent,
        sendMessage: async (jid, content, opts) => {
            sent.push({ jid, content, opts });
        },
    };
}

test('replies to a default trigger word', async () => {
    const sock = makeSock();
    const handled = await handleAutoReply(sock, makeMsg('hi there'));
    assert.equal(handled, true);
    assert.equal(sock.sent.length, 1);
    assert.match(sock.sent[0].content.text, /Hello!/);
});

test('does not match a trigger as a substring of another word', async () => {
    const sock = makeSock();
    const handled = await handleAutoReply(sock, makeMsg('this chills me out'));
    assert.equal(handled, false);
    assert.equal(sock.sent.length, 0);
});

test('ignores messages sent by the bot itself', async () => {
    const sock = makeSock();
    const handled = await handleAutoReply(sock, makeMsg('hi', { fromMe: true }));
    assert.equal(handled, false);
});

test('setAutoReply adds a custom trigger that handleAutoReply then uses', async () => {
    setAutoReply('ping', 'pong!');
    assert.equal(getReplyMap().ping, 'pong!');

    const sock = makeSock();
    const handled = await handleAutoReply(sock, makeMsg('ping'));
    assert.equal(handled, true);
    assert.equal(sock.sent[0].content.text, 'pong!');
});
