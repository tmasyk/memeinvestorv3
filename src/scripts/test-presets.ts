import { PresetManager } from '../core/PresetManager'

async function main() {
  console.log('=== Testing Preset Manager ===')
  const presetManager = new PresetManager()

  // Step 1: Load Degen Mode
  console.log('\n--- Step 1: Loading Degen Mode ---')
  presetManager.loadPreset('degen_scalp')
  
  const degenConfig = presetManager.getActivePresetConfig()
  if (degenConfig) {
    const minLiquidity = degenConfig.filters.find(f => f.name === 'MinLiquidity')?.params.minUsd
    console.log(`[Test] Active Preset: ${degenConfig.name} | Target Liquidity: $${minLiquidity}`)
  } else {
    console.error('[Test] Failed to load degen_scalp config')
  }

  // Step 2: Load Bluechip Mode
  console.log('\n--- Step 2: Loading Bluechip Mode ---')
  presetManager.loadPreset('bluechip_safe')

  const bluechipConfig = presetManager.getActivePresetConfig()
  if (bluechipConfig) {
    const minLiquidity = bluechipConfig.filters.find(f => f.name === 'MinLiquidity')?.params.minUsd
    console.log(`[Test] Active Preset: ${bluechipConfig.name} | Target Liquidity: $${minLiquidity}`)
  } else {
    console.error('[Test] Failed to load bluechip_safe config')
  }

  // Step 3: The Error Trap
  console.log('\n--- Step 3: Error Trap Test ---')
  try {
    presetManager.loadPreset('moon_boy_rug')
    console.error('[Test] FAILED: Should have thrown an error for invalid preset')
  } catch (error: any) {
    console.log(`[Test] Caught expected error: ${error.message}`)
  }
}

main()
