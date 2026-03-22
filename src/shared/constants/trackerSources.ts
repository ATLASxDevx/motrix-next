/**
 * @fileoverview Tracker source URL options for BT tracker synchronization.
 *
 * Extracted from Advanced.vue to reduce component file size.
 * Contains grouped select options for ngosang/trackerslist and
 * XIU2/TrackersListCollection repositories.
 */
import { h } from 'vue'
import { NTag } from 'naive-ui'

/** Creates a label VNode with a CDN tag indicator. */
function cdnLabel(text: string) {
  return () =>
    h('span', {}, [
      h('span', {}, `${text} `),
      h(NTag, { size: 'tiny', type: 'warning', bordered: false }, { default: () => 'CDN' }),
    ])
}

export const trackerSourceOptions = [
  {
    type: 'group' as const,
    label: 'ngosang/trackerslist',
    key: 'ngosang',
    children: [
      {
        label: 'trackers_best.txt',
        value: 'https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best.txt',
      },
      {
        label: 'trackers_best_ip.txt',
        value: 'https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best_ip.txt',
      },
      {
        label: 'trackers_all.txt',
        value: 'https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_all.txt',
      },
      {
        label: 'trackers_all_ip.txt',
        value: 'https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_all_ip.txt',
      },
      {
        label: cdnLabel('trackers_best.txt'),
        value: 'https://cdn.jsdelivr.net/gh/ngosang/trackerslist/trackers_best.txt',
      },
      {
        label: cdnLabel('trackers_best_ip.txt'),
        value: 'https://cdn.jsdelivr.net/gh/ngosang/trackerslist/trackers_best_ip.txt',
      },
      {
        label: cdnLabel('trackers_all.txt'),
        value: 'https://cdn.jsdelivr.net/gh/ngosang/trackerslist/trackers_all.txt',
      },
      {
        label: cdnLabel('trackers_all_ip.txt'),
        value: 'https://cdn.jsdelivr.net/gh/ngosang/trackerslist/trackers_all_ip.txt',
      },
    ],
  },
  {
    type: 'group' as const,
    label: 'XIU2/TrackersListCollection',
    key: 'xiu2',
    children: [
      { label: 'best.txt', value: 'https://raw.githubusercontent.com/XIU2/TrackersListCollection/master/best.txt' },
      { label: 'all.txt', value: 'https://raw.githubusercontent.com/XIU2/TrackersListCollection/master/all.txt' },
      { label: 'http.txt', value: 'https://raw.githubusercontent.com/XIU2/TrackersListCollection/master/http.txt' },
      {
        label: cdnLabel('best.txt'),
        value: 'https://cdn.jsdelivr.net/gh/XIU2/TrackersListCollection/best.txt',
      },
      {
        label: cdnLabel('all.txt'),
        value: 'https://cdn.jsdelivr.net/gh/XIU2/TrackersListCollection/all.txt',
      },
      {
        label: cdnLabel('http.txt'),
        value: 'https://cdn.jsdelivr.net/gh/XIU2/TrackersListCollection/http.txt',
      },
    ],
  },
]
