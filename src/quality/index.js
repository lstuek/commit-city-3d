// Page wiring for the quality governor (#14): start tier from the device, governor
// from measured frame times, the phone lite 30 fps cap, graphics context-loss
// recovery and benchmark mode. main.js wraps its frame callback with quality.loop().
// Status goes to <body data-tier data-context data-bench> for the page test.
import { TIER_SETTINGS, chooseTier, pinnedTier } from './tiers.js';
import { createGovernor } from './governor.js';
import { createFrameCap } from './frame-cap.js';
import { benchParams, createBenchmark } from '../bench/benchmark.js';

const STALL_MS = 250; // a gap this long (hidden tab, debugger) is not a frame time
const RESTORE_WAIT_MS = 5000; // no restore by then: reload the page

function rendererString(gl) {
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
}

async function hasWebGPUAdapter() {
  if (!navigator.gpu) return false;
  const timeout = new Promise((ok) => setTimeout(ok, 1000, null));
  return !!(await Promise.race([navigator.gpu.requestAdapter().catch(() => null), timeout]));
}

function watchContext(canvas, status) {
  let reload = 0;
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault(); // allows restore
    status.context = 'lost';
    reload = setTimeout(() => location.reload(), RESTORE_WAIT_MS);
  });
  canvas.addEventListener('webglcontextrestored', () => {
    clearTimeout(reload);
    status.context = 'restored'; // three.js re-creates its GL state; the next render re-uploads
  });
}

function showReport(report) {
  const out = document.createElement('pre');
  out.id = 'bench-report';
  out.textContent = JSON.stringify(report, null, 2);
  document.body.append(out);
}

export async function startQuality({ renderer, camera }) {
  const status = document.body.dataset;
  const pinned = pinnedTier(location.search);
  const gpu = rendererString(renderer.getContext());
  const tier = chooseTier({
    pinned,
    coarsePointer: matchMedia('(pointer: coarse)').matches,
    webgpuAdapter: pinned ? false : await hasWebGPUAdapter(),
    renderer: gpu,
  });

  let cap;
  function apply(next) {
    const settings = TIER_SETTINGS[next];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.pixelRatioCap));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = settings.liveShadow;
    cap = createFrameCap(settings.fpsCap);
    status.tier = next;
  }
  apply(tier);

  const params = benchParams(location.search);
  const bench = params && createBenchmark({ ...params, tier, renderer: gpu });
  // Benchmarks hold one tier for the whole run; otherwise the governor may move it.
  const governor = !pinned && !bench && createGovernor({ tier, onChange: apply });
  if (bench) status.bench = 'running';
  watchContext(renderer.domElement, status);

  return {
    tier: () => status.tier,
    /** Wrap the frame callback: cap, benchmark camera, governor and context status. */
    loop(render) {
      let last = null;
      return (now) => {
        if (!cap.shouldRender(now)) return;
        if (bench && !bench.done) {
          const pose = bench.pose(now);
          camera.position.copy(pose.position);
          camera.lookAt(pose.target);
        }
        render(now);
        if (status.context === 'restored' && renderer.info.render.calls > 0) status.context = 'drawing';
        if (bench && !bench.done) {
          bench.record(now, renderer.info.render);
          if (bench.done) {
            showReport(bench.report);
            status.bench = 'done';
          }
        }
        if (governor && last !== null && now - last < STALL_MS) governor.sample(now - last);
        last = now;
      };
    },
  };
}
