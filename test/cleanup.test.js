'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

// Register ts-node so TypeScript files can be required directly
require('ts-node/register');

const { purgeFailedTasks, startCleanupWorker } = require('../src/workers/cleanup.ts');

/**
 * Build a lightweight mock pg Pool client.
 */
function makeMockPool({ rowCount = 0, shouldThrow = false } = {}) {
  const releaseSpy = { called: false };
  const querySpy = { calls: [] };

  const mockClient = {
    query: async (queryText) => {
      querySpy.calls.push(queryText);
      if (shouldThrow) throw new Error('Database connection timed out');
      return { rowCount };
    },
    release() {
      releaseSpy.called = true;
    }
  };

  const mockPool = {
    connect: async () => mockClient,
    _spy: { releaseSpy, querySpy }
  };

  return mockPool;
}

// ---------------------------------------------------------------------------
// purgeFailedTasks
// ---------------------------------------------------------------------------

test('purgeFailedTasks deletes stale failed tasks and returns deleted count', async () => {
  const pool = makeMockPool({ rowCount: 12 });

  const deletedCount = await purgeFailedTasks(pool);

  assert.equal(deletedCount, 12);
  assert.equal(pool._spy.querySpy.calls.length, 1);
  assert.match(pool._spy.querySpy.calls[0], /DELETE FROM tasks/);
  assert.match(pool._spy.querySpy.calls[0], /status = 'failed'/);
  assert.match(pool._spy.querySpy.calls[0], /INTERVAL '7 days'/);
});

test('purgeFailedTasks releases the client after a successful query', async () => {
  const pool = makeMockPool({ rowCount: 3 });

  await purgeFailedTasks(pool);

  assert.ok(pool._spy.releaseSpy.called, 'client.release() must be called after success');
});

test('purgeFailedTasks releases the client even when the query throws', async () => {
  const pool = makeMockPool({ shouldThrow: true });

  await assert.rejects(
    () => purgeFailedTasks(pool),
    /Database connection timed out/
  );

  assert.ok(pool._spy.releaseSpy.called, 'client.release() must be called even after error');
});

test('purgeFailedTasks returns 0 when rowCount is null', async () => {
  const pool = makeMockPool({ rowCount: null });

  const deletedCount = await purgeFailedTasks(pool);

  assert.equal(deletedCount, 0);
});

// ---------------------------------------------------------------------------
// startCleanupWorker
// ---------------------------------------------------------------------------

test('startCleanupWorker returns a task with start/stop methods', () => {
  const task = startCleanupWorker({ schedule: '0 0 * * *' });

  assert.equal(typeof task.start, 'function');
  assert.equal(typeof task.stop, 'function');

  task.stop();
});

test('startCleanupWorker throws on an invalid cron expression', () => {
  assert.throws(
    () => startCleanupWorker({ schedule: 'not-valid-cron' }),
    /Invalid cron expression/
  );
});

test('startCleanupWorker calls purgeFailedTasks with the injected pool on each tick', async () => {
  const pool = makeMockPool({ rowCount: 5 });

  // Use every-second cron so the job fires within our 1.1s wait
  const task = startCleanupWorker({ schedule: '* * * * * *', pool });
  task.start();

  await new Promise((resolve) => setTimeout(resolve, 1100));
  task.stop();

  assert.ok(
    pool._spy.querySpy.calls.length >= 1,
    'expected at least one DELETE query to have been executed'
  );
});
