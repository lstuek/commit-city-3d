import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseTier, gpuClass, pinnedTier } from '../../src/quality/tiers.js';

const desktop = { coarsePointer: false, webgpuAdapter: true, renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)' };

test('a discrete desktop GPU with a WebGPU adapter starts at desktop full', () => {
  assert.equal(chooseTier(desktop), 'desktop-full');
});

test('a coarse pointer starts at phone lite, whatever the GPU', () => {
  assert.equal(chooseTier({ ...desktop, coarsePointer: true, renderer: 'Apple GPU' }), 'phone-lite');
});

test('an integrated GPU without a WebGPU adapter starts at desktop reduced', () => {
  assert.equal(chooseTier({ coarsePointer: false, webgpuAdapter: false, renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)' }), 'desktop-reduced');
});

test('an integrated GPU with a WebGPU adapter keeps desktop full', () => {
  assert.equal(chooseTier({ coarsePointer: false, webgpuAdapter: true, renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)' }), 'desktop-full');
});

test('a software renderer starts at desktop reduced even with an adapter', () => {
  assert.equal(chooseTier({ coarsePointer: false, webgpuAdapter: true, renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)' }), 'desktop-reduced');
});

test('gpu class reads the renderer string', () => {
  assert.equal(gpuClass('llvmpipe (LLVM 15.0.7, 256 bits)'), 'software');
  assert.equal(gpuClass('ANGLE (AMD, AMD Radeon RX 7800 XT Direct3D11)'), 'discrete');
  assert.equal(gpuClass('ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11)'), 'integrated');
  assert.equal(gpuClass('Apple M2'), 'discrete');
  assert.equal(gpuClass(''), 'integrated');
});

test('the tier URL flag wins over every capability', () => {
  assert.equal(pinnedTier('?tier=phone-lite'), 'phone-lite');
  assert.equal(chooseTier({ ...desktop, pinned: pinnedTier('?tier=phone-lite') }), 'phone-lite');
  assert.equal(chooseTier({ ...desktop, coarsePointer: true, pinned: pinnedTier('?bench=1&tier=desktop-full') }), 'desktop-full');
});

test('an unknown tier flag is ignored', () => {
  assert.equal(pinnedTier('?tier=ultra'), null);
  assert.equal(pinnedTier(''), null);
  assert.equal(chooseTier({ ...desktop, pinned: pinnedTier('?tier=ultra') }), 'desktop-full');
});
