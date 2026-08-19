import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

// Raw FBX parse cache, keyed by URL — module-level (not per-controller/per-
// VRM) since the parsed Mixamo asset itself (bone hierarchy + un-retargeted
// clip) has nothing VRM-specific about it and is safe to reuse across a VRM
// swap or multiple AvatarCanvas instances on the same page. Retargeting
// (which IS VRM-specific) happens separately in avatar-animation-retarget.ts
// against this cached raw asset, so switching avatars never re-downloads the
// same gesture FBX twice.
const rawAssetCache = new Map<string, Promise<THREE.Group>>();

/** Fetches + parses an FBX file once per URL for the lifetime of the page; every subsequent call for the same URL returns the same in-flight/resolved promise. */
export function loadFbxAsset(url: string): Promise<THREE.Group> {
  let promise = rawAssetCache.get(url);
  if (!promise) {
    const loader = new FBXLoader();
    promise = loader.loadAsync(url).then((asset) => {
      asset.updateMatrixWorld(true);
      return asset;
    });
    // A failed load must not poison the cache forever — the next
    // playAnimation() attempt (e.g. after a network blip) should retry
    // the fetch rather than replay the same rejected promise indefinitely.
    promise.catch(() => rawAssetCache.delete(url));
    rawAssetCache.set(url, promise);
  }
  return promise;
}
