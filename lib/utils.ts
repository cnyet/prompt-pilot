import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * 项目自定义字号（globals.css @theme 的 --text-*）默认会被 tailwind-merge
 * 当成文字颜色，与 text-accent / text-on-danger-fill 等冲突时把先出现的颜色
 * 丢掉。这里把它们登记回 font-size 组，颜色与字号不再互相覆盖。
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'caption',
            'label',
            'body',
            'body-lg',
            'h2',
            'h3',
            'display',
            'display-lg',
            'numeral-hero',
            'numeral-mega',
          ],
        },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
