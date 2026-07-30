// AI_CHAT is read once when config.js first loads, so set the env var
// before requiring anything from lib/ in this process.
process.env.AI_CHAT = 'true';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { handleAiChat, ask } = require('../lib/aichat');

function makeMsg({ remoteJid = '1111@s.whatsapp.net', text = 'wie spät ist es', fromMe = false } = {}) {
    return {
        key: { remoteJid, participant: remoteJid, fromMe },
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

function makeHttpClient({ getResult, postResult, getError, postError } = {}) {
    return {
        get: async (...args) => {
            if (getError) throw getError;
            return getResult ?? { data: 'FAKE_REPLY' };
        },
        post: async (...args) => {
            if (postError) throw postError;
            return postResult ?? { data: { reply: 'FAKE_BACKEND_REPLY' } };
        },
    };
}

test('ignores group messages', async () => {
    const sock = makeSock();
    const httpClient = makeHttpClient();
    const handled = await handleAiChat(sock, makeMsg({ remoteJid: '999@g.us' }), { httpClient, backendUrl: '' });
    assert.equal(handled, false);
    assert.equal(sock.sent.length, 0);
});

test('ignores messages sent by the bot itself', async () => {
    const sock = makeSock();
    const httpClient = makeHttpClient();
    const handled = await handleAiChat(sock, makeMsg({ fromMe: true }), { httpClient, backendUrl: '' });
    assert.equal(handled, false);
});

test('ignores empty messages', async () => {
    const sock = makeSock();
    const httpClient = makeHttpClient();
    const handled = await handleAiChat(sock, makeMsg({ text: '   ' }), { httpClient, backendUrl: '' });
    assert.equal(handled, false);
});

test('replies via the free fallback when no backend is configured', async () => {
    const sock = makeSock();
    const httpClient = makeHttpClient({ getResult: { data: 'Natürlich, Master.' } });
    const handled = await handleAiChat(sock, makeMsg(), { httpClient, backendUrl: '' });

    assert.equal(handled, true);
    assert.equal(sock.sent.length, 1);
    assert.equal(sock.sent[0].content.text, 'Natürlich, Master.');
});

test('replies via the custom backend when one is configured', async () => {
    const sock = makeSock();
    const httpClient = makeHttpClient({ postResult: { data: { reply: 'Sofort erledigt, Master.' } } });
    const handled = await handleAiChat(sock, makeMsg(), {
        httpClient,
        backendUrl: 'https://jarvis-ai.example.workers.dev',
    });

    assert.equal(handled, true);
    assert.equal(sock.sent[0].content.text, 'Sofort erledigt, Master.');
});

test('falls back to a friendly message when the free API errors out', async () => {
    const httpClient = makeHttpClient({ getError: new Error('network down') });
    const reply = await ask('hallo', { httpClient, backendUrl: '' });
    assert.match(reply, /konnte die KI gerade nicht erreichen/);
});

test('falls back to a friendly message when the free API returns nothing useful', async () => {
    const httpClient = makeHttpClient({ getResult: { data: '' } });
    const reply = await ask('hallo', { httpClient, backendUrl: '' });
    assert.match(reply, /keine Antwort bekommen/);
});

test('falls back to a friendly message when the custom backend errors out', async () => {
    const httpClient = makeHttpClient({ postError: new Error('502') });
    const reply = await ask('hallo', { httpClient, backendUrl: 'https://example.com' });
    assert.match(reply, /konnte die KI gerade nicht erreichen/);
});

test('falls back to a friendly message when the custom backend returns no reply', async () => {
    const httpClient = makeHttpClient({ postResult: { data: {} } });
    const reply = await ask('hallo', { httpClient, backendUrl: 'https://example.com' });
    assert.equal(reply, 'Ich habe keine Antwort erhalten.');
});
