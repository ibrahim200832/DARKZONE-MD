// ANTI_LINK is read once when config.js first loads, so set the env var
// before requiring anything from lib/ in this process.
process.env.ANTI_LINK = 'false';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { handleAntiLink } = require('../lib/antilink');

test('does nothing when ANTI_LINK is disabled', async () => {
    const sock = { sendMessage: async () => assert.fail('should not send anything') };
    const msg = {
        key: { remoteJid: '999@g.us', participant: '1111@s.whatsapp.net', fromMe: false },
        message: { conversation: 'https://example.com' },
    };
    const handled = await handleAntiLink(sock, msg);
    assert.equal(handled, false);
});
