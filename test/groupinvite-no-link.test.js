// GROUP_INVITE_FLOW/GROUP_INVITE_LINK are read once when config.js first
// loads, so set them before requiring anything from lib/ in this process.
process.env.GROUP_INVITE_FLOW = 'true';
process.env.GROUP_INVITE_LINK = '';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { handleGroupInvite } = require('../lib/groupinvite');

function makeMsg(text) {
    return {
        key: { remoteJid: '1111@s.whatsapp.net', participant: '1111@s.whatsapp.net', fromMe: false },
        message: { conversation: text },
    };
}

function makeSock() {
    const sent = [];
    return { sent, sendMessage: async (jid, content, opts) => sent.push({ jid, content, opts }) };
}

test('gives a friendly message instead of an empty link when GROUP_INVITE_LINK is unset', async () => {
    const sock = makeSock();
    await handleGroupInvite(sock, makeMsg('hi')); // asks
    const handled = await handleGroupInvite(sock, makeMsg('ja'));

    assert.equal(handled, true);
    assert.match(sock.sent[1].content.text, /noch nicht eingerichtet/);
});
