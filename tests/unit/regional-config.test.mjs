import test from 'node:test';
import assert from 'node:assert/strict';
import * as config from '../../src/regional-config.js';
import * as index from '../../src/region-index.js';
import * as profile from '../../src/region-profile.js';
import { COS } from '../../src/config.js';

test('regional consumers retain shared asset protocol and public exports', () => {
  for (const key of ['REGION_RELEASE_ID', 'REGION_RELEASE_ROOT', 'REGION_BASE_URL', 'REGION_CATEGORIES']) {
    assert.strictEqual(index[key], config[key]);
  }
  assert.equal(config.REGION_RELEASE_ROOT, `${COS.baseUrl}/materials/regions/releases/`);
  assert.equal(config.REGION_BASE_URL, `${config.REGION_RELEASE_ROOT}${config.REGION_RELEASE_ID}/`);
  assert.equal(profile.REGION_ASSET_ROOT, config.REGION_BASE_URL);
  assert.equal(profile.JP_ASSET_ROOT, `${config.REGION_BASE_URL}jp/collection/`);
  assert.equal(profile.SALT_COVER_ROOT, `${config.REGION_BASE_URL}shared/saltmeta/covers/`);
  assert.equal(profile.LEGACY_JP_ASSET_ROOT, config.LEGACY_JP_ASSET_ROOT);
  assert.equal(profile.LEGACY_SALT_COVER_ROOT, config.LEGACY_SALT_COVER_ROOT);
  assert.deepEqual(Object.keys(profile.REGIONS), config.REGION_IDS);
  assert.ok(Object.isFrozen(config.REGION_CATEGORIES));
  assert.ok(Object.isFrozen(config.REGION_IDS));
});

test('shared pinned legacy roots preserve profile and offline migration', () => {
  for (const [category, legacy, path] of [
    ['icons', `${config.LEGACY_JP_ASSET_ROOT}icons/UI_Icon_000001.png`, 'jp/collection/icons/UI_Icon_000001.png'],
    ['songs', `${config.LEGACY_SALT_COVER_ROOT}000001.png`, 'shared/saltmeta/covers/000001.png'],
  ]) {
    assert.equal(index.imageToReleasePath(legacy, 'jp', category, config.REGION_BASE_URL, true), path);
    assert.equal(profile.migratePinnedRegionAssetUrl(legacy), config.REGION_BASE_URL + path);
  }
});
