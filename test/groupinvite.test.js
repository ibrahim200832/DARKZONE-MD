// GROUP_INVITE_FLOW/GROUP_INVITE_LINK are read once when config.js first
// loads, so set them before requiring anything from lib/ in this process.
process.env.GROUP_INVITE_FLOW = 'true';
process.env.GROUP_INVITE_LINK = 'https://chat.whatsapp.com/testInviteCode';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { handleGroupInvite } = require('../lib/groupinvite');

// The module tracks state in a module-level Map keyed by sender JID, so
// every test uses its own unique JID to avoid leaking state between tests.
let uniqueId = 0;
function freshJid() {
    uniqueId += 1;
    return `sender${uniqueId}@s.whatsapp.net`;
}

function makeMsg(jid, text, { fromMe = false } = {}) {
    return {
        key: { remoteJid: jid, participant: jid, fromMe },
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

test('ignores group messages', async () => {
    const sock = makeSock();
    const handled = await handleGroupInvite(sock, makeMsg('999@g.us', 'hallo'));
    assert.equal(handled, false);
    assert.equal(sock.sent.length, 0);
});

test('ignores messages sent by the bot itself', async () => {
    const jid = freshJid();
    const sock = makeSock();
    const handled = await handleGroupInvite(sock, makeMsg(jid, 'hallo', { fromMe: true }));
    assert.equal(handled, false);
});

test('ignores empty messages', async () => {
    const jid = freshJid();
    const sock = makeSock();
    const handled = await handleGroupInvite(sock, makeMsg(jid, '   '));
    assert.equal(handled, false);
});

test('asks a brand-new private contact whether they want to join the group', async () => {
    const jid = freshJid();
    const sock = makeSock();
    const handled = await handleGroupInvite(sock, makeMsg(jid, 'hi'));
    assert.equal(handled, true);
    assert.equal(sock.sent.length, 1);
    assert.match(sock.sent[0].content.text, /Möchtest du der WhatsApp-Gruppe beitreten/);
});

test('sends the invite link only after an explicit yes', async () => {
    const jid = freshJid();
    const sock = makeSock();
    await handleGroupInvite(sock, makeMsg(jid, 'hi')); // asks

    const handled = await handleGroupInvite(sock, makeMsg(jid, 'ja klar'));
    assert.equal(handled, true);
    assert.equal(sock.sent.length, 2);
    assert.match(sock.sent[1].content.text, /chat\.whatsapp\.com\/testInviteCode/);
});

test('does not send anything before the user has said yes', async () => {
    const jid = freshJid();
    const sock = makeSock();
    await handleGroupInvite(sock, makeMsg(jid, 'hi')); // asks only

    // Only the initial question was sent - no link anywhere in it.
    assert.equal(sock.sent.length, 1);
    for (const s of sock.sent) {
        assert.doesNotMatch(s.content.text, /chat\.whatsapp\.com/);
    }
});

test('acknowledges a "no" without sending the link', async () => {
    const jid = freshJid();
    const sock = makeSock();
    await handleGroupInvite(sock, makeMsg(jid, 'hi')); // asks

    const handled = await handleGroupInvite(sock, makeMsg(jid, 'nein danke'));
    assert.equal(handled, true);
    assert.equal(sock.sent.length, 2);
    assert.doesNotMatch(sock.sent[1].content.text, /chat\.whatsapp\.com/);
});

test('an ambiguous reply leaves the question open instead of advancing state', async () => {
    const jid = freshJid();
    const sock = makeSock();
    await handleGroupInvite(sock, makeMsg(jid, 'hi')); // asks

    const handled = await handleGroupInvite(sock, makeMsg(jid, 'was kostet das?'));
    assert.equal(handled, false); // falls through to auto-reply/AI for this turn

    // A later clear "ja" still works, proving the question stayed open.
    const yesHandled = await handleGroupInvite(sock, makeMsg(jid, 'ja'));
    assert.equal(yesHandled, true);
    assert.match(sock.sent[sock.sent.length - 1].content.text, /chat\.whatsapp\.com/);
});

test('an explicit request for the group works immediately, skipping the question', async () => {
    const jid = freshJid();
    const sock = makeSock();
    const handled = await handleGroupInvite(sock, makeMsg(jid, 'kann ich der gruppe beitreten?'));
    assert.equal(handled, true);
    assert.equal(sock.sent.length, 1);
    assert.match(sock.sent[0].content.text, /chat\.whatsapp\.com\/testInviteCode/);
});

test('an explicit request still works even after having declined earlier', async () => {
    const jid = freshJid();
    const sock = makeSock();
    await handleGroupInvite(sock, makeMsg(jid, 'hi')); // asks
    await handleGroupInvite(sock, makeMsg(jid, 'nein')); // declines

    const handled = await handleGroupInvite(sock, makeMsg(jid, 'ich will doch der gruppe beitreten'));
    assert.equal(handled, true);
    assert.match(sock.sent[sock.sent.length - 1].content.text, /chat\.whatsapp\.com\/testInviteCode/);
});

test('stops intercepting once consented, so later messages pass through', async () => {
    const jid = freshJid();
    const sock = makeSock();
    await handleGroupInvite(sock, makeMsg(jid, 'hi')); // asks
    await handleGroupInvite(sock, makeMsg(jid, 'ja')); // consents

    const handled = await handleGroupInvite(sock, makeMsg(jid, 'wie ist das wetter heute'));
    assert.equal(handled, false);
    assert.equal(sock.sent.length, 2); // no new message from this handler
});
