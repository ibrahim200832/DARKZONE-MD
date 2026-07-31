// UPDATE_CHECK_ENABLED/PREFIX are read once when config.js first loads;
// default is already "true"/".", but set explicitly for clarity.
process.env.UPDATE_CHECK_ENABLED = 'true';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { handleUpdateCommand, checkForUpdateAndNotify, _resetStateForTests } = require('../lib/selfupdate');

beforeEach(_resetStateForTests);

function makeMsg(text, { fromMe = false, jid = '1111@s.whatsapp.net' } = {}) {
    return {
        key: { remoteJid: jid, participant: jid, fromMe },
        message: { conversation: text },
    };
}

function makeSock() {
    const sent = [];
    return { sent, sendMessage: async (jid, content, opts) => sent.push({ jid, content, opts }) };
}

function makeGit({ localSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', pullError } = {}) {
    return {
        getLocalCommit: async () => localSha,
        pull: async () => {
            if (pullError) throw pullError;
        },
    };
}

function makeHttpClient({ latestSha = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', latestMessage = 'Add a cool feature', commits, getError } = {}) {
    return {
        get: async (url) => {
            if (getError) throw getError;
            if (url.includes('/compare/')) {
                return { data: { commits: commits ?? [{ sha: latestSha, commit: { message: latestMessage } }] } };
            }
            return { data: { sha: latestSha, commit: { message: latestMessage } } };
        },
    };
}

test('ignores non-command text', async () => {
    const sock = makeSock();
    const handled = await handleUpdateCommand(sock, makeMsg('was ist das update von heute'), {
        git: makeGit(),
        httpClient: makeHttpClient(),
    });
    assert.equal(handled, false);
    assert.equal(sock.sent.length, 0);
});

test('ignores messages sent by the bot itself', async () => {
    const sock = makeSock();
    const handled = await handleUpdateCommand(sock, makeMsg('!update', { fromMe: true }), {
        git: makeGit(),
        httpClient: makeHttpClient(),
    });
    assert.equal(handled, false);
});

test('matches "!update" exactly', async () => {
    const sock = makeSock();
    const localSha = 'cccccccccccccccccccccccccccccccccccccccc';
    const handled = await handleUpdateCommand(sock, makeMsg('!update'), {
        git: makeGit({ localSha }),
        httpClient: makeHttpClient({ latestSha: localSha }),
    });
    assert.equal(handled, true);
});

test('matches "<PREFIX>update" (default prefix ".")', async () => {
    const sock = makeSock();
    const localSha = 'cccccccccccccccccccccccccccccccccccccccc';
    const handled = await handleUpdateCommand(sock, makeMsg('.update'), {
        git: makeGit({ localSha }),
        httpClient: makeHttpClient({ latestSha: localSha }),
    });
    assert.equal(handled, true);
});

test('reports up to date without pulling when commits match', async () => {
    const sock = makeSock();
    const localSha = 'dddddddddddddddddddddddddddddddddddddddd';
    let pulled = false;
    const git = { getLocalCommit: async () => localSha, pull: async () => (pulled = true) };

    const handled = await handleUpdateCommand(sock, makeMsg('!update'), {
        git,
        httpClient: makeHttpClient({ latestSha: localSha }),
    });

    assert.equal(handled, true);
    assert.equal(pulled, false);
    assert.equal(sock.sent.length, 1);
    assert.match(sock.sent[0].content.text, /bereits auf dem neuesten Stand/);
});

test('shows the changelog and installs the update when one is available', async () => {
    const sock = makeSock();
    const localSha = 'e'.repeat(40);
    const latestSha = 'f'.repeat(40);
    let exitCode = null;

    const handled = await handleUpdateCommand(sock, makeMsg('!update'), {
        git: makeGit({ localSha }),
        httpClient: makeHttpClient({
            latestSha,
            commits: [{ sha: latestSha, commit: { message: 'Add the self-update command' } }],
        }),
        exit: (code) => (exitCode = code),
        restartDelayMs: 0,
    });

    assert.equal(handled, true);
    assert.equal(sock.sent.length, 2);
    assert.match(sock.sent[0].content.text, /Update verfügbar/);
    assert.match(sock.sent[0].content.text, /Add the self-update command/);
    assert.match(sock.sent[0].content.text, /noch nicht heruntergeladen/i);
    assert.match(sock.sent[1].content.text, /erfolgreich installiert/);

    // exit() runs on a timer; give it a tick to fire since restartDelayMs=0.
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(exitCode, 0);
});

test('reports a friendly error and does not exit when the pull fails', async () => {
    const sock = makeSock();
    const localSha = 'a'.repeat(40);
    const latestSha = 'b'.repeat(40);
    let exitCalled = false;

    const handled = await handleUpdateCommand(sock, makeMsg('!update'), {
        git: makeGit({ localSha, pullError: new Error('merge conflict') }),
        httpClient: makeHttpClient({ latestSha }),
        exit: () => (exitCalled = true),
        restartDelayMs: 0,
    });

    assert.equal(handled, true);
    assert.equal(sock.sent.length, 2);
    assert.match(sock.sent[1].content.text, /konnte nicht installiert werden/);
    assert.match(sock.sent[1].content.text, /merge conflict/);

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(exitCalled, false);
});

test('reports a friendly error when GitHub cannot be reached', async () => {
    const sock = makeSock();
    const handled = await handleUpdateCommand(sock, makeMsg('!update'), {
        git: makeGit(),
        httpClient: makeHttpClient({ getError: new Error('network down') }),
    });

    assert.equal(handled, true);
    assert.match(sock.sent[0].content.text, /konnte nicht prüfen/);
});

test('a second "!update" while one is already installing is told to wait', async () => {
    const sock = makeSock();
    const localSha = 'a'.repeat(40);
    const latestSha = 'b'.repeat(40);

    // Slow pull() so the second call below lands while the first is still running.
    let resolvePull;
    const git = {
        getLocalCommit: async () => localSha,
        pull: () => new Promise((resolve) => (resolvePull = resolve)),
    };
    const httpClient = makeHttpClient({ latestSha });

    const firstCall = handleUpdateCommand(sock, makeMsg('!update'), { git, httpClient, restartDelayMs: 0 });
    // Let the first call reach the in-flight `pull()` before firing the second.
    await new Promise((resolve) => setImmediate(resolve));

    const secondHandled = await handleUpdateCommand(sock, makeMsg('!update'), { git, httpClient });
    assert.equal(secondHandled, true);
    assert.match(sock.sent[sock.sent.length - 1].content.text, /wird gerade schon ein Update installiert/);

    resolvePull();
    await firstCall;
});

test('checkForUpdateAndNotify DMs the owner once per new commit', async () => {
    const sock = makeSock();
    const localSha = 'a'.repeat(40);
    const latestSha = 'b'.repeat(40);
    const opts = {
        git: makeGit({ localSha }),
        httpClient: makeHttpClient({ latestSha, commits: [{ sha: latestSha, commit: { message: 'New feature' } }] }),
        ownerNumber: '491701234567',
    };

    const firstResult = await checkForUpdateAndNotify(sock, opts);
    assert.equal(firstResult, true);
    assert.equal(sock.sent.length, 1);
    assert.equal(sock.sent[0].jid, '491701234567@s.whatsapp.net');
    assert.match(sock.sent[0].content.text, /Ein neues Update ist verfügbar/);

    // Same commit again - should not notify a second time.
    const secondResult = await checkForUpdateAndNotify(sock, opts);
    assert.equal(secondResult, false);
    assert.equal(sock.sent.length, 1);
});
