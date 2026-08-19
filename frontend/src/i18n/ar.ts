import type { Dictionary } from './dictionary';

/**
 * Modern Standard Arabic.
 *
 * Strings are stored in *logical* order — sentence-final punctuation is written
 * last, as the last character of the string, even though the bidi algorithm
 * renders it on the left. Do not reorder characters to match what an editor
 * shows visually.
 *
 * Drafted to establish structure; every string should be reviewed by a native
 * speaker before release.
 */
export const ar: Dictionary = {
  app: {
    title: 'مخطط الرحلات',
  },
  language: {
    switcherLabel: 'اللغة',
  },
  status: {
    checkingBackend: 'جارٍ الاتصال بخدمة تخطيط الرحلات…',
    backendReachable: 'خدمة تخطيط الرحلات متاحة.',
    backendUnreachable: 'خدمة تخطيط الرحلات غير متاحة.',
    availableDates: {
      zero: 'لا تتوفر بيانات جداول زمنية.',
      one: 'تغطي بيانات الجداول الزمنية يومًا واحدًا، {first}.',
      two: 'تغطي بيانات الجداول الزمنية يومين، من {first} إلى {last}.',
      few: 'تغطي بيانات الجداول الزمنية {count} أيام، من {first} إلى {last}.',
      many: 'تغطي بيانات الجداول الزمنية {count} يومًا، من {first} إلى {last}.',
      other: 'تغطي بيانات الجداول الزمنية {count} يوم، من {first} إلى {last}.',
    },
  },
};
