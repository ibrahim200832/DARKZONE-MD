// SPAM_MAX_MESSAGES/SPAM_INTERVAL_SECONDS are read once when config.js first
// loads, so set them before requiring anything from lib/ in this process.
// With SPAM_INTERVAL_SECONDS=1, the idle-reset window (5x the interval) is
// 5s, short enough to actually wait out in a test.
process.env.SPAM_MAX_MESSAGES = '1';
process.env.SPAM_INTERVAL_SECONDS = '1';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { handleAntiSpam } = require('../lib/antispam');

function makeMsg() {
    return {
        key: { remoteJid: '999@g.us', participant: '1111@s.whatsapp.net', fromMe: false },
        message: { conversation: 'hallo' },
    };
}

function makeSock() {
    const sent = [];
    return {
        user: { id: 'bot@s.whatsapp.net' }, // not a group admin below -> can only warn, never remove
        sent,
        groupMetadata: async () => ({ participants: [] }),
        sendMessage: async (jid, content, opts) => {
            sent.push({ jid, content, opts });
        },
    };
}

test('an old warning is forgotten after the sender has been quiet long enough', async () => {
    const sock = makeSock();

    await handleAntiSpam(sock, makeMsg());
    const firstWarning = await handleAntiSpam(sock, makeMsg()); // over threshold -> warns once
    assert.equal(firstWarning, true);
    assert.equal(sock.sent.length, 1);

    // Without an idle reset, the sender would stay "warned" forever, so the
    // next burst (below) would be silently ignored (bot isn't admin) instead
    // of producing a fresh warning.
    await new Promise((resolve) => setTimeout(resolve, 5200));

    await handleAntiSpam(sock, makeMsg()); // fresh single message, under threshold again
    const secondWarning = await handleAntiSpam(sock, makeMsg()); // over threshold again

    assert.equal(secondWarning, true);
    assert.equal(sock.sent.length, 2);
    assert.match(sock.sent[1].content.text, /nicht spammen/);
});
