/**
 * Post-processing pipeline.
 *
 * The single biggest realism gap in a raw three.js render is missing ambient
 * occlusion — without contact darkening every surface floats and the whole
 * image reads flat. N8AO (N8python) is a high-quality, temporally stable SSAO
 * that works on current three.js; realism-effects (SSGI) was the other
 * candidate but its last release is May 2023 and it breaks on r169.
 *
 * Order matters: AO is applied to the HDR buffer, then exposure, bloom and
 * tone mapping, and SMAA runs last on the resolved LDR image (hardware MSAA
 * can't be used once we need a depth buffer).
 */

import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, Effect,
  BloomEffect, SMAAEffect, SMAAPreset,
  ToneMappingEffect, ToneMappingMode,
  VignetteEffect, BrightnessContrastEffect, HueSaturationEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

/**
 * postprocessing's ACES/AgX tone mappers ignore `renderer.toneMappingExposure`
 * (only Reinhard2 and Uncharted2 read it), so exposure gets its own pass.
 */
class ExposureEffect extends Effect {
  constructor(exposure = 1) {
    super('ExposureEffect', /* glsl */`
      uniform float exposure;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        outputColor = vec4(inputColor.rgb * exposure, inputColor.a);
      }`,
      { uniforms: new Map([['exposure', new THREE.Uniform(exposure)]]) });
  }
  set exposure(v) { this.uniforms.get('exposure').value = v; }
  get exposure() { return this.uniforms.get('exposure').value; }
}

export function createPipeline(renderer, scene, camera) {
  // Tone mapping moves into the pipeline; the renderer must hand over linear HDR.
  renderer.toneMapping = THREE.NoToneMapping;

  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
  composer.multisampling = 0;                       // AO needs depth; SMAA does the AA
  composer.addPass(new RenderPass(scene, camera));

  const ao = new N8AOPostPass(scene, camera, innerWidth, innerHeight);
  ao.setQualityMode('High');          // 64 AO samples, 8 denoise, radius 6
  Object.assign(ao.configuration, {
    // Screen-space radius, not world-space: this scene is viewed from 8 m
    // (inside a chamber) to 400 m (aerial), and a fixed metre radius would
    // vanish at the far end.
    screenSpaceRadius: true,
    aoRadius: 36,
    distanceFalloff: 1.0,
    intensity: 3.2,
    halfRes: false,
    gammaCorrection: false,                          // the composer handles output
    color: new THREE.Color(0x2a2118),                // warm occlusion, not black
  });
  composer.addPass(ao);

  const exposure = new ExposureEffect(1.0);
  const bloom = new BloomEffect({
    intensity: 0.62,
    luminanceThreshold: 0.86,
    luminanceSmoothing: 0.28,
    mipmapBlur: true,
    radius: 0.72,
  });
  // Khronos PBR Neutral over AgX: AgX's desaturated shoulder drains the warmth
  // out of sandstone, which is most of what this model is made of.
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL });
  const grade = new BrightnessContrastEffect({ brightness: 0.0, contrast: 0.1 });
  const sat = new HueSaturationEffect({ saturation: 0.05 });
  const vignette = new VignetteEffect({ offset: 0.42, darkness: 0.2 });
  const smaa = new SMAAEffect({ preset: SMAAPreset.HIGH });

  const effectPass = new EffectPass(camera, exposure, bloom, tone, grade, sat, vignette, smaa);
  composer.addPass(effectPass);

  const state = {
    ao: true, bloom: true, smaa: true, vignette: true,
    halfResAO: false, aoOnly: false, quality: 'High',
  };

  /** Effects can't be removed cheaply, so disabling means neutralising. */
  function apply() {
    ao.enabled = state.ao;
    ao.setDisplayMode(state.aoOnly ? 'AO' : 'Combined');
    ao.configuration.halfRes = state.halfResAO;
    bloom.intensity = state.bloom ? 0.62 : 0;
    smaa.blendMode.opacity.value = state.smaa ? 1 : 0;
    vignette.blendMode.opacity.value = state.vignette ? 1 : 0;
  }
  apply();

  return {
    composer,
    state,
    apply,
    qualities: ['Performance', 'Medium', 'High', 'Ultra'],
    setQuality: (mode) => {
      ao.setQualityMode(mode);
      ao.configuration.halfRes = state.halfResAO;   // preset doesn't own this
      state.quality = mode;
    },
    setExposure: (v) => { exposure.exposure = v; },
    setAOIntensity: (v) => { ao.configuration.intensity = v; },
    setAORadius: (v) => { ao.configuration.aoRadius = v; },
    render: (dt) => composer.render(dt),
    setSize: (w, h) => {
      composer.setSize(w, h);
      ao.setSize(w, h);
    },
  };
}
