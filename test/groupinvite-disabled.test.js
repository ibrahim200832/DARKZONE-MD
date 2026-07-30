// GROUP_INVITE_FLOW is read once when config.js first loads; default
// (unset) is "false", but set it explicitly here so the intent is obvious.
process.env.GROUP_INVITE_FLOW = 'false';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { handleGroupInvite } = require('../lib/groupinvite');

test('does nothing when GROUP_INVITE_FLOW is disabled', async () => {
    const sock = { sendMessage: async () => assert.fail('should not send anything') };
    const msg = {
        key: { remoteJid: '1111@s.whatsapp.net', participant: '1111@s.whatsapp.net', fromMe: false },
        message: { conversation: 'hallo' },
    };
    const handled = await handleGroupInvite(sock, msg);
    assert.equal(handled, false);
});
