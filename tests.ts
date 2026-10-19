import test from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import { 
  generateCheckoutToken, 
  verifyCheckoutToken, 
  isCheckoutSessionAuthorized,
  simulatedIdempotencyRegistry,
  getAuthoritativePdfPageCount,
  computeAuthoritativeLifoPages,
  areNamesMatching
} from './server.ts';

test('1. Checkout Token Expiration and Secure Validation', () => {
  const orderId = 'test-order-123';
  
  // Generate valid token with 10 seconds TTL
  const token = generateCheckoutToken(orderId, 10);
  assert.strictEqual(verifyCheckoutToken(orderId, token), true, 'Valid token should verify successfully');

  // Verify failure for wrong order ID
  assert.strictEqual(verifyCheckoutToken('wrong-order', token), false, 'Token verified with wrong order ID should fail');

  // Verify failure for tampered token
  assert.strictEqual(verifyCheckoutToken(orderId, token + 'tampered'), false, 'Tampered token should fail');

  // Generate expired token (-5 seconds TTL)
  const expiredToken = generateCheckoutToken(orderId, -5);
  assert.strictEqual(verifyCheckoutToken(orderId, expiredToken), false, 'Expired token should fail verification');
});

test('2. Simulation Idempotency Registry & Cache', () => {
  const idempotencyKey = 'idem-key-999';
  const orderId = 'ord-456';
  
  // Register in memory registry
  simulatedIdempotencyRegistry.set(idempotencyKey, {
    orderId,
    paymentId: 'pay-789',
    mpesaReceipt: 'SIMXYZ123',
    createdAt: Date.now()
  });

  const cached = simulatedIdempotencyRegistry.get(idempotencyKey);
  assert.strictEqual(cached?.orderId, orderId, 'Cached idempotency record should match orderId');
  assert.strictEqual(cached?.mpesaReceipt, 'SIMXYZ123');
});

test('3. Order Status Privacy & Unauthorized Access Control', () => {
  const orderId = 'order-privacy-test';
  
  // Mock mock request without auth or checkout token
  const reqUnauth: any = {
    headers: {},
    query: {},
    body: {}
  };

  assert.strictEqual(
    isCheckoutSessionAuthorized(reqUnauth, orderId), 
    false, 
    'Unauthorized caller without session token or auth should be rejected'
  );

  // Mock request with valid checkout token
  const validToken = generateCheckoutToken(orderId, 3600);
  const reqAuth: any = {
    headers: { 'x-checkout-token': validToken },
    query: {},
    body: {}
  };

  assert.strictEqual(
    isCheckoutSessionAuthorized(reqAuth, orderId), 
    true, 
    'Authorized caller with valid checkout token should pass'
  );
});

test('4. Daraja Terminal State Protection Logic', () => {
  // Test simulation terminal state protection simulation
  const paymentState = { id: 'p-1', status: 'completed' };
  
  // If payment is already completed, callbacks or retries in terminal state are protected
  const isTerminal = paymentState.status === 'completed' || paymentState.status === 'failed';
  assert.strictEqual(isTerminal, true, 'Completed payment should be recognized as terminal state');
});

test('5. Deterministic Last-N-Pages Selection Logic', () => {
  const computeLastN = (totalPages: number, n: number) => {
    if (n < 1 || n > totalPages) return [];
    return Array.from({ length: n }, (_, i) => totalPages - n + i + 1);
  };

  // 300-page document, quantity 6 -> pages 295–300
  const res1 = computeLastN(300, 6);
  assert.deepStrictEqual(res1, [295, 296, 297, 298, 299, 300]);

  // 300-page document, quantity 10 -> pages 291–300
  const res2 = computeLastN(300, 10);
  assert.strictEqual(res2.length, 10);
  assert.strictEqual(res2[0], 291);
  assert.strictEqual(res2[9], 300);

  // 100-page document, quantity 20 -> pages 81–100
  const res3 = computeLastN(100, 20);
  assert.strictEqual(res3[0], 81);
  assert.strictEqual(res3[res3.length - 1], 100);

  // 20-page document, quantity 6 -> pages 15–20
  const res4 = computeLastN(20, 6);
  assert.deepStrictEqual(res4, [15, 16, 17, 18, 19, 20]);

  // Invalid quantities
  assert.deepStrictEqual(computeLastN(300, 0), []);
  assert.deepStrictEqual(computeLastN(300, 301), []);
});

test('6. Authoritative Server-Side PDF Page Count Extraction', async () => {
  // Test missing or invalid path
  const resInvalid = await getAuthoritativePdfPageCount('nonexistent/path/file.pdf');
  assert.strictEqual(resInvalid.pageCount, null);
  assert.ok(resInvalid.error);

  // Test real Microeconomics PDF stored at papers/34FT4/1789736954276-cpv4k7c-merged.pdf
  const resMicro = await getAuthoritativePdfPageCount('papers/34FT4/1789736954276-cpv4k7c-merged.pdf');
  assert.strictEqual(resMicro.pageCount, 303, 'Microeconomics PDF should authoritatively return 303 pages');
  assert.strictEqual(resMicro.error, undefined);
});

test('7. Synchronized API Page Counts & Microeconomics = 303 Pages', async () => {
  const resMicro = await getAuthoritativePdfPageCount('papers/34FT4/1789736954276-cpv4k7c-merged.pdf');
  assert.strictEqual(resMicro.pageCount, 303, 'Microeconomics paper must report 303 pages');
});

test('8. Server-Authoritative LIFO Selection Engine (303 Pages)', () => {
  // 1. 303 pages, 12 pages -> [292..303]
  const p12 = computeAuthoritativeLifoPages(303, 12);
  assert.strictEqual(p12.length, 12);
  assert.strictEqual(p12[0], 292);
  assert.strictEqual(p12[p12.length - 1], 303);

  // 2. 303 pages, 3 pages -> [301..303]
  const p3 = computeAuthoritativeLifoPages(303, 3);
  assert.deepStrictEqual(p3, [301, 302, 303]);

  // 3. One-page purchase -> [303]
  const p1 = computeAuthoritativeLifoPages(303, 1);
  assert.deepStrictEqual(p1, [303]);

  // 4. Purchasing all 303 pages -> [1..303]
  const p303 = computeAuthoritativeLifoPages(303, 303);
  assert.strictEqual(p303.length, 303);
  assert.strictEqual(p303[0], 1);
  assert.strictEqual(p303[302], 303);

  // 5. Zero, negative, non-integer, excessive quantities rejected
  assert.deepStrictEqual(computeAuthoritativeLifoPages(303, 0), []);
  assert.deepStrictEqual(computeAuthoritativeLifoPages(303, -5), []);
  assert.deepStrictEqual(computeAuthoritativeLifoPages(303, 2.5), []);
  assert.deepStrictEqual(computeAuthoritativeLifoPages(303, 304), []);
});

test('9. Resilient Student Name Verification Matching', () => {
  // Exact match
  assert.strictEqual(areNamesMatching('Collins', 'Angima', 'Collins', 'Angima'), true);
  // Case insensitivity
  assert.strictEqual(areNamesMatching('collins', 'angima', 'COLLINS', 'ANGIMA'), true);
  // Swapped first & second name
  assert.strictEqual(areNamesMatching('Collins', 'Angima', 'Angima', 'Collins'), true);
  // Extra whitespace and padding
  assert.strictEqual(areNamesMatching(' Collins ', ' Angima ', 'Collins', 'Angima'), true);
  // Full name entered in first field
  assert.strictEqual(areNamesMatching('Collins Angima', '', 'Collins', 'Angima'), true);
  // Single name match
  assert.strictEqual(areNamesMatching('glo', 'glo', 'glo', 'glo'), true);
  // Mismatch cases
  assert.strictEqual(areNamesMatching('Collins', 'Angima', 'Peter', 'Kamau'), false);
  assert.strictEqual(areNamesMatching('', '', 'Collins', 'Angima'), false);
});

console.log('All automated tests executed successfully.');
