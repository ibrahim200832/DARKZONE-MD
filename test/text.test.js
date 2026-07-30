const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getMessageText, containsLink } = require('../lib/text');

test('getMessageText reads plain conversation text', () => {
    const msg = { message: { conversation: 'hello there' } };
    assert.equal(getMessageText(msg), 'hello there');
});

test('getMessageText reads extendedTextMessage text', () => {
    const msg = { message: { extendedTextMessage: { text: 'quoted reply' } } };
    assert.equal(getMessageText(msg), 'quoted reply');
});

test('getMessageText reads image/video captions', () => {
    assert.equal(getMessageText({ message: { imageMessage: { caption: 'nice pic' } } }), 'nice pic');
    assert.equal(getMessageText({ message: { videoMessage: { caption: 'nice vid' } } }), 'nice vid');
});

test('getMessageText returns empty string for unsupported/missing message', () => {
    assert.equal(getMessageText({ message: { stickerMessage: {} } }), '');
    assert.equal(getMessageText({}), '');
    assert.equal(getMessageText(null), '');
});

test('containsLink detects common link forms', () => {
    assert.equal(containsLink('check https://example.com'), true);
    assert.equal(containsLink('visit www.example.com now'), true);
    assert.equal(containsLink('join chat.whatsapp.com/abc123'), true);
    assert.equal(containsLink('see t.me/somechannel'), true);
});

test('containsLink ignores plain text without links', () => {
    assert.equal(containsLink('just a normal message'), false);
    assert.equal(containsLink(''), false);
    assert.equal(containsLink(undefined), false);
});
