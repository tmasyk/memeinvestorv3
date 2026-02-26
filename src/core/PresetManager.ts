export class PresetManager {
  private activePreset: string | null = null

  loadPreset(presetName: string): boolean {
    if (this.activePreset) {
      console.log(`[PresetManager] Unloading current preset: ${this.activePreset}`)
    }

    this.activePreset = presetName
    console.log(`[PresetManager] Loaded new preset: ${presetName}`)
    return true
  }

  getActivePreset(): string | null {
    return this.activePreset
  }
}
