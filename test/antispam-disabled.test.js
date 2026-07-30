// ANTI_SPAM is read once when config.js first loads, so set the env var
// before requiring anything from lib/ in this process.
process.env.ANTI_SPAM = 'false';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { handleAntiSpam } = require('../lib/antispam');

test('does nothing when ANTI_SPAM is disabled', async () => {
    const sock = { sendMessage: async () => assert.fail('should not send anything') };
    const msg = {
        key: { remoteJid: '999@g.us', participant: '1111@s.whatsapp.net', fromMe: false },
        message: { conversation: 'hallo' },
    };
    for (let i = 0; i < 10; i++) {
        const handled = await handleAntiSpam(sock, msg);
        assert.equal(handled, false);
    }
});
