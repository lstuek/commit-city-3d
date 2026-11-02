import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import basisJsUrl from 'three/examples/jsm/libs/basis/basis_transcoder.js?url';
import basisWasmUrl from 'three/examples/jsm/libs/basis/basis_transcoder.wasm?url';
import sampleUrl from './generated/sample.glb?url';

const status = document.body.dataset;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(2, 1.5, 3);
camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight(0x88aaff, 0x221133, 1.5));

// KTX2Loader fetches the transcoder by fixed file names; map them to the hashed files.
const transcoder = { 'basis/basis_transcoder.js': basisJsUrl, 'basis/basis_transcoder.wasm': basisWasmUrl };
const manager = new THREE.LoadingManager();
manager.setURLModifier((url) => transcoder[url] ?? url);
const ktx2 = new KTX2Loader(manager).setTranscoderPath('basis/').detectSupport(renderer);
const gltfLoader = new GLTFLoader(manager).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);

async function loadCityData() {
  const param = new URLSearchParams(location.search).get('data');
  if (!param) return null;
  const url = new URL(param, location.href);
  if (url.origin !== location.origin) throw new Error('city data must be same-origin');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`city data ${response.status}`);
  return response.json();
}

const [gltf, city] = await Promise.all([gltfLoader.loadAsync(sampleUrl), loadCityData()]);
scene.add(gltf.scene);
status.model = 'loaded';
status.cityData = city?.generated_at ?? 'none';

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);

let frames = 0;
renderer.setAnimationLoop((t) => {
  gltf.scene.rotation.y = t / 2000;
  renderer.render(scene, camera);
  if (++frames === 3) status.ready = 'true';
});
