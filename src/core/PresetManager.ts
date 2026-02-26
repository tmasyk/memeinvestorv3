import { IPresetConfig } from './types'
import { PRESETS } from '../config/presets'

export class PresetManager {
  private activePreset: IPresetConfig | null = null

  loadPreset(presetId: string): boolean {
    const preset = PRESETS[presetId]

    if (!preset) {
      throw new Error(`Preset with ID '${presetId}' not found.`)
    }

    if (this.activePreset) {
      console.log(`[PresetManager] Unloading current preset: ${this.activePreset.name}`)
    }

    this.activePreset = preset
    console.log(`[PresetManager] Successfully loaded preset: ${preset.name}`)
    return true
  }

  getActivePreset(): string | null {
    return this.activePreset ? this.activePreset.id : null
  }

  getActivePresetConfig(): IPresetConfig | null {
    return this.activePreset
  }
}
