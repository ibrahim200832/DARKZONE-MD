// UPDATE_CHECK_ENABLED is read once when config.js first loads, so set the
// env var before requiring anything from lib/ in this process.
process.env.UPDATE_CHECK_ENABLED = 'false';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { handleUpdateCommand } = require('../lib/selfupdate');

test('does nothing when UPDATE_CHECK_ENABLED is disabled', async () => {
    const sock = { sendMessage: async () => assert.fail('should not send anything') };
    const msg = {
        key: { remoteJid: '1111@s.whatsapp.net', participant: '1111@s.whatsapp.net', fromMe: false },
        message: { conversation: '!update' },
    };
    const handled = await handleUpdateCommand(sock, msg, {
        git: { getLocalCommit: async () => 'a'.repeat(40), pull: async () => {} },
        httpClient: { get: async () => ({ data: { sha: 'b'.repeat(40), commit: { message: 'x' } } }) },
    });
    assert.equal(handled, false);
});
