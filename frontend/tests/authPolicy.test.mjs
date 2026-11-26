import test from 'node:test';
import assert from 'node:assert/strict';
import { isSessionRejected, shouldClearAccountCache } from '../src/authPolicy.ts';

test('only explicit invalid credentials clear session', () => {
  assert.equal(isSessionRejected({ status: 401 }), true);
  assert.equal(isSessionRejected({ status: 403 }), true);
  assert.equal(isSessionRejected({ status: 503 }), false);
  assert.equal(isSessionRejected(new TypeError('Failed to fetch')), false);
});
test('data is isolated when switching accounts', () => {
  assert.equal(shouldClearAccountCache({ id: 'a' }, { id: 'b' }), true);
  assert.equal(shouldClearAccountCache({ id: 'a' }, { id: 'a' }), false);
  assert.equal(shouldClearAccountCache(null, { id: 'a' }), false);
});
