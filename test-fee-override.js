'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { estimateStellarFeeDetails, resolveCustomFee, clampFee, getFeeEngineConfig } = require('./src/services/fee-engine');

test('Fee Override: resolveCustomFee validates', async (t) => {
  await t.test('accepts valid fee', () => {
    const result = resolveCustomFee('5000');
    assert.strictEqual(result, 5000n);
  });

  await t.test('rejects zero', () => {
    assert.throws(() => resolveCustomFee('0'));
  });
});

test('Fee Override: clampFee enforces bounds', async (t) => {
  const config = getFeeEngineConfig({ STELLAR_MIN_FEE: '100', STELLAR_MAX_FEE: '10000' });

  await t.test('clamps below min', () => {
    const result = clampFee(50n, config.minFee, config.maxFee);
    assert.strictEqual(result, config.minFee);
  });

  await t.test('clamps above max', () => {
    const result = clampFee(20000n, config.minFee, config.maxFee);
    assert.strictEqual(result, config.maxFee);
  });
});

test('Fee Override: estimateStellarFeeDetails applies override', async (t) => {
  const config = getFeeEngineConfig({ STELLAR_MIN_FEE: '100', STELLAR_MAX_FEE: '10000' });

  await t.test('uses feeOverride', async () => {
    const result = await estimateStellarFeeDetails({
      config,
      feeOverride: '7500',
      logger: { log: () => {} }
    });
    assert.strictEqual(result.fee, '7500');
    assert.strictEqual(result.source, 'override');
  });
});