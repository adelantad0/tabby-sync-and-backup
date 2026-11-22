import { en } from './en'
import { ru } from './ru'
import { zhCN } from './zh-cn'

export { en, ru, zhCN }

export type TranslationDict = typeof en

/**
 * Registers all supported translation dictionaries in Tabby's TranslateService
 */
export function registerTranslations(translate: any): void {
    if (!translate) return
    translate.setTranslation('en-US', en, true)
    translate.setTranslation('en', en, true)
    translate.setTranslation('ru-RU', ru, true)
    translate.setTranslation('ru', ru, true)
    translate.setTranslation('zh-CN', zhCN, true)
    translate.setTranslation('zh', zhCN, true)
}
