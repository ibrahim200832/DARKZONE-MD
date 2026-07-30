const { test } = require('node:test');
const assert = require('node:assert/strict');
const { handleAntiSpam } = require('../lib/antispam');

const OWNER = '923306137477@s.whatsapp.net'; // matches config.js default OWNER_NUMBER
const BOT_ID = '999000111:5@s.whatsapp.net'; // baileys-style id with device suffix
const BOT_JID = BOT_ID.split(':')[0] + '@s.whatsapp.net';

// The module under test tracks activity in a module-level Map keyed by
// (group, sender), so every test uses its own unique JIDs below — sharing
// one identity across tests would let earlier tests' message counts leak in.
let uniqueId = 0;
function freshIds() {
    uniqueId += 1;
    return { groupJid: `group${uniqueId}@g.us`, sender: `sender${uniqueId}@s.whatsapp.net` };
}

function makeMsg({ remoteJid, participant, fromMe = false }) {
    return {
        key: { remoteJid, participant, fromMe },
        message: { conversation: 'hallo' },
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
    const { sender } = freshIds();
    const sock = makeSock();
    const handled = await handleAntiSpam(sock, makeMsg({ remoteJid: sender, participant: sender }));
    assert.equal(handled, false);
    assert.equal(sock.sent.length, 0);
});

test('ignores messages authored by the bot itself', async () => {
    const { groupJid, sender } = freshIds();
    const sock = makeSock();
    const handled = await handleAntiSpam(sock, makeMsg({ remoteJid: groupJid, participant: sender, fromMe: true }));
    assert.equal(handled, false);
});

test('exempts the bot owner from anti-spam', async () => {
    const { groupJid } = freshIds();
    const sock = makeSock();
    for (let i = 0; i < 10; i++) {
        await handleAntiSpam(sock, makeMsg({ remoteJid: groupJid, participant: OWNER }));
    }
    assert.equal(sock.sent.length, 0);
});

test('exempts group admins from anti-spam', async () => {
    const { groupJid, sender } = freshIds();
    const sock = makeSock({ participants: [{ id: sender, admin: 'admin' }] });
    for (let i = 0; i < 10; i++) {
        await handleAntiSpam(sock, makeMsg({ remoteJid: groupJid, participant: sender }));
    }
    assert.equal(sock.sent.length, 0);
});

test('does nothing while under the message threshold (default 5)', async () => {
    const { groupJid, sender } = freshIds();
    const sock = makeSock({ participants: [{ id: sender, admin: null }] });
    for (let i = 0; i < 5; i++) {
        const handled = await handleAntiSpam(sock, makeMsg({ remoteJid: groupJid, participant: sender }));
        assert.equal(handled, false);
    }
    assert.equal(sock.sent.length, 0);
});

test('warns once after exceeding the threshold, without removing', async () => {
    const { groupJid, sender } = freshIds();
    const sock = makeSock({ participants: [{ id: sender, admin: null }] });
    for (let i = 0; i < 5; i++) {
        await handleAntiSpam(sock, makeMsg({ remoteJid: groupJid, participant: sender }));
    }
    const handled = await handleAntiSpam(sock, makeMsg({ remoteJid: groupJid, participant: sender })); // 6th: over threshold
    assert.equal(handled, true);
    assert.equal(sock.sent.length, 1);
    assert.match(sock.sent[0].content.text, /nicht spammen/);
    assert.equal(sock.removed.length, 0);
});

test('does not repeat the warning while the bot is not a group admin', async () => {
    const { groupJid, sender } = freshIds();
    const sock = makeSock({ participants: [{ id: sender, admin: null }] });
    for (let i = 0; i < 5; i++) {
        await handleAntiSpam(sock, makeMsg({ remoteJid: groupJid, participant: sender }));
    }
    await handleAntiSpam(sock, makeMsg({ remoteJid: groupJid, participant: sender })); // triggers the one warning
    const handled = await handleAntiSpam(sock, makeMsg({ remoteJid: groupJid, participant: sender })); // still spamming, bot has no rights
    assert.equal(handled, false);
    assert.equal(sock.sent.length, 1); // no second warning spammed back
    assert.equal(sock.removed.length, 0);
});

test('removes the sender on continued spam once warned, if the bot is admin', async () => {
    const { groupJid, sender } = freshIds();
    const sock = makeSock({
        participants: [
            { id: sender, admin: null },
            { id: BOT_JID, admin: 'admin' },
        ],
    });
    for (let i = 0; i < 5; i++) {
        await handleAntiSpam(sock, makeMsg({ remoteJid: groupJid, participant: sender }));
    }
    await handleAntiSpam(sock, makeMsg({ remoteJid: groupJid, participant: sender })); // triggers the warning
    const handled = await handleAntiSpam(sock, makeMsg({ remoteJid: groupJid, participant: sender })); // still spamming -> removed

    assert.equal(handled, true);
    assert.equal(sock.removed.length, 1);
    assert.deepEqual(sock.removed[0], { jid: groupJid, ids: [sender], action: 'remove' });
    assert.equal(sock.sent.length, 2);
    assert.match(sock.sent[1].content.text, /entfernt/);
});

test('resets after removal so the sender can be warned again later', async () => {
    const { groupJid, sender } = freshIds();
    const sock = makeSock({
        participants: [
            { id: sender, admin: null },
            { id: BOT_JID, admin: 'admin' },
        ],
    });
    for (let i = 0; i < 6; i++) {
        await handleAntiSpam(sock, makeMsg({ remoteJid: groupJid, participant: sender }));
    }
    await handleAntiSpam(sock, makeMsg({ remoteJid: groupJid, participant: sender })); // removal happens here
    assert.equal(sock.removed.length, 1);

    // Right after removal, a single new message should not immediately warn again.
    const handled = await handleAntiSpam(sock, makeMsg({ remoteJid: groupJid, participant: sender }));
    assert.equal(handled, false);
});
