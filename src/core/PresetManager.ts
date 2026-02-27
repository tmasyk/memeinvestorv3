import { IPresetConfig } from './types'
import { PRESETS } from '../config/presets'
import { PrismaClient } from '@prisma/client'

export class PresetManager {
  private activePreset: IPresetConfig | null = null
  private prisma: PrismaClient

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma || new PrismaClient()
    this.initializePresets()
  }

  private async initializePresets() {
    await this.seedDefaultsIfNeeded()
  }

  // Updated loadPreset to handle DB or File
  async loadPreset(presetId: string): Promise<boolean> {
    // 1. Try to find in File Config (Hardcoded safety)
    let preset = PRESETS[presetId]

    // 2. If not in file, try DB
    if (!preset) {
      try {
        const dbPreset = await (this.prisma as any).preset.findUnique({ 
          where: { id: presetId } 
        })
        
        if (dbPreset) {
          // Parse JSON config if needed (though IPresetConfig structure is expected)
          // Assuming dbPreset.config is already a JS object if using Prisma Json type,
          // OR a string if stored as string. Prisma usually returns object for Json type.
          preset = typeof dbPreset.config === 'string' 
            ? JSON.parse(dbPreset.config) 
            : dbPreset.config
            
          // Ensure ID matches
          if (preset) preset.id = dbPreset.id
        }
      } catch (dbError) {
        console.warn(`[PresetManager] DB lookup failed for ${presetId}:`, dbError)
      }
    }
    
    if (!preset) {
      throw new Error(`Preset with ID '${presetId}' not found in File or DB.`)
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
  
  // Method to seed DB
  async seedDefaultsIfNeeded() {
    try {
      // Cast to any to avoid stale editor type errors (verified via npx tsc)
      const existingPresets = await (this.prisma as any).preset.findMany()
      
      if (existingPresets.length === 0) {
        console.log('[PresetManager] Preset table empty. Seeding defaults...')
        
        for (const [id, config] of Object.entries(PRESETS)) {
          // Ensure lowercase ID
          const lowerId = id.toLowerCase()
          
          await (this.prisma as any).preset.create({
            data: {
              id: lowerId,
              name: config.name,
              config: JSON.stringify(config) // Assuming schema has a Json field or similar
            }
          })
          console.log(`[PresetManager] Seeded preset: ${lowerId}`)
        }
      } else {
        console.log(`[PresetManager] Loaded ${existingPresets.length} presets from production DB.`)
      }
    } catch (error) {
      console.error('[PresetManager] Error seeding presets:', error)
    }
  }
}
