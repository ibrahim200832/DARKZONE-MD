// SPAM_MAX_MESSAGES/SPAM_INTERVAL_SECONDS are read once when config.js first
// loads, so set them before requiring anything from lib/ in this process.
process.env.SPAM_MAX_MESSAGES = '2';
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
        user: { id: 'bot@s.whatsapp.net' },
        sent,
        groupMetadata: async () => ({ participants: [] }),
        sendMessage: async (jid, content, opts) => {
            sent.push({ jid, content, opts });
        },
    };
}

test('messages older than SPAM_INTERVAL_SECONDS no longer count toward the threshold', async () => {
    const sock = makeSock();

    await handleAntiSpam(sock, makeMsg());
    await handleAntiSpam(sock, makeMsg());
    assert.equal(sock.sent.length, 0); // exactly at the threshold, not over it yet

    await new Promise((resolve) => setTimeout(resolve, 1100)); // let the 1s window expire

    const handled = await handleAntiSpam(sock, makeMsg());
    assert.equal(handled, false); // the earlier 2 messages aged out, so this is a fresh count of 1
    assert.equal(sock.sent.length, 0);
});
