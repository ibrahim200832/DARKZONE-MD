const { test } = require('node:test');
const assert = require('node:assert/strict');
const { handleAntiLink } = require('../lib/antilink');

const GROUP_JID = '999@g.us';
const SENDER = '1111@s.whatsapp.net';
const OWNER = '923306137477@s.whatsapp.net'; // matches config.js default OWNER_NUMBER
const BOT_ID = '999000111:5@s.whatsapp.net'; // baileys-style id with device suffix

function makeMsg(text, { remoteJid = GROUP_JID, participant = SENDER, fromMe = false } = {}) {
    return {
        key: { remoteJid, participant, fromMe },
        message: text === null ? undefined : { conversation: text },
    };
}

function makeSock({ participants = [] } = {}) {
    const sent = [];
    const removed = [];
    return {
        user: { id: BOT_ID },
        sent,
        removed,
        groupMetadata: async () => ({ participants }),
        sendMessage: async (jid, content, opts) => {
            sent.push({ jid, content, opts });
        },
        groupParticipantsUpdate: async (jid, ids, action) => {
            removed.push({ jid, ids, action });
        },
    };
}

test('ignores messages outside of groups', async () => {
    const sock = makeSock();
    const handled = await handleAntiLink(sock, makeMsg('https://example.com', { remoteJid: '1111@s.whatsapp.net' }));
    assert.equal(handled, false);
    assert.equal(sock.sent.length, 0);
});

test('ignores group messages without a link', async () => {
    const sock = makeSock();
    const handled = await handleAntiLink(sock, makeMsg('just chatting'));
    assert.equal(handled, false);
});

test('exempts the bot owner from anti-link', async () => {
    const sock = makeSock();
    const handled = await handleAntiLink(sock, makeMsg('https://example.com', { participant: OWNER }));
    assert.equal(handled, false);
    assert.equal(sock.sent.length, 0);
});

test('exempts group admins from anti-link', async () => {
    const sock = makeSock({ participants: [{ id: SENDER, admin: 'admin' }] });
    const handled = await handleAntiLink(sock, makeMsg('https://example.com'));
    assert.equal(handled, false);
    assert.equal(sock.sent.length, 0);
});

test('warns (does not remove) when the bot is not a group admin', async () => {
    const sock = makeSock({ participants: [{ id: SENDER, admin: null }, { id: BOT_ID.split(':')[0] + '@s.whatsapp.net', admin: null }] });
    const handled = await handleAntiLink(sock, makeMsg('https://example.com'));
    assert.equal(handled, true);
    assert.equal(sock.removed.length, 0);
    assert.equal(sock.sent.length, 1);
    assert.match(sock.sent[0].content.text, /not allowed/);
});

test('deletes the message and removes the sender when the bot is a group admin', async () => {
    const botJid = BOT_ID.split(':')[0] + '@s.whatsapp.net';
    const sock = makeSock({
        participants: [
            { id: SENDER, admin: null },
            { id: botJid, admin: 'admin' },
        ],
    });
    const handled = await handleAntiLink(sock, makeMsg('https://example.com'));
    assert.equal(handled, true);
    assert.equal(sock.removed.length, 1);
    assert.deepEqual(sock.removed[0], { jid: GROUP_JID, ids: [SENDER], action: 'remove' });
    // one call to delete the message, one to announce the removal
    assert.equal(sock.sent.length, 2);
    assert.deepEqual(sock.sent[0].content, { delete: { remoteJid: GROUP_JID, participant: SENDER, fromMe: false } });
});

test('ignores messages authored by the bot itself', async () => {
    const sock = makeSock();
    const handled = await handleAntiLink(sock, makeMsg('https://example.com', { fromMe: true }));
    assert.equal(handled, false);
});
