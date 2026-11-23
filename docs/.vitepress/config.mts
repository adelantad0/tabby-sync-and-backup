import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Tabby Sync & Backup',
  description: 'Two-in-one synchronization and automated backup tool for Tabby Terminal',
  base: '/tabby-sync-and-backup/',
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/tabby-sync-and-backup/logo.svg' }],
    ['meta', { name: 'theme-color', content: '#7c3aed' }]
  ],

  themeConfig: {
    logo: '/logo.svg',
    socialLinks: [
      { icon: 'github', link: 'https://github.com/adelantad0/tabby-sync-and-backup' }
    ],
    search: {
      provider: 'local',
      options: {
        locales: {
          ru: {
            translations: {
              button: {
                buttonText: 'Поиск',
                buttonAriaLabel: 'Поиск по документации'
              },
              modal: {
                noResultsText: 'Ничего не найдено',
                resetButtonTitle: 'Сбросить поиск',
                footer: {
                  selectText: 'выбрать',
                  navigateText: 'навигация',
                  closeText: 'закрыть'
                }
              }
            }
          },
          zh: {
            translations: {
              button: {
                buttonText: '搜索',
                buttonAriaLabel: '搜索文档'
              },
              modal: {
                noResultsText: '未找到相关结果',
                resetButtonTitle: '清除搜索',
                footer: {
                  selectText: '选择',
                  navigateText: '切换',
                  closeText: '关闭'
                }
              }
            }
          }
        }
      }
    }
  },

  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/guide/getting-started' },
          { text: 'Security', link: '/guide/security' },
          { text: 'Storage', link: '/guide/storage-providers' },
          { text: 'Backups', link: '/guide/backups' }
        ],
        sidebar: [
          {
            text: 'Overview',
            items: [
              { text: 'Getting Started', link: '/guide/getting-started' },
              { text: 'How Sync Works', link: '/guide/how-it-works' },
              { text: 'Security & Encryption', link: '/guide/security' }
            ]
          },
          {
            text: 'Guides',
            items: [
              { text: 'Storage Providers', link: '/guide/storage-providers' },
              { text: 'Backups & Recovery', link: '/guide/backups' }
            ]
          }
        ],
        footer: {
          message: 'Released under the MIT License.',
          copyright: 'Copyright © 2024-present adelantad0'
        }
      }
    },

    ru: {
      label: 'Русский',
      lang: 'ru-RU',
      link: '/ru/',
      themeConfig: {
        nav: [
          { text: 'Руководство', link: '/ru/guide/getting-started' },
          { text: 'Безопасность', link: '/ru/guide/security' },
          { text: 'Хранилища', link: '/ru/guide/storage-providers' },
          { text: 'Бэкапы', link: '/ru/guide/backups' }
        ],
        sidebar: [
          {
            text: 'Обзор',
            items: [
              { text: 'Быстрый старт', link: '/ru/guide/getting-started' },
              { text: 'Как устроена синхронизация', link: '/ru/guide/how-it-works' },
              { text: 'Безопасность и шифрование', link: '/ru/guide/security' }
            ]
          },
          {
            text: 'Инструкции',
            items: [
              { text: 'Настройка хранилищ', link: '/ru/guide/storage-providers' },
              { text: 'Резервные копии и откат', link: '/ru/guide/backups' }
            ]
          }
        ],
        outlineTitle: 'На этой странице',
        docFooter: {
          prev: 'Назад',
          next: 'Вперед'
        },
        footer: {
          message: 'Выпущено под лицензией MIT.',
          copyright: 'Copyright © 2024-наст. время adelantad0'
        }
      }
    },

    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      link: '/zh/',
      themeConfig: {
        nav: [
          { text: '指南', link: '/zh/guide/getting-started' },
          { text: '安全加密', link: '/zh/guide/security' },
          { text: '存储配置', link: '/zh/guide/storage-providers' },
          { text: '备份与恢复', link: '/zh/guide/backups' }
        ],
        sidebar: [
          {
            text: '概述',
            items: [
              { text: '快速开始', link: '/zh/guide/getting-started' },
              { text: '同步原理解析', link: '/zh/guide/how-it-works' },
              { text: '安全与加密保证', link: '/zh/guide/security' }
            ]
          },
          {
            text: '使用手册',
            items: [
              { text: '存储提供商设置', link: '/zh/guide/storage-providers' },
              { text: '备份管理与一键恢复', link: '/zh/guide/backups' }
            ]
          }
        ],
        outlineTitle: '本页导览',
        docFooter: {
          prev: '上一页',
          next: '下一页'
        },
        footer: {
          message: '基于 MIT 许可证开源。',
          copyright: 'Copyright © 2024-至今 adelantad0'
        }
      }
    }
  }
})
